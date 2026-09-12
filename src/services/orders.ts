import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  flavors,
  orderCrateFills,
  orderCrates,
  orderStatusEvents,
  orders,
  paymentSlips,
} from "../db/schema";
import { HttpError } from "../lib/errors";
import {
  DEPOSIT_BY_SIZE,
  isCrateSize,
  money,
  normalizeFlavor,
  unitPriceForCups,
  type CrateSize,
} from "../lib/pricing";
import { generateQueueCode } from "../lib/queue-code";
import {
  ADMIN_PATCHABLE,
  CANCELABLE,
  type AdminPatchStatus,
  type OrderStatus,
} from "../lib/statuses";
import { getPaymentChannel, getPricing } from "./catalog";
import { transitionOrder } from "./status";

const PHONE_RE = /^0\d{9}$/;

export type CreateOrderFillInput = {
  flavor: string;
  cups: number;
};

export type CreateOrderCrateInput = {
  crateSize: number;
  fills: CreateOrderFillInput[];
};

export type CreateOrderInput = {
  customerName: string;
  customerPhone: string;
  crates: CreateOrderCrateInput[];
};

export type CrateView = {
  crateSize: number;
  deposit: number;
  fills: { flavor: string; cups: number }[];
};

async function loadCratesForOrders(
  orderIds: string[],
): Promise<Map<string, CrateView[]>> {
  const result = new Map<string, CrateView[]>();
  if (orderIds.length === 0) return result;

  const crateRows = await db
    .select()
    .from(orderCrates)
    .where(inArray(orderCrates.orderId, orderIds));

  const crateIds = crateRows.map((c) => c.id);
  const fillRows =
    crateIds.length === 0
      ? []
      : await db
          .select()
          .from(orderCrateFills)
          .where(inArray(orderCrateFills.crateId, crateIds));

  const fillsByCrate = new Map<string, { flavor: string; cups: number }[]>();
  for (const f of fillRows) {
    const list = fillsByCrate.get(f.crateId) ?? [];
    list.push({ flavor: f.flavorCode, cups: f.cups });
    fillsByCrate.set(f.crateId, list);
  }

  for (const c of crateRows) {
    const list = result.get(c.orderId) ?? [];
    list.push({
      crateSize: c.crateSize,
      deposit: Number(c.lineDeposit),
      fills: fillsByCrate.get(c.id) ?? [],
    });
    result.set(c.orderId, list);
  }
  return result;
}

export async function createOrder(input: CreateOrderInput) {
  const customerName = input.customerName?.trim() ?? "";
  const customerPhone = input.customerPhone?.trim() ?? "";
  if (!customerName) {
    throw new HttpError(400, "customerName must be non-empty", "VALIDATION");
  }
  if (!PHONE_RE.test(customerPhone)) {
    throw new HttpError(
      400,
      "customerPhone must match ^0\\d{9}$ (10 digits starting with 0)",
      "VALIDATION",
    );
  }
  if (!input.crates || input.crates.length < 1) {
    throw new HttpError(400, "At least one crate is required", "VALIDATION");
  }

  const flavorRows = await db.select().from(flavors);
  const known = new Set(flavorRows.map((f) => f.code));

  const parsed: {
    crateSize: CrateSize;
    lineDeposit: number;
    fills: { flavorCode: string; cups: number }[];
  }[] = [];

  for (const crate of input.crates) {
    if (!isCrateSize(crate.crateSize)) {
      throw new HttpError(
        400,
        `Invalid crateSize: ${crate.crateSize}`,
        "VALIDATION",
      );
    }
    if (!Array.isArray(crate.fills) || crate.fills.length < 1) {
      throw new HttpError(
        400,
        "Each crate must have at least one fill",
        "VALIDATION",
      );
    }

    const seenFlavors = new Set<string>();
    const fills: { flavorCode: string; cups: number }[] = [];
    let cupsSum = 0;

    for (const fill of crate.fills) {
      if (!Number.isInteger(fill.cups) || fill.cups <= 0) {
        throw new HttpError(
          400,
          "fills.cups must be an integer > 0",
          "VALIDATION",
        );
      }
      const flavorCode = normalizeFlavor(fill.flavor);
      if (!flavorCode || !known.has(flavorCode)) {
        throw new HttpError(
          400,
          `Unknown flavor: ${fill.flavor}`,
          "VALIDATION",
        );
      }
      if (seenFlavors.has(flavorCode)) {
        throw new HttpError(
          400,
          `Duplicate flavor in crate: ${flavorCode}`,
          "VALIDATION",
        );
      }
      seenFlavors.add(flavorCode);
      fills.push({ flavorCode, cups: fill.cups });
      cupsSum += fill.cups;
    }

    if (cupsSum !== crate.crateSize) {
      throw new HttpError(
        400,
        `Sum of fills.cups (${cupsSum}) must equal crateSize (${crate.crateSize})`,
        "VALIDATION",
      );
    }

    parsed.push({
      crateSize: crate.crateSize,
      lineDeposit: DEPOSIT_BY_SIZE[crate.crateSize],
      fills,
    });
  }

  const cupsTotal = parsed.reduce((s, c) => s + c.crateSize, 0);
  const depositTotal = parsed.reduce((s, c) => s + c.lineDeposit, 0);

  const pricing = await getPricing();
  const unitPriceApplied = unitPriceForCups(cupsTotal, pricing);
  const productTotal = cupsTotal * unitPriceApplied;
  const paymentChannel = await getPaymentChannel();

  let queueCode = generateQueueCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.queueCode, queueCode))
      .limit(1);
    if (clash.length === 0) break;
    queueCode = generateQueueCode();
  }

  const now = new Date();
  const [order] = await db
    .insert(orders)
    .values({
      queueCode,
      customerName,
      customerPhone,
      status: "awaiting_payment",
      cupsTotal,
      productTotal: money(productTotal),
      depositTotal: money(depositTotal),
      unitPriceApplied: money(unitPriceApplied),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!order) throw new HttpError(500, "Failed to create order");

  for (const crate of parsed) {
    const [crateRow] = await db
      .insert(orderCrates)
      .values({
        orderId: order.id,
        crateSize: crate.crateSize,
        lineDeposit: money(crate.lineDeposit),
      })
      .returning();
    if (!crateRow) throw new HttpError(500, "Failed to create order crate");

    await db.insert(orderCrateFills).values(
      crate.fills.map((f) => ({
        crateId: crateRow.id,
        flavorCode: f.flavorCode,
        cups: f.cups,
      })),
    );
  }

  await db.insert(orderStatusEvents).values({
    orderId: order.id,
    fromStatus: null,
    toStatus: "awaiting_payment",
    at: now,
    actor: "customer",
  });

  return {
    orderId: order.id,
    queueCode: order.queueCode,
    status: "awaiting_payment" as const,
    cupsTotal,
    productTotal,
    depositTotal,
    paymentChannel,
  };
}

