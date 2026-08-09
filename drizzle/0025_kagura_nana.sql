ALTER TABLE `taxonomies` ADD `umbrella_view_mode` text DEFAULT 'child_terms' NOT NULL;--> statement-breakpoint
ALTER TABLE `taxonomies` ADD `umbrella_items_per_page` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `taxonomies` ADD `umbrella_allow_indexing` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `entries_collection_status_published_idx` ON `entries` (`collection_id`,`status`,`published_at`);