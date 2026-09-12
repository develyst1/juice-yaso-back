import { Hono } from "hono";
import { approveSlip, rejectSlip } from "../../services/slips";

export const adminSlipRoutes = new Hono();

adminSlipRoutes.post("/slips/:slipId/approve", async (c) => {
  const slipId = c.req.param("slipId");
  const result = await approveSlip(slipId);
  return c.json(result);
});

adminSlipRoutes.post("/slips/:slipId/reject", async (c) => {
  const slipId = c.req.param("slipId");
  const body = await c.req.json();
  const result = await rejectSlip(slipId, body.reason ?? "");
  return c.json(result);
});