export async function getOrderByQueueCode(queueCode: string) {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.queueCode, queueCode))
    .limit(1);
  const order = rows[0];
  if (!order) throw new HttpError(404, "Order not found", "NOT_FOUND");

  const cratesByOrder = await loadCratesForOrders([order.id]);
  const crates = cratesByOrder.get(order.id) ?? [];

  const status = order.status as OrderStatus;
  const showPayment =
    status === "awaiting_payment" || status === "slip_rejected";

  const paymentChannel = showPayment ? await getPaymentChannel() : undefined;

  return {
    orderId: order.id,
    queueCode: order.queueCode,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    status,
    cupsTotal: order.cupsTotal,
    productTotal: Number(order.productTotal),
    depositTotal: Number(order.depositTotal),
    unitPriceApplied: Number(order.unitPriceApplied),
    slipRejectReason: order.slipRejectReason,
    crates,
    ...(paymentChannel ? { paymentChannel } : {}),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    depositReturnedAt: order.depositReturnedAt?.toISOString() ?? null,
    cratesReturnedAt: order.cratesReturnedAt?.toISOString() ?? null,
  };
}

export async function cancelByQueueCode(queueCode: string) {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.queueCode, queueCode))
    .limit(1);
  const order = rows[0];
  if (!order) throw new HttpError(404, "Order not found", "NOT_FOUND");

  const from = order.status as OrderStatus;
  if (!CANCELABLE.has(from)) {
    throw new HttpError(403, "Order cannot be cancelled", "NOT_CANCELABLE");
  }

  await transitionOrder({
    orderId: order.id,
    from,
    to: "cancelled",
    actor: "customer",
    extra: { cancelledAt: new Date() },
  });

  return { status: "cancelled" as const };
}

export async function patchOrderStatus(
  orderId: string,
  status: AdminPatchStatus,
) {
  if (!(ADMIN_PATCHABLE as readonly string[]).includes(status)) {
    throw new HttpError(400, "Invalid target status", "VALIDATION");
  }

  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  const order = rows[0];
  if (!order) throw new HttpError(404, "Order not found", "NOT_FOUND");

  const from = order.status as OrderStatus;
  await transitionOrder({
    orderId: order.id,
    from,
    to: status,
    actor: "admin",
  });

  return { orderId: order.id, status };
}

export async function listAdminOrders(statusFilter?: string) {
  const rows = statusFilter
    ? await db
        .select()
        .from(orders)
        .where(eq(orders.status, statusFilter))
        .orderBy(desc(orders.createdAt))
    : await db.select().from(orders).orderBy(desc(orders.createdAt));

  const slips = await db
    .select()
    .from(paymentSlips)
    .orderBy(desc(paymentSlips.createdAt));
  const pendingByOrder = new Map<string, string>();
  for (const s of slips) {
    if (s.status === "pending" && !pendingByOrder.has(s.orderId)) {
      pendingByOrder.set(s.orderId, s.id);
    }
  }

  const cratesByOrder = await loadCratesForOrders(rows.map((o) => o.id));

  return {
    orders: rows.map((o) => ({
      orderId: o.id,
      queueCode: o.queueCode,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      status: o.status,
      cupsTotal: o.cupsTotal,
      productTotal: Number(o.productTotal),
      depositTotal: Number(o.depositTotal),
      slipRejectReason: o.slipRejectReason,
      pendingSlipId: pendingByOrder.get(o.id) ?? null,
      crates: cratesByOrder.get(o.id) ?? [],
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    })),
  };
}
