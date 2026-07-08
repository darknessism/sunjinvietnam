const pool = require('./connection');

// Bilingual blog articles: Vietnamese stays in the original columns, English
// lives in matching *_en columns. The article body lives in blog_content; the
// article title lives in blog_posts. Added idempotently at startup so an
// existing deployment gains the columns without a manual migration.
const CONTENT_COLUMNS = [
    ['lead_en',              'TEXT'],
    ['body_en',             'JSON'],
    ['pull_quote_en',       'TEXT'],
    ['pull_quote_cite_en',  'VARCHAR(255)'],
    ['figure_caption_en',   'TEXT'],
    ['body_after_figure_en', 'JSON'],
    // Rich-text article body (single WYSIWYG field) — VI + EN, stored as HTML.
    ['body_html',           'LONGTEXT'],
    ['body_html_en',        'LONGTEXT'],
];
const POST_COLUMNS = [
    ['title_en', 'VARCHAR(255)'],
    ['excerpt_en', 'TEXT'],
];

async function ensureColumns(table, columns) {
    const [rows] = await pool.query(
        `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [table]
    );
    // Table doesn't exist yet (fresh DB) — migrate.js/schema.sql create it first.
    if (!rows.length) return;

    const have = new Set(rows.map(r => r.c));
    const missing = columns.filter(([name]) => !have.has(name));
    if (!missing.length) return;

    const adds = missing.map(([name, type]) => `ADD COLUMN \`${name}\` ${type}`).join(', ');
    await pool.query(`ALTER TABLE ${table} ${adds}`);
    console.log(`✅ Added ${missing.length} bilingual column(s) to ${table}: ${missing.map(m => m[0]).join(', ')}`);
}

async function initBlogI18n() {
    await ensureColumns('blog_content', CONTENT_COLUMNS);
    await ensureColumns('blog_posts', POST_COLUMNS);
}

module.exports = initBlogI18n;
