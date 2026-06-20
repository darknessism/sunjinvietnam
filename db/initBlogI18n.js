const pool = require('./connection');

// Bilingual blog-article content: Vietnamese stays in the original blog_content
// columns, English lives in matching *_en columns. Added idempotently at startup
// so an existing deployment gains the columns without a manual migration.
const COLUMNS = [
    ['lead_en',              'TEXT'],
    ['body_en',             'JSON'],
    ['pull_quote_en',       'TEXT'],
    ['pull_quote_cite_en',  'VARCHAR(255)'],
    ['figure_caption_en',   'TEXT'],
    ['body_after_figure_en', 'JSON'],
];

async function initBlogI18n() {
    const [rows] = await pool.query(
        `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'blog_content'`
    );
    // Table doesn't exist yet (fresh DB) — migrate.js/schema.sql create it first.
    if (!rows.length) return;

    const have = new Set(rows.map(r => r.c));
    const missing = COLUMNS.filter(([name]) => !have.has(name));
    if (!missing.length) return;

    const adds = missing.map(([name, type]) => `ADD COLUMN \`${name}\` ${type}`).join(', ');
    await pool.query(`ALTER TABLE blog_content ${adds}`);
    console.log(`✅ Added ${missing.length} bilingual blog column(s): ${missing.map(m => m[0]).join(', ')}`);
}

module.exports = initBlogI18n;
