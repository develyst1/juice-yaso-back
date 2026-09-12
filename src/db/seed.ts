import { eq } from "drizzle-orm";
import { db } from "./index";
import {
  flavors,
  paymentChannelConfig,
  pricingConfig,
} from "./schema";

const FLAVOR_SEED = [
  { code: "orange", nameTh: "ส้ม" },
  { code: "grape", nameTh: "องุ่น" },
  { code: "cocoa", nameTh: "โกโก้" },
  { code: "lychee", nameTh: "ลิ้นจี่" },
  { code: "blueberry", nameTh: "บลูเบอร์รี่" },
] as const;

async function seed() {
  for (const f of FLAVOR_SEED) {
    await db
      .insert(flavors)
      .values(f)
      .onConflictDoUpdate({
        target: flavors.code,
        set: { nameTh: f.nameTh },
      });
  }

  const existingPricing = await db
    .select()
    .from(pricingConfig)
    .where(eq(pricingConfig.id, 1))
    .limit(1);

  if (existingPricing.length === 0) {
    await db.insert(pricingConfig).values({
      id: 1,
      basePricePerCup: "5.00",
      bulkThresholdCups: 100,
      bulkPricePerCup: "4.50",
      updatedAt: new Date(),
    });
  }

  const existingPay = await db
    .select()
    .from(paymentChannelConfig)
    .where(eq(paymentChannelConfig.id, 1))
    .limit(1);

  if (existingPay.length === 0) {
    await db.insert(paymentChannelConfig).values({
      id: 1,
      bankAccountNumber: "000-0-00000-0",
      bankName: "ตัวอย่างธนาคาร",
      qrImageUrl: null,
      updatedAt: new Date(),
    });
  }

  console.log("Seed complete: 5 flavors, pricing 5/100/4.5, payment channel defaults.");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
