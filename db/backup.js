/* Dump the entire project database (schema + data, blobs included) to a local
 * .sql file that can be replayed to rebuild the DB from scratch.
 *
 *   node db/backup.js                          -> backups/sunjin-backup-<stamp>.sql
 *   node db/backup.js --resume backups/f.sql   -> continue an interrupted dump
 *
 * The dump is standard SQL (works with the mysql CLI too), but every statement
 * is written on ONE line so the companion db/restore.js can stream it back
 * line-by-line without a full SQL parser. Blobs are hex literals (X'..'),
 * strings are escaped by sqlstring, so no statement ever contains a raw newline.
 *
 * Transient connection drops (ECONNRESET etc. — common on long runs through the
 * Railway proxy) are retried per-query with backoff; --resume recovers a run
 * that died anyway by scanning the partial file and continuing after the last
 * fully-written row.
 */
require('dotenv').config();
const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const pool     = require('./connection');

// Blob-heavy tables get one row per INSERT (a banner clip can be ~28 MB -> a
// ~55 MB hex literal, which must stay under max_allowed_packet on restore).
const BLOB_TABLES = new Set(['media', 'banner_clips', 'page_images']);
const ROWS_PER_INSERT = 100;   // for regular tables
const BATCH_FETCH     = 200;   // rows fetched per keyset query (1 for blob tables)

const RETRYABLE = /ECONNRESET|PROTOCOL_CONNECTION_LOST|ETIMEDOUT|ECONNREFUSED|EPIPE|server has gone away/i;
async function q(sql, params) {
    for (let attempt = 1; ; attempt++) {
        try { return await pool.query(sql, params); }
        catch (e) {
            if (attempt >= 5 || !RETRYABLE.test(e.message + ' ' + (e.code || ''))) throw e;
            const wait = [2, 5, 15, 30][attempt - 1] || 30;
            console.log(`\n⚠ ${e.code || e.message} — retrying in ${wait}s (attempt ${attempt + 1}/5)…`);
            await new Promise(r => setTimeout(r, wait * 1000));
        }
    }
}

// Scan a partial dump: last complete-line byte offset, plus per-table progress.
// PK tracking is only trusted for blob tables (one row per INSERT line, so the
// line-anchored first value IS that row's PK). Any trailing half-written line
// is cut off by resuming from `offset`.
async function scanPartial(file) {
    const size = fs.statSync(file).size;
    let offset = 0, lastTable = null, lastPk = null, lastTableStart = 0;
    const tablesSeen = new Set();
    const rl = readline.createInterface({
        input: fs.createReadStream(file, { encoding: 'utf8' }),
        crlfDelay: Infinity,
    });
    let scanned = 0;
    for await (const line of rl) {
        const lineBytes = Buffer.byteLength(line, 'utf8') + 1; // + '\n'
        // Only accept fully-written statements (they always end with ';')
        if (!line.trim().endsWith(';') && !line.startsWith('--')) break;
        let m;
        if ((m = line.match(/^DROP TABLE IF EXISTS `([^`]+)`/))) {
            lastTable = m[1]; lastPk = null; lastTableStart = offset; tablesSeen.add(m[1]);
        } else if ((m = line.match(/^INSERT INTO `([^`]+)` \([^)]*\) VALUES \((?:'((?:[^'\\]|\\.)*)'|(\d+))[,)]/))) {
            lastTable = m[1]; tablesSeen.add(m[1]);
            lastPk = m[3] !== undefined ? m[3] : m[2].replace(/\\(.)/g, '$1'); // unescape \' \\ etc.
        }
        offset += lineBytes;
        if (++scanned % 200 === 0) process.stdout.write(`\rScanning partial dump… ${(offset / 1024 / 1024).toFixed(0)} MB`);
    }
    rl.close();
    console.log(`\rScanned partial dump: ${(offset / 1024 / 1024).toFixed(1)} MB usable of ${(size / 1024 / 1024).toFixed(1)} MB`);
    return { offset, lastTable, lastPk, lastTableStart, tablesSeen };
}

