INSERT INTO `role_permissions` (`role_id`, `resource`, `action`)
SELECT r.id, res.column1, act.column1
FROM `roles` r
CROSS JOIN (
  VALUES 
    ('entries'), ('media'), ('taxonomies'), ('taxonomy_terms'), 
    ('users'), ('settings'), ('content_builder'), ('taxonomy_builder'), 
    ('layout'), ('redirects'), ('system')
) AS res
CROSS JOIN (
  VALUES 
    ('read'), ('create'), ('edit_own'), ('edit_others'), 
    ('delete_own'), ('delete_others')
) AS act
WHERE r.slug = 'superadmin';

INSERT INTO `role_permissions` (`role_id`, `resource`, `action`)
SELECT r.id, res.column1, act.column1
FROM `roles` r
CROSS JOIN (
  VALUES 
    ('entries'), ('media'), ('taxonomies'), ('taxonomy_terms'), 
    ('users'), ('taxonomy_builder'), ('redirects')
) AS res
CROSS JOIN (
  VALUES 
    ('read'), ('create'), ('edit_own'), ('edit_others'), 
    ('delete_own'), ('delete_others')
) AS act
WHERE r.slug = 'admin';

INSERT INTO `role_permissions` (`role_id`, `resource`, `action`)
SELECT r.id, res.column1, act.column1
FROM `roles` r
CROSS JOIN (
  VALUES 
    ('entries'), ('media'), ('taxonomies'), ('taxonomy_terms')
) AS res
CROSS JOIN (
  VALUES 
    ('read'), ('create'), ('edit_own'), ('edit_others'), 
    ('delete_own'), ('delete_others')
) AS act
WHERE r.slug = 'editor';

INSERT INTO `role_permissions` (`role_id`, `resource`, `action`)
SELECT r.id, res.column1, res.column2
FROM `roles` r
CROSS JOIN (
  VALUES 
    ('entries', 'read'),
    ('entries', 'create'),
    ('entries', 'edit_own'),
    ('entries', 'delete_own'),
    ('media', 'read'),
    ('media', 'create'),
    ('taxonomies', 'read'),
    ('taxonomy_terms', 'read')
) AS res
WHERE r.slug = 'writter';