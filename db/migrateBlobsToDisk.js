/* Copy every LONGBLOB out of MySQL and onto the mounted Railway Volume.
 *
 *   node db/migrateBlobsToDisk.js            -> copy blobs to disk, set `path`
 *   node db/migrateBlobsToDisk.js --purge    -> then NULL the copied blobs
 *   node db/migrateBlobsToDisk.js --verify   -> report only, change nothing
 *
 * MUST run where the Volume is mounted (i.e. on Railway, not your laptop) —
 * otherwise the files land somewhere the app can't read. Set MIGRATE_BLOBS=1 on
 * the service to have server.js run it once at boot; that is the easy path.
 *
 * Safe to interrupt and re-run: a row is only skipped once its bytes are on
 * disk and its `path` is set, and the blob is never dropped until --purge has
 * re-checked the file's size against the row.
 */
require('dotenv').config();
const fs    = require('fs');
const pool  = require('./connection');
const files = require('../storage/files');

// `optimizable` marks the image tables, whose files may legitimately differ in
// size from the original blob once db/optimizeImages.js has recompressed them.
const TABLES = [
    { table: 'media',        pk: 'id',   kind: 'media',        optimizable: true  },
    { table: 'page_images',  pk: 'slot', kind: 'page-images',  optimizable: true  },
    { table: 'banner_clips', pk: 'slot', kind: 'banner-clips', optimizable: false },
];

const mb = n => (Number(n) / 1048576).toFixed(1) + ' MB';
const RETRYABLE = /ECONNRESET|PROTOCOL_CONNECTION_LOST|ETIMEDOUT|ECONNREFUSED|EPIPE|server has gone away/i;

// Blob reads through the Railway proxy drop often enough on a 2 GB run that a
// per-query retry is the difference between finishing and not.
async function q(sql, params) {
    for (let attempt = 1; ; attempt++) {
        try { return await pool.query(sql, params); }
        catch (e) {
            if (attempt >= 5 || !RETRYABLE.test(e.message + ' ' + (e.code || ''))) throw e;
            const wait = [2, 5, 15, 30][attempt - 1] || 30;
            console.log(`  ⚠ ${e.code || e.message} — retrying in ${wait}s (${attempt + 1}/5)`);
            await new Promise(r => setTimeout(r, wait * 1000));
        }
    }
}

async function hasColumn(table, col) {
    const [[row]] = await q(
        `SELECT COUNT(*) AS c FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`, [table, col]);
    return !!row.c;
}

// The `path` column is normally added by the route init functions at boot, but
// this script must also work when run before the new code is deployed.
async function ensureColumns() {
    for (const { table } of TABLES) {
        if (!await hasColumn(table, 'path')) {
            console.log(`  + adding ${table}.path`);
            await q(`ALTER TABLE ${table} ADD COLUMN path VARCHAR(255) NULL`);
        }
        // New rows no longer write bytes, so the legacy column must accept NULL.
        await q(`ALTER TABLE ${table} MODIFY data LONGBLOB NULL`).catch(() => {});
    }
}

async function copyTable({ table, pk, kind }) {
    if (!await hasColumn(table, 'data')) {
        console.log(`\n${table}: no \`data\` column — already fully migrated.`);
        return { copied: 0, bytes: 0 };
    }
    // Only untouched rows: resumability falls out of the WHERE clause.
    const [rows] = await q(
        `SELECT ${pk} AS pk, mime, LENGTH(data) AS len FROM ${table}
          WHERE data IS NOT NULL AND (path IS NULL OR path = '') ORDER BY ${pk}`);
    if (!rows.length) { console.log(`\n${table}: nothing left to copy.`); return { copied: 0, bytes: 0 }; }

    const total = rows.reduce((a, r) => a + Number(r.len), 0);
    console.log(`\n${table}: ${rows.length} blobs, ${mb(total)} to copy`);

    let copied = 0, bytes = 0;
    for (const r of rows) {
        const name = String(r.pk).replace(/[^A-Za-z0-9._-]/g, '_');
        // Fetched one row at a time: a 27 MB clip should never share a buffer
        // with anything else, and this keeps peak memory near one blob.
        const [[blob]] = await q(`SELECT data FROM ${table} WHERE ${pk} = ?`, [r.pk]);
        if (!blob || !blob.data) continue;

        const rel = files.save(kind, name, r.mime, blob.data);
        const written = fs.statSync(files.absolute(rel)).size;
        if (written !== blob.data.length) {
            throw new Error(`${table}/${r.pk}: wrote ${written} bytes, expected ${blob.data.length}`);
        }
        await q(`UPDATE ${table} SET path = ? WHERE ${pk} = ?`, [rel, r.pk]);

        copied++; bytes += written;
        process.stdout.write(`\r  ${copied}/${rows.length}  ${mb(bytes)} / ${mb(total)}   `);
    }
    console.log(`\n  ✅ ${table}: ${copied} files, ${mb(bytes)} on the volume`);
    return { copied, bytes };
}

