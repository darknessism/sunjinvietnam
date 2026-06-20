const pool = require('./connection');

// Bilingual project-detail content: Vietnamese stays in the original
// project_details columns, English lives in matching *_en columns. Added
// idempotently at startup so an existing deployment gains the columns without
// a manual migration.
const COLUMNS = [
    ['title_display_en', 'VARCHAR(255)'],
    ['lead_en',       'TEXT'],
    ['narrative1_en', 'JSON'],
    ['narrative2_en', 'JSON'],
    ['highlights_en', 'JSON'],
    ['photo1_cap_en', 'TEXT'],
    ['photo2_cap_en', 'TEXT'],
    ['photo3_cap_en', 'TEXT'],
];

async function initProjectI18n() {
    const [rows] = await pool.query(
        `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_details'`
    );
    // Table doesn't exist yet (fresh DB) — migrate.js/schema.sql create it first.
    if (!rows.length) return;

    const have = new Set(rows.map(r => r.c));
    const missing = COLUMNS.filter(([name]) => !have.has(name));
    if (!missing.length) return;

    const adds = missing.map(([name, type]) => `ADD COLUMN \`${name}\` ${type}`).join(', ');
    await pool.query(`ALTER TABLE project_details ${adds}`);
    console.log(`✅ Added ${missing.length} bilingual project column(s): ${missing.map(m => m[0]).join(', ')}`);
}

module.exports = initProjectI18n;
