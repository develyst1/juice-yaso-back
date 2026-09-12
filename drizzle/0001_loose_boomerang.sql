CREATE TABLE "order_crate_fills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crate_id" uuid NOT NULL,
	"flavor_code" text NOT NULL,
	"cups" integer NOT NULL,
	CONSTRAINT "order_crate_fills_crate_flavor_uidx" UNIQUE("crate_id","flavor_code")
);
--> statement-breakpoint
CREATE TABLE "order_crates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"crate_size" integer NOT NULL,
	"line_deposit" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_crate_fills" ADD CONSTRAINT "order_crate_fills_crate_id_order_crates_id_fk" FOREIGN KEY ("crate_id") REFERENCES "public"."order_crates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_crate_fills" ADD CONSTRAINT "order_crate_fills_flavor_code_flavors_code_fk" FOREIGN KEY ("flavor_code") REFERENCES "public"."flavors"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_crates" ADD CONSTRAINT "order_crates_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;