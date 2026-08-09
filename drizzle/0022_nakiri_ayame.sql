CREATE TABLE `collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`label_singular` text NOT NULL,
	`description` text,
	`icon` text DEFAULT 'FileText' NOT NULL,
	`route_prefix` text DEFAULT '/' NOT NULL,
	`fields` text DEFAULT '[]' NOT NULL,
	`supports` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collections_slug_unique` ON `collections` (`slug`);--> statement-breakpoint
CREATE TABLE `entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collection_id` integer NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`author_id` integer,
	`data` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text,
	`deleted_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_slug_unique` ON `entries` (`slug`);--> statement-breakpoint
CREATE INDEX `entries_status_idx` ON `entries` (`status`);--> statement-breakpoint
CREATE INDEX `entries_collection_idx` ON `entries` (`collection_id`);--> statement-breakpoint
CREATE INDEX `entries_author_idx` ON `entries` (`author_id`);--> statement-breakpoint
CREATE TABLE `entry_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_id` integer NOT NULL,
	`author_id` integer,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `entry_revisions_entry_idx` ON `entry_revisions` (`entry_id`);--> statement-breakpoint
CREATE TABLE `entry_terms` (
	`entry_id` integer NOT NULL,
	`term_id` integer NOT NULL,
	PRIMARY KEY(`entry_id`, `term_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entry_terms_term_idx` ON `entry_terms` (`term_id`);--> statement-breakpoint
CREATE TABLE `password_resets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_resets_token_unique` ON `password_resets` (`token`);--> statement-breakpoint
CREATE TABLE `taxonomies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`allowed_collections` text DEFAULT '[]' NOT NULL,
	`is_routed` integer DEFAULT false NOT NULL,
	`prefix_entry_url` integer DEFAULT false NOT NULL,
	`allow_indexing` integer DEFAULT true NOT NULL,
	`omit_taxonomy_slug` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `taxonomies_slug_unique` ON `taxonomies` (`slug`);--> statement-breakpoint
CREATE TABLE `terms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taxonomy_id` integer NOT NULL,
	`parent_id` integer,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	FOREIGN KEY (`taxonomy_id`) REFERENCES `taxonomies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `terms_taxonomy_idx` ON `terms` (`taxonomy_id`);--> statement-breakpoint
CREATE INDEX `terms_parent_idx` ON `terms` (`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `terms_taxonomy_slug_unique` ON `terms` (`taxonomy_id`,`slug`);--> statement-breakpoint
DROP TABLE `article_categories`;--> statement-breakpoint
DROP TABLE `article_revisions`;--> statement-breakpoint
DROP TABLE `article_tags`;--> statement-breakpoint
DROP TABLE `articles`;--> statement-breakpoint
DROP TABLE `categories`;--> statement-breakpoint
DROP TABLE `page_revisions`;--> statement-breakpoint
DROP TABLE `pages`;--> statement-breakpoint
DROP TABLE `tags`;