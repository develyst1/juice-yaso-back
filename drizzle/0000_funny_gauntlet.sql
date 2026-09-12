CREATE TABLE "deposit_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"returned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"note" text,
	CONSTRAINT "deposit_returns_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "flavors" (
	"code" text PRIMARY KEY NOT NULL,
	"name_th" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"crate_size" integer NOT NULL,
	"quantity" integer NOT NULL,
	"flavor_code" text NOT NULL,
	"line_cups" integer NOT NULL,
	"line_deposit" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_code" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"status" text NOT NULL,
	"cups_total" integer NOT NULL,
	"product_total" numeric(12, 2) NOT NULL,
	"deposit_total" numeric(12, 2) NOT NULL,
	"unit_price_applied" numeric(12, 2) NOT NULL,
	"slip_reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"deposit_returned_at" timestamp with time zone,
	"crates_returned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_channel_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"bank_account_number" text NOT NULL,
	"bank_name" text NOT NULL,
	"qr_image_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_slips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"file_url" text NOT NULL,
	"status" text NOT NULL,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pricing_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"base_price_per_cup" numeric(12, 2) NOT NULL,
	"bulk_threshold_cups" integer DEFAULT 100 NOT NULL,
	"bulk_price_per_cup" numeric(12, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deposit_returns" ADD CONSTRAINT "deposit_returns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_flavor_code_flavors_code_fk" FOREIGN KEY ("flavor_code") REFERENCES "public"."flavors"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_slips" ADD CONSTRAINT "payment_slips_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_queue_code_uidx" ON "orders" USING btree ("queue_code");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_slips_order_id_idx" ON "payment_slips" USING btree ("order_id");