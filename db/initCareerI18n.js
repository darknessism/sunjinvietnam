const pool = require('./connection');

// Bilingual job content: Vietnamese stays in the original careers columns,
// English lives in matching *_en columns. Added idempotently at startup so an
// existing deployment gains the columns without a manual migration.
const COLUMNS = [
    ['title_en',        'VARCHAR(255)'],
    ['salary_en',       'VARCHAR(120)'],
    ['description_en',  'TEXT'],
    ['requirements_en', 'TEXT'],
    ['benefits_en',     'JSON'],
];

async function initCareerI18n() {
    const [rows] = await pool.query(
        `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'careers'`
    );
    // Table doesn't exist yet (fresh DB) — schema.sql already defines the columns.
    if (!rows.length) return;

    const have = new Set(rows.map(r => r.c));
    const missing = COLUMNS.filter(([name]) => !have.has(name));
    if (!missing.length) return;

    const adds = missing.map(([name, type]) => `ADD COLUMN \`${name}\` ${type}`).join(', ');
    await pool.query(`ALTER TABLE careers ${adds}`);
    console.log(`✅ Added ${missing.length} bilingual career column(s): ${missing.map(m => m[0]).join(', ')}`);
}

module.exports = initCareerI18n;
