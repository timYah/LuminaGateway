ALTER TABLE `providers` ADD COLUMN `health_status` text NOT NULL DEFAULT 'unknown';
ALTER TABLE `providers` ADD COLUMN `last_health_check_at` integer;
