import Database from 'better-sqlite3';
import { resolve } from 'path';

// Connect to the local SQLite database
const dbPath = resolve('./local.db');
const db = new Database(dbPath);

console.log('Starting Headless CMS Data Migration...');

// Start a transaction
db.exec('BEGIN TRANSACTION;');

try {
  // 1. Create Base Collections
  console.log('Creating base collections...');
  const insertCollection = db.prepare(`
    INSERT INTO collections (slug, label, label_singular, description, icon, route_prefix, fields, supports)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET slug=slug
    RETURNING id;
  `);

  const articleFields = JSON.stringify([
    { slug: 'title', label: 'Title', type: 'text', required: true },
    { slug: 'content', label: 'Content', type: 'rich_content', required: true },
    { slug: 'featuredImageUrl', label: 'Featured Image', type: 'media' },
    { slug: 'metaTitle', label: 'SEO Title', type: 'text' },
    { slug: 'metaDescription', label: 'SEO Description', type: 'text' },
  ]);

  const pageFields = JSON.stringify([
    { slug: 'title', label: 'Title', type: 'text', required: true },
    { slug: 'content', label: 'Content', type: 'rich_content' },
    { slug: 'isBlockBuilder', label: 'Use Block Builder', type: 'boolean' },
    { slug: 'layoutBlocks', label: 'Blocks', type: 'json' },
    { slug: 'layoutConfig', label: 'Layout Config', type: 'json' },
    { slug: 'headerStyle', label: 'Header Style', type: 'text' },
    { slug: 'footerStyle', label: 'Footer Style', type: 'text' },
    { slug: 'metaTitle', label: 'SEO Title', type: 'text' },
    { slug: 'metaDescription', label: 'SEO Description', type: 'text' },
  ]);

  const articlesCollectionId = insertCollection.get('articles', 'Articles', 'Article', 'Standard blog posts', 'FileText', '/', articleFields, '{}').id;
  const pagesCollectionId = insertCollection.get('pages', 'Pages', 'Page', 'Static pages and landing pages', 'Layout', '/', pageFields, '{}').id;

  // 2. Create Base Taxonomies
  console.log('Creating taxonomies...');
  const insertTaxonomy = db.prepare(`
    INSERT INTO taxonomies (slug, label, allowed_collections)
    VALUES (?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET slug=slug
    RETURNING id;
  `);

  const categoryTaxonomyId = insertTaxonomy.get('categories', 'Categories', JSON.stringify(['articles'])).id;
  const tagTaxonomyId = insertTaxonomy.get('tags', 'Tags', JSON.stringify(['articles'])).id;

  // 3. Migrate Terms (Categories and Tags)
  console.log('Migrating terms...');
  const insertTerm = db.prepare(`
    INSERT INTO terms (taxonomy_id, parent_id, name, slug)
    VALUES (?, NULL, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET slug=slug
    RETURNING id;
  `);

  const categoryIdMap = new Map();
  const categories = db.prepare('SELECT * FROM categories').all();
  for (const cat of categories) {
    const newId = insertTerm.get(categoryTaxonomyId, cat.name, cat.slug).id;
    categoryIdMap.set(cat.id, newId);
  }

  const tagIdMap = new Map();
  const tags = db.prepare('SELECT * FROM tags').all();
  for (const tag of tags) {
    const newId = insertTerm.get(tagTaxonomyId, tag.name, tag.slug).id;
    tagIdMap.set(tag.id, newId);
  }

  // 4. Migrate Entries (Articles)
  console.log('Migrating articles...');
  const insertEntry = db.prepare(`
    INSERT INTO entries (collection_id, slug, status, author_id, data, created_at, updated_at, published_at, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(slug) DO UPDATE SET slug=slug
    RETURNING id;
  `);

  const insertEntryTerm = db.prepare(`
    INSERT OR IGNORE INTO entry_terms (entry_id, term_id) VALUES (?, ?)
  `);

  const articles = db.prepare('SELECT * FROM articles').all();
  for (const article of articles) {
    const dataPayload = {
      title: article.title,
      content: article.content,
      featuredImageUrl: article.featured_image_url,
      metaTitle: article.meta_title,
      metaDescription: article.meta_description,
      customSchema: article.custom_schema,
    };

    const newEntryId = insertEntry.get(
      articlesCollectionId,
      article.slug,
      article.status,
      article.author_id,
      JSON.stringify(dataPayload),
      new Date().toISOString(), // createdAt fallback
      new Date().toISOString(), // updatedAt fallback
      article.published_at || null
    ).id;

    // Migrate taxonomy relations
    if (article.category_id && categoryIdMap.has(article.category_id)) {
      insertEntryTerm.run(newEntryId, categoryIdMap.get(article.category_id));
    }

    const articleTags = db.prepare('SELECT tag_id FROM article_tags WHERE article_id = ?').all(article.id);
    for (const at of articleTags) {
      if (tagIdMap.has(at.tag_id)) {
        insertEntryTerm.run(newEntryId, tagIdMap.get(at.tag_id));
      }
    }
  }

  // 5. Migrate Entries (Pages)
  console.log('Migrating pages...');
  const pages = db.prepare('SELECT * FROM pages').all();
  for (const page of pages) {
    const dataPayload = {
      title: page.title,
      content: page.content,
      isBlockBuilder: page.is_block_builder === 1,
      layoutBlocks: page.layout_blocks ? JSON.parse(page.layout_blocks) : [],
      layoutConfig: page.layout_config ? JSON.parse(page.layout_config) : {},
      headerStyle: page.header_style,
      footerStyle: page.footer_style,
      metaTitle: page.meta_title,
      metaDescription: page.meta_description,
      customSchema: page.custom_schema,
    };

    insertEntry.run(
      pagesCollectionId,
      page.slug,
      page.status,
      page.author_id,
      JSON.stringify(dataPayload),
      new Date().toISOString(),
      new Date().toISOString(),
      page.published_at || null
    );
  }

  db.exec('COMMIT;');
  console.log('Migration completed successfully!');

} catch (error) {
  db.exec('ROLLBACK;');
  console.error('Migration failed, rolled back changes.', error);
}

db.close();
