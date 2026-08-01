CREATE TABLE `not_found_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`hits` integer DEFAULT 1 NOT NULL,
	`last_seen` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `not_found_logs_url_unique` ON `not_found_logs` (`url`);--> statement-breakpoint
CREATE TABLE `redirects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_url` text NOT NULL,
	`target_url` text NOT NULL,
	`status_code` integer DEFAULT 301 NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `redirects_source_url_unique` ON `redirects` (`source_url`);