import { Hono } from "hono";
import {
  cancelByQueueCode,
  getOrderByQueueCode,
} from "../services/orders";
import { uploadSlip } from "../services/slips";

export const queueRoutes = new Hono();

queueRoutes.get("/queue/:queueCode", async (c) => {
  const queueCode = c.req.param("queueCode");
  const order = await getOrderByQueueCode(queueCode);
  return c.json(order);
});

queueRoutes.post("/queue/:queueCode/slips", async (c) => {
  const queueCode = c.req.param("queueCode");
  const body = await c.req.parseBody();
  const file = body["file"];
  const result = await uploadSlip(
    queueCode,
    file instanceof File ? file : null,
  );
  return c.json(result);
});

queueRoutes.post("/queue/:queueCode/cancel", async (c) => {
  const queueCode = c.req.param("queueCode");
  const result = await cancelByQueueCode(queueCode);
  return c.json(result);
});
