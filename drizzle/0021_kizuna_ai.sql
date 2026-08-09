-- Custom SQL migration file, put your code below! --
ALTER TABLE taxonomies ADD COLUMN omit_taxonomy_slug INTEGER NOT NULL DEFAULT 0;