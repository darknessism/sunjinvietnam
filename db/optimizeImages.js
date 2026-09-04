/* Recompress every image already sitting on the volume to WebP at display size.
 *
 *   node db/optimizeImages.js            -> dry run: report the savings
 *   node db/optimizeImages.js --yes      -> rewrite the files and update MySQL
 *
 * MUST run where the Volume is mounted. Set OPTIMIZE_IMAGES=1 on the Railway
 * service to have server.js run it once at boot.
 *
 * Run this only after db/migrateBlobsToDisk.js has copied everything across.
 * Recompression is lossy and rewrites the stored file, so either keep the blobs
 * in MySQL as the backup (i.e. run this before --purge) or tar /data first.
 * Resumable: a row is skipped once optimized_at is set.
 *
 * Tuning: IMAGE_MAX_EDGE (default 1600), IMAGE_QUALITY (default 78).
 */
require('dotenv').config();
const fs        = require('fs');
const pool      = require('./connection');
const files     = require('../storage/files');
const optimizer = require('../storage/optimize');

const TABLES = [
    { table: 'media',       pk: 'id',   kind: 'media'       },
    { table: 'page_images', pk: 'slot', kind: 'page-images' },
];

const mb = n => (Number(n) / 1048576).toFixed(1) + ' MB';

async function hasColumn(table, col) {
    const [[row]] = await pool.query(
        `SELECT COUNT(*) AS c FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`, [table, col]);
    return !!row.c;
}

async function run({ table, pk, kind }, apply) {
    // Nothing to optimise until the blobs have been moved onto the volume.
    if (!await hasColumn(table, 'path')) {
        console.log(`
${table}: no \`path\` column yet - run db/migrateBlobsToDisk.js first.`);
        return { before: 0, after: 0, n: 0 };
    }
    // A dry run must not touch the schema, so the column is only added when
    // actually applying; until then every row simply counts as un-optimised.
    let tracked = await hasColumn(table, 'optimized_at');
    if (!tracked && apply) {
        await pool.query(`ALTER TABLE ${table} ADD COLUMN optimized_at DATETIME NULL`);
        tracked = true;
    }
    const [rows] = await pool.query(
        `SELECT ${pk} AS pk, mime, path FROM ${table}
          WHERE path IS NOT NULL AND path <> ''${tracked ? ' AND optimized_at IS NULL' : ''}
          ORDER BY ${pk}`);
    const todo = rows.filter(r => optimizer.isConvertible(r.mime));
    if (!todo.length) { console.log(`\n${table}: nothing to optimise.`); return { before: 0, after: 0, n: 0 }; }

    console.log(`\n${table}: ${todo.length} images to consider`);
    let before = 0, after = 0, done = 0, kept = 0;

    for (const r of todo) {
        let abs;
        try { abs = files.absolute(r.path); } catch { continue; }
        let buf;
        try { buf = fs.readFileSync(abs); }
        catch (e) { console.log(`\n  warn ${r.pk}: ${e.code} - skipping`); continue; }

        const opt = await optimizer.optimize(buf, r.mime);
        if (!opt) {
            kept++;
            // Mark it anyway so a re-run doesn't reconsider a file already judged.
            if (apply) await pool.query(`UPDATE ${table} SET optimized_at = NOW() WHERE ${pk} = ?`, [r.pk]);
            continue;
        }
        before += buf.length;
        after  += opt.buffer.length;

        if (apply) {
            const name = String(r.pk).replace(/[^A-Za-z0-9._-]/g, '_');
            const rel  = files.save(kind, name, opt.mime, opt.buffer);
            // Point the row at the new file BEFORE deleting the old one, so an
            // interruption can only ever leave an orphan, never a dead link.
            await pool.query(
                `UPDATE ${table} SET mime = ?, path = ?, optimized_at = NOW() WHERE ${pk} = ?`,
                [opt.mime, rel, r.pk]);
            if (rel !== r.path) files.remove(r.path);
        }
        done++;
        process.stdout.write(`\r  ${done}/${todo.length}  ${mb(before)} -> ${mb(after)}   `);
    }
    console.log(`\n  ${apply ? 'recompressed' : 'would recompress'} ${done}, keep ${kept} as-is`
              + `  (${mb(before)} -> ${mb(after)})`);
    return { before, after, n: done };
}

async function main(apply = process.argv.includes('--yes')) {
    if (!optimizer.available()) { console.error('sharp is not available here - cannot optimise.'); return; }
    console.log(`Volume: ${files.DATA_DIR}`);
    console.log(`Target: max ${optimizer.MAX_EDGE}px, WebP q${optimizer.QUALITY}`);
    if (!apply) console.log('\nDRY RUN - pass --yes to apply.');

    let before = 0, after = 0, n = 0;
    for (const t of TABLES) {
        const r = await run(t, apply);
        before += r.before; after += r.after; n += r.n;
    }

    const pct = before ? (100 - after / before * 100).toFixed(1) : '0';
    console.log(`\n${apply ? 'Recompressed' : 'Would recompress'} ${n} images: ${mb(before)} -> ${mb(after)}  (-${pct}%)`);
    const u = files.usage();
    console.log(`Volume now holds ${u.files} files, ${mb(u.bytes)}`);
    if (!apply) console.log('\nNothing was changed.');
}

if (require.main === module) {
    main().then(() => process.exit(0)).catch(e => { console.error('FAILED:', e.message); process.exit(1); });
}
module.exports = { optimizeAll: () => main(true) };
