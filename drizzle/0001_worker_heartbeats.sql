CREATE TABLE "worker_heartbeats" (
	"worker" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_processed" integer DEFAULT 0 NOT NULL
);
