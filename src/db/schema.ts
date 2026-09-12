import {
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  index,
  unique,
} from "drizzle-orm/pg-core";

export const flavors = pgTable("flavors", {
  code: text("code").primaryKey(),
  nameTh: text("name_th").notNull(),
});

export const pricingConfig = pgTable("pricing_config", {
  id: integer("id").primaryKey().default(1),
  basePricePerCup: numeric("base_price_per_cup", {
    precision: 12,
    scale: 2,
  }).notNull(),
  bulkThresholdCups: integer("bulk_threshold_cups").notNull().default(100),
  bulkPricePerCup: numeric("bulk_price_per_cup", {
    precision: 12,
    scale: 2,
  }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const paymentChannelConfig = pgTable("payment_channel_config", {
  id: integer("id").primaryKey().default(1),
  bankAccountNumber: text("bank_account_number").notNull(),
  bankName: text("bank_name").notNull(),
  qrImageUrl: text("qr_image_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queueCode: text("queue_code").notNull(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    status: text("status").notNull(),
    cupsTotal: integer("cups_total").notNull(),
    productTotal: numeric("product_total", { precision: 12, scale: 2 }).notNull(),
    depositTotal: numeric("deposit_total", { precision: 12, scale: 2 }).notNull(),
    unitPriceApplied: numeric("unit_price_applied", {
      precision: 12,
      scale: 2,
    }).notNull(),
    slipRejectReason: text("slip_reject_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    depositReturnedAt: timestamp("deposit_returned_at", { withTimezone: true }),
    cratesReturnedAt: timestamp("crates_returned_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("orders_queue_code_uidx").on(t.queueCode),
    index("orders_status_idx").on(t.status),
  ],
);

/** @deprecated v1.0 — unused for new orders (v1.1 uses order_crates + order_crate_fills) */
export const orderLines = pgTable("order_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  crateSize: integer("crate_size").notNull(),
  quantity: integer("quantity").notNull(),
  flavorCode: text("flavor_code")
    .notNull()
    .references(() => flavors.code),
  lineCups: integer("line_cups").notNull(),
  lineDeposit: numeric("line_deposit", { precision: 12, scale: 2 }).notNull(),
});

export const orderCrates = pgTable("order_crates", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  crateSize: integer("crate_size").notNull(),
  lineDeposit: numeric("line_deposit", { precision: 12, scale: 2 }).notNull(),
});

export const orderCrateFills = pgTable(
  "order_crate_fills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    crateId: uuid("crate_id")
      .notNull()
      .references(() => orderCrates.id),
    flavorCode: text("flavor_code")
      .notNull()
      .references(() => flavors.code),
    cups: integer("cups").notNull(),
  },
  (t) => [unique("order_crate_fills_crate_flavor_uidx").on(t.crateId, t.flavorCode)],
);

export const paymentSlips = pgTable(
  "payment_slips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    fileUrl: text("file_url").notNull(),
    status: text("status").notNull(),
    rejectReason: text("reject_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [index("payment_slips_order_id_idx").on(t.orderId)],
);

export const orderStatusEvents = pgTable("order_status_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  actor: text("actor").notNull(),
});

export const depositReturns = pgTable("deposit_returns", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id)
    .unique(),
  returnedAt: timestamp("returned_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  note: text("note"),
});
