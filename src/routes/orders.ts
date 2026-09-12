import { Hono } from "hono";
import { HttpError } from "../lib/errors";
import { createOrder } from "../services/orders";

export const orderRoutes = new Hono();

orderRoutes.post("/orders", async (c) => {
  const body = await c.req.json();

  if (body.lines !== undefined) {
    throw new HttpError(
      400,
      "Payload field 'lines' is no longer accepted (API v1.1). Use 'crates' with per-crate 'fills' instead.",
      "VALIDATION",
    );
  }

  const result = await createOrder({
    customerName: body.customerName,
    customerPhone: body.customerPhone,
    crates: body.crates ?? [],
  });
  return c.json(result, 201);
});