// Only drops a blob once the file on disk is confirmed good. Normally that means
// a byte-for-byte size match; a row that db/optimizeImages.js has recompressed is
// expected to be smaller, so there we only require a non-empty file.
async function purgeTable({ table, pk, optimizable }) {
    if (!await hasColumn(table, 'data')) return 0;
    const optCol = optimizable && await hasColumn(table, 'optimized_at');
    const [rows] = await q(
        `SELECT ${pk} AS pk, path, LENGTH(data) AS len, ${optCol ? 'optimized_at' : 'NULL'} AS opt
           FROM ${table} WHERE data IS NOT NULL AND path IS NOT NULL AND path <> ''`);
    let purged = 0, skipped = 0;
    for (const r of rows) {
        let size = -1;
        try { size = fs.statSync(files.absolute(r.path)).size; } catch {}
        const ok = r.opt ? size > 0 : size === Number(r.len);
        if (!ok) {
            console.log(`  ⚠ ${table}/${r.pk}: on-disk ${size} vs blob ${r.len} — keeping the blob`);
            skipped++; continue;
        }
        await q(`UPDATE ${table} SET data = NULL WHERE ${pk} = ?`, [r.pk]);
        purged++;
    }
    console.log(`  ${table}: ${purged} blobs cleared${skipped ? `, ${skipped} kept for review` : ''}`);
    return skipped;
}

async function report() {
    console.log('\n=== STATE ===');
    for (const { table } of TABLES) {
        const hasData = await hasColumn(table, 'data');
        const hasPath = await hasColumn(table, 'path');
        const cols = hasData
            ? `SUM(data IS NOT NULL) AS blobs, IFNULL(SUM(LENGTH(data)),0) AS blobBytes,`
            : `0 AS blobs, 0 AS blobBytes,`;
        const onDisk = hasPath ? `SUM(path IS NOT NULL AND path <> '')` : `0`;
        const [[r]] = await q(
            `SELECT COUNT(*) AS n, ${cols} ${onDisk} AS onDisk FROM ${table}`);
        console.log(`  ${table.padEnd(14)} rows ${String(r.n).padStart(5)}   on-disk ${String(r.onDisk).padStart(5)}   `
                  + `blobs-left ${String(r.blobs).padStart(5)} (${mb(r.blobBytes)})`);
    }
    const u = files.usage();
    console.log(`  volume ${files.DATA_DIR}: ${u.files} files, ${mb(u.bytes)}`);
}

async function main() {
    const purge  = process.argv.includes('--purge');
    const verify = process.argv.includes('--verify');
    console.log(`Volume: ${files.DATA_DIR}`);
    if (!fs.existsSync(files.DATA_DIR)) fs.mkdirSync(files.DATA_DIR, { recursive: true });

    if (verify) { await report(); return; }

    await ensureColumns();
    let bytes = 0;
    for (const t of TABLES) bytes += (await copyTable(t)).bytes;
    console.log(`\nCopied ${mb(bytes)} to the volume.`);

    if (purge) {
        console.log('\n=== PURGING COPIED BLOBS FROM MYSQL ===');
        let skipped = 0;
        for (const t of TABLES) skipped += await purgeTable(t);
        console.log(skipped
            ? `\n⚠ ${skipped} row(s) kept their blob — re-run without --purge, then --purge again.`
            : '\n✅ All copied blobs cleared. Run db/dropBlobColumns.js to reclaim the disk.');
    } else {
        console.log('\nBlobs are still in MySQL as a safety net.');
        console.log('Verify the site renders, then re-run with --purge.');
    }
    await report();
}

if (require.main === module) {
    main().then(() => process.exit(0)).catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
}
// Used by server.js when MIGRATE_BLOBS is set, so the whole migration can be
// driven from Railway environment variables without container shell access.
async function copyAll({ purge = false } = {}) {
    await ensureColumns();
    for (const t of TABLES) await copyTable(t);
    if (!purge) return;
    console.log('=== purging copied blobs from MySQL ===');
    let skipped = 0;
    for (const t of TABLES) skipped += await purgeTable(t);
    if (skipped) console.log(`⚠ ${skipped} row(s) kept their blob — redeploy to retry.`);
    await report();
}

module.exports = { copyAll, report };
