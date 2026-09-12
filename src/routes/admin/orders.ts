import { Hono } from "hono";
import { recordDepositReturn } from "../../services/deposit";
import {
  listAdminOrders,
  patchOrderStatus,
} from "../../services/orders";
import type { AdminPatchStatus } from "../../lib/statuses";

export const adminOrderRoutes = new Hono();

adminOrderRoutes.get("/orders", async (c) => {
  const status = c.req.query("status");
  const result = await listAdminOrders(status);
  return c.json(result);
});

adminOrderRoutes.patch("/orders/:orderId/status", async (c) => {
  const orderId = c.req.param("orderId");
  const body = await c.req.json();
  const result = await patchOrderStatus(
    orderId,
    body.status as AdminPatchStatus,
  );
  return c.json(result);
});

adminOrderRoutes.post("/orders/:orderId/deposit-returns", async (c) => {
  const orderId = c.req.param("orderId");
  const body = await c.req.json();
  const result = await recordDepositReturn(orderId, body.cratesReturned);
  return c.json(result);
});
