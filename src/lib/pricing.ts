/** Locked deposit map (domain.md) — not admin-config in v1 */
export const CRATE_SIZES = [30, 50, 60, 100] as const;
export type CrateSize = (typeof CRATE_SIZES)[number];

export const DEPOSIT_BY_SIZE: Record<CrateSize, number> = {
  30: 50,
  50: 90,
  60: 90,
  100: 150,
};

export const FLAVOR_CODES = [
  "orange",
  "grape",
  "cocoa",
  "lychee",
  "blueberry",
] as const;
export type FlavorCode = (typeof FLAVOR_CODES)[number];

const TH_TO_CODE: Record<string, FlavorCode> = {
  ส้ม: "orange",
  องุ่น: "grape",
  โกโก้: "cocoa",
  ลิ้นจี่: "lychee",
  บลูเบอร์รี่: "blueberry",
};

export function normalizeFlavor(input: string): FlavorCode | null {
  const raw = input.trim().toLowerCase();
  if ((FLAVOR_CODES as readonly string[]).includes(raw)) {
    return raw as FlavorCode;
  }
  const th = input.trim();
  return TH_TO_CODE[th] ?? null;
}

export function isCrateSize(n: number): n is CrateSize {
  return (CRATE_SIZES as readonly number[]).includes(n);
}

export type PricingSnapshot = {
  basePricePerCup: number;
  bulkThresholdCups: number;
  bulkPricePerCup: number;
};

export function unitPriceForCups(
  cupsTotal: number,
  pricing: PricingSnapshot,
): number {
  // domain: bulk when cupsTotal > threshold (not >=)
  if (cupsTotal > pricing.bulkThresholdCups) {
    return pricing.bulkPricePerCup;
  }
  return pricing.basePricePerCup;
}

export function num(v: string | number): number {
  return typeof v === "number" ? v : Number(v);
}

export function money(n: number): string {
  return n.toFixed(2);
}
