/* Dump the entire project database (schema + data, blobs included) to a local
 * .sql file that can be replayed to rebuild the DB from scratch.
 *
 *   node db/backup.js            -> backups/sunjin-backup-YYYY-MM-DD-HHMM.sql
 *
 * The dump is standard SQL (works with the mysql CLI too), but every statement
 * is written on ONE line so the companion db/restore.js can stream it back
 * line-by-line without a full SQL parser. Blobs are hex literals (X'..'),
 * strings are escaped by sqlstring, so no statement ever contains a raw newline.
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const pool = require('./connection');

// Blob-heavy tables get one row per INSERT (a banner clip can be ~28 MB -> a
// ~55 MB hex literal, which must stay under max_allowed_packet on restore).
const BLOB_TABLES = new Set(['media', 'banner_clips', 'page_images']);
const ROWS_PER_INSERT = 100;   // for regular tables
const BATCH_FETCH     = 200;   // rows fetched per keyset query (1 for blob tables)

async function main() {
    const dir = path.join(__dirname, '..', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
    const file  = path.join(dir, `sunjin-backup-${stamp}.sql`);
    const out   = fs.createWriteStream(file);
    const write = s => new Promise(res => out.write(s, res));

    const [tables] = await pool.query(
        `SELECT TABLE_NAME AS t FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`
    );

    await write(`-- SUNJIN Vietnam database backup ${new Date().toISOString()}\n`);
    await write(`-- Restore with: node db/restore.js backups/<this file> --yes\n`);
    await write(`SET NAMES utf8mb4;\n`);
    await write(`SET FOREIGN_KEY_CHECKS=0;\n`);

    for (const { t } of tables) {
        const [[create]] = await pool.query(`SHOW CREATE TABLE \`${t}\``);
        const createSql = create['Create Table'].replace(/\s*\n\s*/g, ' ');
        await write(`DROP TABLE IF EXISTS \`${t}\`;\n`);
        await write(createSql + ';\n');

        // Single-column primary key for keyset pagination (all our tables have one).
        const [[pkRow]] = await pool.query(
            `SELECT COLUMN_NAME AS c FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
             ORDER BY ORDINAL_POSITION LIMIT 1`, [t]
        );
        const pk = pkRow && pkRow.c;
        const isBlob = BLOB_TABLES.has(t);
        const fetchN = isBlob ? 1 : BATCH_FETCH;
        const perInsert = isBlob ? 1 : ROWS_PER_INSERT;

        let last = null, total = 0, cols = null;
        for (;;) {
            const where = last === null ? '' : `WHERE \`${pk}\` > ${pool.escape(last)}`;
            const [rows] = await pool.query(
                `SELECT * FROM \`${t}\` ${where} ORDER BY \`${pk}\` LIMIT ${fetchN}`
            );
            if (!rows.length) break;
            if (!cols) cols = Object.keys(rows[0]);
            const colSql = cols.map(c => `\`${c}\``).join(',');

            for (let i = 0; i < rows.length; i += perInsert) {
                const chunk = rows.slice(i, i + perInsert);
                const values = chunk.map(r =>
                    '(' + cols.map(c => pool.escape(r[c])).join(',') + ')'
                ).join(',');
                await write(`INSERT INTO \`${t}\` (${colSql}) VALUES ${values};\n`);
            }
            total += rows.length;
            last = rows[rows.length - 1][pk];
            if (isBlob) process.stdout.write(`\r${t}: ${total} rows…   `);
        }
        console.log(`\r${t}: ${total} rows dumped        `);
    }

    await write(`SET FOREIGN_KEY_CHECKS=1;\n`);
    await new Promise(res => out.end(res));
    const mb = (fs.statSync(file).size / 1024 / 1024).toFixed(1);
    console.log(`\n✅ Backup complete: ${file} (${mb} MB)`);
    await pool.end();
}

main().catch(e => { console.error('Backup FAILED:', e.message); process.exit(1); });
