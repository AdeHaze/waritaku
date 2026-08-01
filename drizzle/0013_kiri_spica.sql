CREATE INDEX `article_categories_category_idx` ON `article_categories` (`category_id`);--> statement-breakpoint
CREATE INDEX `article_tags_tag_idx` ON `article_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX `articles_status_idx` ON `articles` (`status`);--> statement-breakpoint
CREATE INDEX `articles_published_at_idx` ON `articles` (`published_at`);--> statement-breakpoint
CREATE INDEX `articles_category_idx` ON `articles` (`category_id`);--> statement-breakpoint
CREATE INDEX `articles_author_idx` ON `articles` (`author_id`);