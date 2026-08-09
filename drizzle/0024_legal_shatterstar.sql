DROP INDEX `terms_taxonomy_slug_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `terms_slug_unique` ON `terms` (`slug`);