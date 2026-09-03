CREATE INDEX `entries_collection_status_id_idx` ON `entries` (`collection_id`,`status`,`id`);--> statement-breakpoint
CREATE INDEX `entries_status_id_idx` ON `entries` (`status`,`id`);