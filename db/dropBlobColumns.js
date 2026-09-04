/* Final step: drop the now-empty LONGBLOB columns and hand the disk back.
 *
 *   node db/dropBlobColumns.js           -> show what would happen
 *   node db/dropBlobColumns.js --yes     -> actually drop + rebuild
 *
 * Run this only after db/migrateBlobsToDisk.js --purge reports zero blobs left.
 * It refuses to touch a table that still holds any bytes.
 *
 * Why the OPTIMIZE: on MySQL 8 a DROP COLUMN is often INSTANT, which updates
 * the table definition without rewriting the tablespace — so the 2 GB stays
 * allocated on the Railway volume until the table is rebuilt.
 */
require('dotenv').config();
const pool = require('./connection');

const TABLES = ['media', 'page_images', 'banner_clips'];
const mb = n => (Number(n) / 1048576).toFixed(1) + ' MB';

async function hasColumn(table, col) {
    const [[row]] = await pool.query(
        `SELECT COUNT(*) AS c FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`, [table, col]);
    return !!row.c;
}

async function sizeOf(table) {
    const [[r]] = await pool.query(
        `SELECT data_length + index_length AS bytes FROM information_schema.tables
          WHERE table_schema = DATABASE() AND table_name = ?`, [table]);
    return r ? Number(r.bytes) : 0;
}

async function main() {
    const go = process.argv.includes('--yes');
    if (!go) console.log('DRY RUN — pass --yes to apply.\n');

    let before = 0, after = 0;
    for (const t of TABLES) {
        const sz = await sizeOf(t);
        before += sz;

        if (!await hasColumn(t, 'data')) {
            console.log(`${t}: no \`data\` column — already dropped. (${mb(sz)})`);
            after += await sizeOf(t);
            continue;
        }
        const [[r]] = await pool.query(`SELECT SUM(data IS NOT NULL) AS left_ FROM ${t}`);
        if (Number(r.left_) > 0) {
            console.log(`${t}: ⛔ ${r.left_} row(s) still hold bytes — run migrateBlobsToDisk.js --purge first. Skipping.`);
            after += sz;
            continue;
        }
        console.log(`${t}: ${mb(sz)} allocated, 0 blobs remaining → drop column + rebuild`);
        if (!go) { after += sz; continue; }

        await pool.query(`ALTER TABLE ${t} DROP COLUMN data`);
        console.log(`  dropped. rebuilding (this reclaims the space)…`);
        await pool.query(`OPTIMIZE TABLE ${t}`);
        const now = await sizeOf(t);
        after += now;
        console.log(`  ✅ ${mb(sz)} → ${mb(now)}`);
    }
    console.log(`\nTotal: ${mb(before)} → ${mb(after)}  (freed ${mb(before - after)})`);
    if (!go) console.log('\nNothing was changed. Re-run with --yes.');
}

main().then(() => process.exit(0)).catch(e => { console.error('FAILED:', e.message); process.exit(1); });
