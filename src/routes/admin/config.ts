import { Hono } from "hono";
import {
  getPaymentChannel,
  getPricing,
  updatePaymentChannel,
  updatePricing,
} from "../../services/config";

export const adminConfigRoutes = new Hono();

adminConfigRoutes.get("/config/pricing", async (c) => {
  return c.json(await getPricing());
});

adminConfigRoutes.put("/config/pricing", async (c) => {
  const body = await c.req.json();
  const result = await updatePricing({
    basePricePerCup: Number(body.basePricePerCup),
    bulkThresholdCups: Number(body.bulkThresholdCups),
    bulkPricePerCup: Number(body.bulkPricePerCup),
  });
  return c.json(result);
});

adminConfigRoutes.get("/config/payment-channel", async (c) => {
  return c.json(await getPaymentChannel());
});

adminConfigRoutes.put("/config/payment-channel", async (c) => {
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const body = await c.req.parseBody();
    const qr = body["qr"] ?? body["qrImage"] ?? body["file"];
    const result = await updatePaymentChannel({
      bankAccountNumber:
        typeof body["bankAccountNumber"] === "string"
          ? body["bankAccountNumber"]
          : undefined,
      bankName:
        typeof body["bankName"] === "string" ? body["bankName"] : undefined,
      qrFile: qr instanceof File ? qr : null,
    });
    return c.json(result);
  }

  const body = await c.req.json();
  const result = await updatePaymentChannel({
    bankAccountNumber: body.bankAccountNumber,
    bankName: body.bankName,
  });
  return c.json(result);
});
