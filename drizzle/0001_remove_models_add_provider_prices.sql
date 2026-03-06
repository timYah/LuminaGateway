ALTER TABLE `providers` ADD COLUMN `input_price` real;
--> statement-breakpoint
ALTER TABLE `providers` ADD COLUMN `output_price` real;
--> statement-breakpoint
DROP INDEX IF EXISTS `models_slug_idx`;
--> statement-breakpoint
DROP TABLE IF EXISTS `models`;