async function main() {
    const resumeIdx = process.argv.indexOf('--resume');
    const resumeFile = resumeIdx > -1 ? process.argv[resumeIdx + 1] : null;

    const dir = path.join(__dirname, '..', 'backups');
    fs.mkdirSync(dir, { recursive: true });

    let file, out, skipTables = new Set(), inProgress = null, inProgressPk = null;
    if (resumeFile) {
        file = path.resolve(resumeFile);
        if (!fs.existsSync(file)) { console.error('Resume file not found: ' + file); process.exit(1); }
        const scan = await scanPartial(file);
        if (BLOB_TABLES.has(scan.lastTable) && scan.lastPk != null) {
            // Blob table (1 row/INSERT): PK parse is trustworthy — continue after it.
            fs.truncateSync(file, scan.offset);
            inProgress   = scan.lastTable;
            inProgressPk = scan.lastPk;
        } else {
            // Regular tables are small — cheaper and safer to redump the
            // interrupted one from its start.
            fs.truncateSync(file, scan.lastTableStart);
        }
        // Everything before the last (interrupted) table is complete.
        scan.tablesSeen.forEach(t => skipTables.add(t));
        skipTables.delete(scan.lastTable);
        out = fs.createWriteStream(file, { flags: 'a' });
        console.log(inProgress
            ? `Resuming: table ${inProgress} after PK ${String(inProgressPk).slice(0, 40)}`
            : `Resuming: redumping table ${scan.lastTable} from start`);
    } else {
        const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
        file = path.join(dir, `sunjin-backup-${stamp}.sql`);
        out  = fs.createWriteStream(file);
    }
    const write = s => new Promise(res => out.write(s, res));

    const [tables] = await q(
        `SELECT TABLE_NAME AS t FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`
    );

    if (!resumeFile) {
        await write(`-- SUNJIN Vietnam database backup ${new Date().toISOString()}\n`);
        await write(`-- Restore with: node db/restore.js backups/<this file> --yes\n`);
        await write(`SET NAMES utf8mb4;\n`);
        await write(`SET FOREIGN_KEY_CHECKS=0;\n`);
    }

    for (const { t } of tables) {
        if (skipTables.has(t)) { console.log(`${t}: already dumped, skipped`); continue; }
        const resumingThis = (t === inProgress);

        if (!resumingThis) {
            const [[create]] = await q(`SHOW CREATE TABLE \`${t}\``);
            const createSql = create['Create Table'].replace(/\s*\n\s*/g, ' ');
            await write(`DROP TABLE IF EXISTS \`${t}\`;\n`);
            await write(createSql + ';\n');
        }

        // Single-column primary key for keyset pagination (all our tables have one).
        const [[pkRow]] = await q(
            `SELECT COLUMN_NAME AS c FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
             ORDER BY ORDINAL_POSITION LIMIT 1`, [t]
        );
        const pk = pkRow && pkRow.c;
        const isBlob = BLOB_TABLES.has(t);
        const fetchN = isBlob ? 1 : BATCH_FETCH;
        const perInsert = isBlob ? 1 : ROWS_PER_INSERT;

        let last = resumingThis ? inProgressPk : null, total = 0, cols = null;
        for (;;) {
            const where = last === null ? '' : `WHERE \`${pk}\` > ${pool.escape(last)}`;
            const [rows] = await q(
                `SELECT * FROM \`${t}\` ${where} ORDER BY \`${pk}\` LIMIT ${fetchN}`
            );
            if (!rows.length) break;
            if (!cols) {
                cols = Object.keys(rows[0]);
                if (cols[0] !== pk) throw new Error(`${t}: PK ${pk} is not the first column — resume scan would misread it`);
            }
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
        console.log(`\r${t}: ${total} rows dumped${resumingThis ? ' (resumed)' : ''}        `);
    }

    await write(`SET FOREIGN_KEY_CHECKS=1;\n`);
    await new Promise(res => out.end(res));
    const mb = (fs.statSync(file).size / 1024 / 1024).toFixed(1);
    console.log(`\n✅ Backup complete: ${file} (${mb} MB)`);
    await pool.end();
}

main().catch(e => { console.error('Backup FAILED:', e.message); process.exit(1); });
