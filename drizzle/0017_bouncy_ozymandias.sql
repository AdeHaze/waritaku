-- Custom SQL migration file, put your code below! --
ALTER TABLE `taxonomies` ADD `description` text;
ALTER TABLE `taxonomies` ADD `is_routed` integer DEFAULT false NOT NULL;
ALTER TABLE `taxonomies` ADD `prefix_entry_url` integer DEFAULT false NOT NULL;
ALTER TABLE `taxonomies` ADD `allow_indexing` integer DEFAULT true NOT NULL;