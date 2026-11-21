CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 10001 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."rma_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 501 CACHE 1;--> statement-breakpoint
CREATE TABLE "admin_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artworks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"family" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"rights_status" text DEFAULT 'pending' NOT NULL,
	"rights_note" text,
	"credited_to" text,
	"license_ref" text,
	"print_file_key" text,
	"preview_key" text,
	"ink_colors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"actor_email" text,
	"actor_role" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"data" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"personalization" jsonb,
	"personalization_key" text DEFAULT '' NOT NULL,
	"outfit_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_lines_qty_ck" CHECK ("cart_lines"."qty" > 0 and "cart_lines"."qty" <= 10)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"currency" text NOT NULL,
	"discount_code" text,
	"email" text,
	"pending_order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "discount_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	"currency" text,
	"min_subtotal_minor" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"usage_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "drop_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"consent_text" text NOT NULL,
	"consent_version" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	CONSTRAINT "drop_signups_email_unique" UNIQUE("email"),
	CONSTRAINT "drop_signups_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text NOT NULL,
	"job_id" uuid,
	"order_id" uuid,
	"template" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"status" text DEFAULT 'sending' NOT NULL,
	"error" text,
	"body_text" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_deliveries_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "fulfillment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"provider_ref" text,
	"payload" jsonb NOT NULL,
	"error" text,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_levels" (
	"sku_id" uuid PRIMARY KEY NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_on_hand_ck" CHECK ("inventory_levels"."on_hand" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"order_id" uuid,
	"return_id" uuid,
	"note" text,
	"actor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"worker" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "jobs_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "jobs_status_ck" CHECK ("jobs"."status" in ('pending','running','succeeded','failed','dead'))
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"rights_note" text,
	"product_id" uuid,
	"variant_id" uuid,
	"artwork_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "order_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" text DEFAULT 'view' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_access_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"actor" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"sku_id" uuid,
	"sku_code" text NOT NULL,
	"product_id" uuid,
	"product_name" text NOT NULL,
	"product_slug" text NOT NULL,
	"category_label" text NOT NULL,
	"variant_code" text NOT NULL,
	"variant_label" text NOT NULL,
	"color_name" text NOT NULL,
	"size" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"personalization_unit_minor" integer DEFAULT 0 NOT NULL,
	"line_subtotal_minor" integer NOT NULL,
	"discount_minor" integer DEFAULT 0 NOT NULL,
	"tax_minor" integer DEFAULT 0 NOT NULL,
	"line_total_minor" integer NOT NULL,
	"personalization" jsonb,
	"prints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fulfillment_mode" text NOT NULL,
	"lead_time" jsonb,
	"withdrawal_rule" text NOT NULL,
	"image_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_lines_qty_ck" CHECK ("order_lines"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"cart_id" uuid,
	"email" text NOT NULL,
	"currency" text NOT NULL,
	"market" text NOT NULL,
	"subtotal_minor" integer NOT NULL,
	"discount_minor" integer NOT NULL,
	"shipping_minor" integer NOT NULL,
	"tax_minor" integer NOT NULL,
	"total_minor" integer NOT NULL,
	"tax_snapshot" jsonb NOT NULL,
	"pricing_snapshot" jsonb NOT NULL,
	"shipping_address" jsonb NOT NULL,
	"shipping_method" jsonb NOT NULL,
	"quote_id" uuid,
	"cart_fingerprint" text,
	"discount_code" text,
	"seller_snapshot" jsonb NOT NULL,
	"terms_version" text NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"fulfillment_status" text DEFAULT 'unfulfilled' NOT NULL,
	"return_status" text DEFAULT 'none' NOT NULL,
	"refund_status" text DEFAULT 'none' NOT NULL,
	"review_status" text DEFAULT 'clear' NOT NULL,
	"review_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reservation_expires_at" timestamp with time zone,
	"customer_note" text,
	"internal_note" text,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	CONSTRAINT "orders_number_unique" UNIQUE("number"),
	CONSTRAINT "orders_payment_ck" CHECK ("orders"."payment_status" in ('unpaid','processing','paid','failed','expired','cancelled')),
	CONSTRAINT "orders_fulfillment_ck" CHECK ("orders"."fulfillment_status" in ('unfulfilled','in_production','packed','shipped','delivered','cancelled')),
	CONSTRAINT "orders_return_ck" CHECK ("orders"."return_status" in ('none','open','closed')),
	CONSTRAINT "orders_refund_ck" CHECK ("orders"."refund_status" in ('none','pending','partially_refunded','refunded')),
	CONSTRAINT "orders_review_ck" CHECK ("orders"."review_status" in ('clear','needs_review')),
	CONSTRAINT "orders_totals_ck" CHECK ("orders"."total_minor" >= 0 and "orders"."subtotal_minor" >= 0 and "orders"."shipping_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "outfit_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outfit_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"hotspot_x" integer NOT NULL,
	"hotspot_y" integer NOT NULL,
	"label" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outfits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"description" text,
	"media_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"bundle_discount_bps" integer,
	"bundle_min_items" integer DEFAULT 3 NOT NULL,
	"bundle_approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outfits_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'creating' NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"provider_ref" text,
	"redirect_url" text,
	"expires_at" timestamp with time zone NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "payment_attempts_status_ck" CHECK ("payment_attempts"."status" in ('creating','open','approved','processing','succeeded','failed','expired','cancelled','superseded'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"attempt_id" uuid,
	"provider" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"status" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"captured_at" timestamp with time zone,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_pages" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"reviewed" boolean DEFAULT false NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "print_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"placement" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"supplier_approved" boolean DEFAULT false NOT NULL,
	"supplier_approved_at" timestamp with time zone,
	"supplier_ref" text,
	"area_mm" jsonb NOT NULL,
	"fields" jsonb NOT NULL,
	"fonts" jsonb NOT NULL,
	"colors" jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_collections" (
	"product_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_collections_product_id_collection_id_pk" PRIMARY KEY("product_id","collection_id")
);
--> statement-breakpoint
CREATE TABLE "product_specs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"code" text NOT NULL,
	"color_name" text NOT NULL,
	"color_hex" text NOT NULL,
	"option_label" text,
	"status" text DEFAULT 'active' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"personalization_area" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"category_label" text NOT NULL,
	"summary" text,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"fulfillment_mode" text DEFAULT 'stocked' NOT NULL,
	"lead_time_min_days" integer,
	"lead_time_max_days" integer,
	"lead_time_approved" boolean DEFAULT false NOT NULL,
	"sale_approved" boolean DEFAULT false NOT NULL,
	"sale_approved_at" timestamp with time zone,
	"sale_approved_by" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"hero_view" text DEFAULT 'back' NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"weight_grams" integer,
	"personalization_template_id" uuid,
	"personalization_price_minor" integer,
	"personalization_production_days" integer,
	"personalization_enabled" boolean DEFAULT false NOT NULL,
	"personalization_no_withdrawal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_status_ck" CHECK ("products"."status" in ('draft','active','archived')),
	CONSTRAINT "products_mode_ck" CHECK ("products"."fulfillment_mode" in ('stocked','made_to_order'))
);
--> statement-breakpoint
CREATE TABLE "provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"order_id" uuid,
	"payload" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_refund_id" text,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"idempotency_key" text NOT NULL,
	"requested_by" text NOT NULL,
	"return_id" uuid,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "refunds_amount_ck" CHECK ("refunds"."amount_minor" > 0),
	CONSTRAINT "refunds_status_ck" CHECK ("refunds"."status" in ('pending','succeeded','failed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "return_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"condition" text,
	"restock" boolean DEFAULT false NOT NULL,
	"exchange_sku_id" uuid,
	CONSTRAINT "return_lines_qty_ck" CHECK ("return_lines"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"rma_number" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"reason" text NOT NULL,
	"customer_note" text,
	"internal_note" text,
	"created_by" text NOT NULL,
	"received_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "returns_rma_number_unique" UNIQUE("rma_number")
);
--> statement-breakpoint
CREATE TABLE "admin_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "admin_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "shipment_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"order_line_id" uuid,
	"sku_id" uuid,
	"description" text NOT NULL,
	"qty" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" text DEFAULT 'original' NOT NULL,
	"status" text DEFAULT 'packed' NOT NULL,
	"carrier" text,
	"tracking_number" text,
	"tracking_url" text,
	"return_id" uuid,
	"packed_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_by" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"cart_fingerprint" text NOT NULL,
	"destination" jsonb NOT NULL,
	"rate_id" uuid NOT NULL,
	"rate_snapshot" jsonb NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"name" text NOT NULL,
	"carrier" text NOT NULL,
	"service" text,
	"price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"free_over_minor" integer,
	"min_days" integer,
	"max_days" integer,
	"approved" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"countries" text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulator_sessions" (
	"ref" text PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"flavor" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"reference" jsonb NOT NULL,
	"shipping" jsonb,
	"payment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "size_charts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"basis" text DEFAULT 'garment' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"columns" jsonb NOT NULL,
	"rows" jsonb NOT NULL,
	"tolerance_mm" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"size" text NOT NULL,
	"size_sort" integer NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"barcode" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skus_code_unique" UNIQUE("code"),
	CONSTRAINT "skus_price_ck" CHECK ("skus"."price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_reservations_qty_ck" CHECK ("stock_reservations"."qty" > 0),
	CONSTRAINT "stock_reservations_status_ck" CHECK ("stock_reservations"."status" in ('active','committed','released'))
);
--> statement-breakpoint
CREATE TABLE "admin_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'viewer' NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "variant_prints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"artwork_id" uuid NOT NULL,
	"placement" text NOT NULL,
	"method" text,
	"method_approved" boolean DEFAULT false NOT NULL,
	"size_note" text
);
--> statement-breakpoint
CREATE TABLE "admin_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_account" ADD CONSTRAINT "admin_account_user_id_admin_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_requests" ADD CONSTRAINT "fulfillment_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_artwork_id_artworks_id_fk" FOREIGN KEY ("artwork_id") REFERENCES "public"."artworks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_access_tokens" ADD CONSTRAINT "order_access_tokens_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit_items" ADD CONSTRAINT "outfit_items_outfit_id_outfits_id_fk" FOREIGN KEY ("outfit_id") REFERENCES "public"."outfits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit_items" ADD CONSTRAINT "outfit_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit_items" ADD CONSTRAINT "outfit_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfits" ADD CONSTRAINT "outfits_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_specs" ADD CONSTRAINT "product_specs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_specs" ADD CONSTRAINT "product_specs_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_personalization_template_id_print_templates_id_fk" FOREIGN KEY ("personalization_template_id") REFERENCES "public"."print_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_exchange_sku_id_skus_id_fk" FOREIGN KEY ("exchange_sku_id") REFERENCES "public"."skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_session" ADD CONSTRAINT "admin_session_user_id_admin_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_zone_id_shipping_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "size_charts" ADD CONSTRAINT "size_charts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "size_charts" ADD CONSTRAINT "size_charts_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_prints" ADD CONSTRAINT "variant_prints_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_prints" ADD CONSTRAINT "variant_prints_artwork_id_artworks_id_fk" FOREIGN KEY ("artwork_id") REFERENCES "public"."artworks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_account_user_idx" ON "admin_account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artworks_code_version_uq" ON "artworks" USING btree ("code","version");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cart_lines_uq" ON "cart_lines" USING btree ("cart_id","sku_id","personalization_key");--> statement-breakpoint
CREATE INDEX "email_deliveries_order_idx" ON "email_deliveries" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_requests_uq" ON "fulfillment_requests" USING btree ("order_id","provider");--> statement-breakpoint
CREATE INDEX "inventory_movements_sku_idx" ON "inventory_movements" USING btree ("sku_id","created_at");--> statement-breakpoint
CREATE INDEX "job_runs_job_idx" ON "job_runs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "jobs_due_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "jobs_order_idx" ON "jobs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "media_assets_product_idx" ON "media_assets" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "media_assets_variant_idx" ON "media_assets" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "order_access_tokens_order_idx" ON "order_access_tokens" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_lines_order_idx" ON "order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_lines_no_uq" ON "order_lines" USING btree ("order_id","line_no");--> statement-breakpoint
CREATE INDEX "orders_payment_idx" ON "orders" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "orders_fulfillment_idx" ON "orders" USING btree ("fulfillment_status");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_email_idx" ON "orders" USING btree ("email");--> statement-breakpoint
CREATE INDEX "outfit_items_outfit_idx" ON "outfit_items" USING btree ("outfit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_one_active_uq" ON "payment_attempts" USING btree ("order_id") WHERE "payment_attempts"."status" in ('creating','open','approved','processing');--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_ref_uq" ON "payment_attempts" USING btree ("provider","provider_ref") WHERE "payment_attempts"."provider_ref" is not null;--> statement-breakpoint
CREATE INDEX "payment_attempts_order_idx" ON "payment_attempts" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_ref_uq" ON "payments" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "print_templates_code_version_uq" ON "print_templates" USING btree ("code","version");--> statement-breakpoint
CREATE INDEX "product_specs_product_idx" ON "product_specs" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_code_uq" ON "product_variants" USING btree ("product_id","code");--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_events_uq" ON "provider_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_ref_uq" ON "refunds" USING btree ("provider","provider_refund_id") WHERE "refunds"."provider_refund_id" is not null;--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "returns_order_idx" ON "returns" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "admin_session_user_idx" ON "admin_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shipments_order_idx" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "size_charts_product_idx" ON "size_charts" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skus_variant_size_uq" ON "skus" USING btree ("variant_id","size");--> statement-breakpoint
CREATE INDEX "stock_reservations_active_idx" ON "stock_reservations" USING btree ("sku_id") WHERE "stock_reservations"."status" = 'active';--> statement-breakpoint
CREATE INDEX "stock_reservations_order_idx" ON "stock_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "variant_prints_variant_idx" ON "variant_prints" USING btree ("variant_id");