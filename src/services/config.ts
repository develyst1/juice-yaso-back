import { eq } from "drizzle-orm";
import { db } from "../db";
import { paymentChannelConfig, pricingConfig } from "../db/schema";
import { HttpError } from "../lib/errors";
import { money, num } from "../lib/pricing";
import { getPaymentChannel, getPricing } from "./catalog";
import { saveUpload } from "./slips";

export async function updatePricing(body: {
  basePricePerCup: number;
  bulkThresholdCups: number;
  bulkPricePerCup: number;
}) {
  const { basePricePerCup, bulkThresholdCups, bulkPricePerCup } = body;
  if (
    !(basePricePerCup > 0) ||
    !(bulkPricePerCup > 0) ||
    !Number.isInteger(bulkThresholdCups) ||
    bulkThresholdCups <= 0
  ) {
    throw new HttpError(400, "Invalid pricing values", "VALIDATION");
  }

  const now = new Date();
  await db
    .update(pricingConfig)
    .set({
      basePricePerCup: money(basePricePerCup),
      bulkThresholdCups,
      bulkPricePerCup: money(bulkPricePerCup),
      updatedAt: now,
    })
    .where(eq(pricingConfig.id, 1));

  return getPricing();
}

export async function updatePaymentChannel(opts: {
  bankAccountNumber?: string;
  bankName?: string;
  qrFile?: File | null;
}) {
  const current = await getPaymentChannel();
  const bankAccountNumber =
    opts.bankAccountNumber?.trim() || current.bankAccountNumber;
  const bankName = opts.bankName?.trim() || current.bankName;

  if (!bankAccountNumber || !bankName) {
    throw new HttpError(
      400,
      "bankAccountNumber and bankName are required",
      "VALIDATION",
    );
  }

  let qrImageUrl = current.qrImageUrl;
  if (opts.qrFile) {
    const saved = await saveUpload(opts.qrFile, "qr");
    qrImageUrl = saved.fileUrl;
  }

  const now = new Date();
  await db
    .update(paymentChannelConfig)
    .set({
      bankAccountNumber,
      bankName,
      qrImageUrl,
      updatedAt: now,
    })
    .where(eq(paymentChannelConfig.id, 1));

  return getPaymentChannel();
}

export { getPricing, getPaymentChannel, num };
