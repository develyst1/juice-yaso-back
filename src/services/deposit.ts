import { eq } from "drizzle-orm";
import { db } from "../db";
import { depositReturns, orders } from "../db/schema";
import { HttpError } from "../lib/errors";

export async function recordDepositReturn(
  orderId: string,
  cratesReturned: boolean,
) {
  if (cratesReturned !== true) {
    throw new HttpError(
      400,
      "cratesReturned must be true to return deposit",
      "VALIDATION",
    );
  }

  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  const order = rows[0];
  if (!order) throw new HttpError(404, "Order not found", "NOT_FOUND");

  if (order.depositReturnedAt) {
    throw new HttpError(409, "Deposit already returned", "ALREADY_RETURNED");
  }

  const now = new Date();
  const cratesAt = order.cratesReturnedAt ?? now;

  await db
    .update(orders)
    .set({
      cratesReturnedAt: cratesAt,
      depositReturnedAt: now,
      updatedAt: now,
    })
    .where(eq(orders.id, order.id));

  const [ret] = await db
    .insert(depositReturns)
    .values({
      orderId: order.id,
      returnedAt: now,
      amount: order.depositTotal,
      note: "crates returned",
    })
    .returning();

  return {
    orderId: order.id,
    amount: Number(order.depositTotal),
    returnedAt: now.toISOString(),
    cratesReturnedAt: cratesAt.toISOString(),
    depositReturnId: ret?.id,
  };
}
