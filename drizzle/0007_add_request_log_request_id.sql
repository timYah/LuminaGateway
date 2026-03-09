ALTER TABLE `request_logs` ADD `request_id` text;
--> statement-breakpoint
CREATE INDEX `request_logs_request_id_idx` ON `request_logs` (`request_id`);
