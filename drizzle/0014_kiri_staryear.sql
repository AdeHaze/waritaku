CREATE TABLE `page_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`page_id` integer NOT NULL,
	`user_id` integer,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`custom_schema` text,
	`layout_config` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `pages` ADD `layout_config` text;