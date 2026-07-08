const pool = require('./connection');

// Bilingual project content: Vietnamese stays in the original columns,
// English lives in matching *_en columns. The card title lives in projects;
// the detail-page content lives in project_details. Added idempotently at
// startup so an existing deployment gains the columns without a manual migration.
const DETAIL_COLUMNS = [
    ['title_display_en', 'VARCHAR(255)'],
    ['lead_en',       'TEXT'],
    ['narrative1_en', 'JSON'],
    ['narrative2_en', 'JSON'],
    ['highlights_en', 'JSON'],
    ['photo1_cap_en', 'TEXT'],
    ['photo2_cap_en', 'TEXT'],
    ['photo3_cap_en', 'TEXT'],
];
const PROJECT_COLUMNS = [
    ['title_en', 'VARCHAR(255)'],
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

async function initProjectI18n() {
    await ensureColumns('project_details', DETAIL_COLUMNS);
    await ensureColumns('projects', PROJECT_COLUMNS);
}

module.exports = initProjectI18n;
