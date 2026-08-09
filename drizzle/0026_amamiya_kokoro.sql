-- Create roles table
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL UNIQUE,
	`label` text NOT NULL,
	`description` text,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint

-- Create role_permissions table
CREATE TABLE `role_permissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role_id` integer NOT NULL REFERENCES `roles`(`id`) ON DELETE CASCADE,
	`resource` text NOT NULL,
	`action` text NOT NULL
);
--> statement-breakpoint

CREATE INDEX `role_permissions_role_resource_idx` ON `role_permissions` (`role_id`, `resource`);
--> statement-breakpoint

-- ────────────────────────────────────────────────────────────────────────────
-- Seed default roles
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO `roles` (`slug`, `label`, `description`, `is_system`, `created_at`) VALUES
  ('superadmin', 'Super Admin',  'Full access to everything including system tools.', 1, datetime('now')),
  ('admin',      'Admin',        'Full content access. Cannot access system-level tools.', 1, datetime('now')),
  ('editor',     'Editor',       'Can read, create, and edit all entries and media.', 0, datetime('now')),
  ('writter',    'Writter',      'Can create entries and edit their own. Can upload media.', 0, datetime('now')),
  ('user',       'User',         'No admin panel access.', 0, datetime('now'));
