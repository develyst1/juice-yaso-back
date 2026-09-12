import { eq } from "drizzle-orm";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { db } from "../db";
import { orders, paymentSlips } from "../db/schema";
import { HttpError } from "../lib/errors";
import { SLIP_UPLOADABLE, type OrderStatus } from "../lib/statuses";
import { transitionOrder } from "./status";

const UPLOAD_DIR = path.resolve("uploads");

async function ensureUploadDir() {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

export async function saveUpload(
  file: File,
  prefix: string,
): Promise<{ fileUrl: string; absPath: string }> {
  await ensureUploadDir();
  const ext = path.extname(file.name) || ".bin";
  const safeExt = ext.slice(0, 10);
  const name = `${prefix}-${crypto.randomUUID()}${safeExt}`;
  const absPath = path.join(UPLOAD_DIR, name);
  const buf = Buffer.from(await file.arrayBuffer());
  await Bun.write(absPath, buf);
  return { fileUrl: `/uploads/${name}`, absPath };
}

export async function uploadSlip(queueCode: string, file: File | null) {
  if (!file) {
    throw new HttpError(400, "file is required", "VALIDATION");
  }
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|gif|webp)$/i.test(file.name)) {
    throw new HttpError(400, "file must be an image", "VALIDATION");
  }

  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.queueCode, queueCode))
    .limit(1);
  const order = rows[0];
  if (!order) throw new HttpError(404, "Order not found", "NOT_FOUND");

  const from = order.status as OrderStatus;
  if (!SLIP_UPLOADABLE.has(from)) {
    throw new HttpError(
      403,
      `Cannot upload slip in status ${from}`,
      "NOT_ALLOWED",
    );
  }

  const { fileUrl } = await saveUpload(file, `slip-${order.queueCode}`);

  const [slip] = await db
    .insert(paymentSlips)
    .values({
      orderId: order.id,
      fileUrl,
      status: "pending",
    })
    .returning();

  if (!slip) throw new HttpError(500, "Failed to save slip");

  await transitionOrder({
    orderId: order.id,
    from,
    to: "awaiting_slip_review",
    actor: "customer",
    extra: { slipRejectReason: null },
  });

  return { status: "awaiting_slip_review" as const, slipId: slip.id };
}

export async function approveSlip(slipId: string) {
  const slips = await db
    .select()
    .from(paymentSlips)
    .where(eq(paymentSlips.id, slipId))
    .limit(1);
  const slip = slips[0];
  if (!slip) throw new HttpError(404, "Slip not found", "NOT_FOUND");
  if (slip.status !== "pending") {
    throw new HttpError(409, "Slip already reviewed", "ALREADY_REVIEWED");
  }

  const orderRows = await db
    .select()
    .from(orders)
    .where(eq(orders.id, slip.orderId))
    .limit(1);
  const order = orderRows[0];
  if (!order) throw new HttpError(404, "Order not found", "NOT_FOUND");

  const from = order.status as OrderStatus;
  if (from !== "awaiting_slip_review") {
    throw new HttpError(
      409,
      `Order is not awaiting slip review (${from})`,
      "INVALID_STATE",
    );
  }

  const now = new Date();
  await db
    .update(paymentSlips)
    .set({ status: "approved", reviewedAt: now })
    .where(eq(paymentSlips.id, slip.id));

  await transitionOrder({
    orderId: order.id,
    from,
    to: "in_queue",
    actor: "admin",
    extra: { slipRejectReason: null },
  });

  return { orderId: order.id, status: "in_queue" as const };
}

export async function rejectSlip(slipId: string, reason: string) {
  const trimmed = reason?.trim() ?? "";
  if (!trimmed) {
    throw new HttpError(400, "reason is required", "VALIDATION");
  }

  const slips = await db
    .select()
    .from(paymentSlips)
    .where(eq(paymentSlips.id, slipId))
    .limit(1);
  const slip = slips[0];
  if (!slip) throw new HttpError(404, "Slip not found", "NOT_FOUND");
  if (slip.status !== "pending") {
    throw new HttpError(409, "Slip already reviewed", "ALREADY_REVIEWED");
  }

  const orderRows = await db
    .select()
    .from(orders)
    .where(eq(orders.id, slip.orderId))
    .limit(1);
  const order = orderRows[0];
  if (!order) throw new HttpError(404, "Order not found", "NOT_FOUND");

  const from = order.status as OrderStatus;
  if (from !== "awaiting_slip_review") {
    throw new HttpError(
      409,
      `Order is not awaiting slip review (${from})`,
      "INVALID_STATE",
    );
  }

  const now = new Date();
  await db
    .update(paymentSlips)
    .set({
      status: "rejected",
      rejectReason: trimmed,
      reviewedAt: now,
    })
    .where(eq(paymentSlips.id, slip.id));

  await transitionOrder({
    orderId: order.id,
    from,
    to: "slip_rejected",
    actor: "admin",
    extra: { slipRejectReason: trimmed },
  });

  return { orderId: order.id, status: "slip_rejected" as const, reason: trimmed };
}
