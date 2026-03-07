CREATE TABLE `request_logs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `provider_id` integer NOT NULL,
  `model_slug` text NOT NULL,
  `result` text NOT NULL,
  `error_type` text,
  `latency_ms` integer,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `request_logs_created_at_idx` ON `request_logs` (`created_at`);
