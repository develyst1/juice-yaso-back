import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  flavors,
  orderLines,
  orderStatusEvents,
  orders,
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

export type CreateOrderLineInput = {
  crateSize: number;
  quantity: number;
  flavor: string;
};

export type CreateOrderInput = {
  customerName: string;
  customerPhone: string;
  lines: CreateOrderLineInput[];
};

export async function createOrder(input: CreateOrderInput) {
  const customerName = input.customerName?.trim() ?? "";
  const customerPhone = input.customerPhone?.trim() ?? "";
  if (!customerName || !customerPhone) {
    throw new HttpError(
      400,
      "customerName and customerPhone are required",
      "VALIDATION",
    );
  }
  if (!input.lines || input.lines.length < 1) {
    throw new HttpError(400, "At least one line is required", "VALIDATION");
  }

  const flavorRows = await db.select().from(flavors);
  const known = new Set(flavorRows.map((f) => f.code));

  const parsed: {
    crateSize: CrateSize;
    quantity: number;
    flavorCode: string;
    lineCups: number;
    lineDeposit: number;
  }[] = [];

  for (const line of input.lines) {
    if (!isCrateSize(line.crateSize)) {
      throw new HttpError(
        400,
        `Invalid crateSize: ${line.crateSize}`,
        "VALIDATION",
      );
    }
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new HttpError(400, "quantity must be an integer > 0", "VALIDATION");
    }
    const flavorCode = normalizeFlavor(line.flavor);
    if (!flavorCode || !known.has(flavorCode)) {
      throw new HttpError(400, `Unknown flavor: ${line.flavor}`, "VALIDATION");
    }
    const lineCups = line.crateSize * line.quantity;
    const lineDeposit = DEPOSIT_BY_SIZE[line.crateSize] * line.quantity;
    parsed.push({
      crateSize: line.crateSize,
      quantity: line.quantity,
      flavorCode,
      lineCups,
      lineDeposit,
    });
  }

  const cupsTotal = parsed.reduce((s, l) => s + l.lineCups, 0);
  const depositTotal = parsed.reduce((s, l) => s + l.lineDeposit, 0);

  // Snapshot current pricing — config changes affect new orders only
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

  await db.insert(orderLines).values(
    parsed.map((l) => ({
      orderId: order.id,
      crateSize: l.crateSize,
      quantity: l.quantity,
      flavorCode: l.flavorCode,
      lineCups: l.lineCups,
      lineDeposit: money(l.lineDeposit),
    })),
  );

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

  const lines = await db
    .select()
    .from(orderLines)
    .where(eq(orderLines.orderId, order.id));

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
    lines: lines.map((l) => ({
      crateSize: l.crateSize,
      quantity: l.quantity,
      flavor: l.flavorCode,
      lineCups: l.lineCups,
      lineDeposit: Number(l.lineDeposit),
    })),
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
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    })),
  };
}
