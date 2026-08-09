-- Fix writer typo
UPDATE roles SET slug='writer', label='Writer' WHERE slug='writter';
UPDATE users SET role='writer' WHERE role='writter';

-- Grant roles permissions to superadmin
INSERT OR IGNORE INTO role_permissions (role_id, resource, action) SELECT id, 'roles', 'read' FROM roles WHERE slug = 'superadmin';
INSERT OR IGNORE INTO role_permissions (role_id, resource, action) SELECT id, 'roles', 'create' FROM roles WHERE slug = 'superadmin';
INSERT OR IGNORE INTO role_permissions (role_id, resource, action) SELECT id, 'roles', 'edit_others' FROM roles WHERE slug = 'superadmin';
INSERT OR IGNORE INTO role_permissions (role_id, resource, action) SELECT id, 'roles', 'delete_others' FROM roles WHERE slug = 'superadmin';
