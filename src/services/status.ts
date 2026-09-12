import { eq } from "drizzle-orm";
import { db } from "../db";
import { orderStatusEvents, orders } from "../db/schema";
import {
  assertTransition,
  type Actor,
  type OrderStatus,
} from "../lib/statuses";

export async function transitionOrder(opts: {
  orderId: string;
  from: OrderStatus;
  to: OrderStatus;
  actor: Actor;
  extra?: Partial<typeof orders.$inferInsert>;
}) {
  assertTransition(opts.from, opts.to);
  const now = new Date();
  await db
    .update(orders)
    .set({
      status: opts.to,
      updatedAt: now,
      ...opts.extra,
    })
    .where(eq(orders.id, opts.orderId));

  await db.insert(orderStatusEvents).values({
    orderId: opts.orderId,
    fromStatus: opts.from,
    toStatus: opts.to,
    at: now,
    actor: opts.actor,
  });
}
