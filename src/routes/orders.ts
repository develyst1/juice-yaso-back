import { Hono } from "hono";
import { createOrder } from "../services/orders";

export const orderRoutes = new Hono();

orderRoutes.post("/orders", async (c) => {
  const body = await c.req.json();
  const result = await createOrder({
    customerName: body.customerName,
    customerPhone: body.customerPhone,
    lines: body.lines ?? [],
  });
  return c.json(result, 201);
});
