import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  flavors,
  paymentChannelConfig,
  pricingConfig,
} from "../db/schema";
import {
  CRATE_SIZES,
  DEPOSIT_BY_SIZE,
  num,
  type PricingSnapshot,
} from "../lib/pricing";
import { HttpError } from "../lib/errors";

export async function getPricing(): Promise<PricingSnapshot> {
  const rows = await db
    .select()
    .from(pricingConfig)
    .where(eq(pricingConfig.id, 1))
    .limit(1);
  const row = rows[0];
  if (!row) throw new HttpError(500, "Pricing config missing", "CONFIG_MISSING");
  return {
    basePricePerCup: num(row.basePricePerCup),
    bulkThresholdCups: row.bulkThresholdCups,
    bulkPricePerCup: num(row.bulkPricePerCup),
  };
}

export async function getPaymentChannel() {
  const rows = await db
    .select()
    .from(paymentChannelConfig)
    .where(eq(paymentChannelConfig.id, 1))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new HttpError(500, "Payment channel config missing", "CONFIG_MISSING");
  }
  return {
    qrImageUrl: row.qrImageUrl,
    bankAccountNumber: row.bankAccountNumber,
    bankName: row.bankName,
  };
}

export async function getCatalog() {
  const flavorRows = await db.select().from(flavors);
  const pricing = await getPricing();
  const paymentChannel = await getPaymentChannel();

  return {
    flavors: flavorRows.map((f) => ({
      code: f.code,
      nameTh: f.nameTh,
    })),
    crateSizes: [...CRATE_SIZES],
    depositBySize: { ...DEPOSIT_BY_SIZE },
    pricing: {
      basePricePerCup: pricing.basePricePerCup,
      bulkThresholdCups: pricing.bulkThresholdCups,
      bulkPricePerCup: pricing.bulkPricePerCup,
    },
    paymentChannel,
  };
}
