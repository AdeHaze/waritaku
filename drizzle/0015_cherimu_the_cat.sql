ALTER TABLE `page_revisions` ADD `layout_blocks` text;--> statement-breakpoint
ALTER TABLE `page_revisions` ADD `is_block_builder` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `page_revisions` ADD `header_style` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `page_revisions` ADD `footer_style` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `pages` ADD `layout_blocks` text;--> statement-breakpoint
ALTER TABLE `pages` ADD `is_block_builder` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `pages` ADD `header_style` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `pages` ADD `footer_style` text DEFAULT 'default' NOT NULL;