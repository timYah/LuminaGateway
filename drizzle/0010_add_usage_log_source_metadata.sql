ALTER TABLE usage_logs ADD COLUMN usage_source text NOT NULL DEFAULT 'actual';
--> statement-breakpoint
ALTER TABLE usage_logs ADD COLUMN route_path text;
--> statement-breakpoint
ALTER TABLE usage_logs ADD COLUMN request_id text;
--> statement-breakpoint
CREATE INDEX usage_logs_request_id_idx ON usage_logs (request_id);
--> statement-breakpoint
DELETE FROM usage_logs;
