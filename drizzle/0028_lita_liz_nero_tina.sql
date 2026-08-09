ALTER TABLE `collections` ADD `author_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `taxonomies` ADD `author_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `terms` ADD `author_id` integer REFERENCES users(id);
