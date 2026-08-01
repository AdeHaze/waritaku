DROP TABLE IF EXISTS `articleTags`;
--> statement-breakpoint
DROP TABLE IF EXISTS `articleCategories`;
--> statement-breakpoint
DROP TABLE IF EXISTS `article_tags`;
--> statement-breakpoint
DROP TABLE IF EXISTS `article_categories`;
--> statement-breakpoint
DROP TABLE IF EXISTS `articles`;
--> statement-breakpoint
DROP TABLE IF EXISTS `page_revisions`;
--> statement-breakpoint
DROP TABLE IF EXISTS `pages`;
--> statement-breakpoint
DROP TABLE IF EXISTS `categories`;
--> statement-breakpoint
DROP TABLE IF EXISTS `tags`;
--> statement-breakpoint

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
CREATE UNIQUE INDEX `collections_slug_unique` ON `collections` (`slug`);
--> statement-breakpoint

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
CREATE UNIQUE INDEX `entries_slug_unique` ON `entries` (`slug`);
--> statement-breakpoint
CREATE INDEX `entries_status_idx` ON `entries` (`status`);
--> statement-breakpoint
CREATE INDEX `entries_collection_idx` ON `entries` (`collection_id`);
--> statement-breakpoint
CREATE INDEX `entries_author_idx` ON `entries` (`author_id`);
--> statement-breakpoint

CREATE TABLE `taxonomies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`allowed_collections` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `taxonomies_slug_unique` ON `taxonomies` (`slug`);
--> statement-breakpoint

CREATE TABLE `terms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taxonomy_id` integer NOT NULL,
	`parent_id` integer,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	FOREIGN KEY (`taxonomy_id`) REFERENCES `taxonomies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `terms_slug_unique` ON `terms` (`slug`);
--> statement-breakpoint
CREATE INDEX `terms_taxonomy_idx` ON `terms` (`taxonomy_id`);
--> statement-breakpoint
CREATE INDEX `terms_parent_idx` ON `terms` (`parent_id`);
--> statement-breakpoint

CREATE TABLE `entry_terms` (
	`entry_id` integer NOT NULL,
	`term_id` integer NOT NULL,
	PRIMARY KEY(`entry_id`, `term_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entry_terms_term_idx` ON `entry_terms` (`term_id`);
--> statement-breakpoint

-- Seed Default Taxonomies
INSERT INTO taxonomies (slug, label, allowed_collections) VALUES 
('categories', 'Categories', '["articles"]'),
('tags', 'Tags', '["articles"]');
--> statement-breakpoint

-- Seed Default Collections
INSERT INTO collections (slug, label, label_singular, description, icon, route_prefix, fields, supports) VALUES 
('articles', 'Articles', 'Article', 'Blog posts and news articles.', 'FileText', '/article', 
'[
  {"name": "title", "label": "Title", "type": "text", "required": true},
  {"name": "excerpt", "label": "Excerpt", "type": "textarea", "required": false},
  {"name": "content", "label": "Content", "type": "richtext", "required": true},
  {"name": "featuredImage", "label": "Featured Image", "type": "image", "required": false}
]', 
'{"revisions": true, "taxonomies": ["categories", "tags"]}'
),
('pages', 'Pages', 'Page', 'Static pages built with the block builder.', 'Layout', '/', 
'[
  {"name": "title", "label": "Title", "type": "text", "required": true},
  {"name": "is_block_builder", "label": "Use Block Builder", "type": "boolean", "required": false, "default": true},
  {"name": "content", "label": "Content", "type": "richtext", "required": false},
  {"name": "layout_blocks", "label": "Layout Blocks", "type": "blockbuilder", "required": false}
]', 
'{"revisions": true}'
);