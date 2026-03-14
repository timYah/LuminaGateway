CREATE TABLE `model_priorities` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `provider_id` integer NOT NULL,
  `model_slug` text NOT NULL,
  `priority` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_priorities_provider_model_unique` ON `model_priorities` (`provider_id`,`model_slug`);
--> statement-breakpoint
CREATE INDEX `model_priorities_model_slug_idx` ON `model_priorities` (`model_slug`);
