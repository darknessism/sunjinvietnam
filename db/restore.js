/* Replay a backup produced by db/backup.js into the database configured in
 * .env (or MYSQL_URL). This DROPS and recreates every table in the dump.
 *
 *   node db/restore.js backups/sunjin-backup-2026-07-16-10-30.sql --yes
 *
 * The dump format guarantees one statement per line, so this streams the file
 * and executes it line-by-line — no full-file buffering, blobs included.
 */
require('dotenv').config();
const fs       = require('fs');
const readline = require('readline');
const pool     = require('./connection');

async function main() {
    const file = process.argv[2];
    const yes  = process.argv.includes('--yes');
    if (!file || !fs.existsSync(file)) {
        console.error('Usage: node db/restore.js <backup.sql> --yes');
        process.exit(1);
    }
    if (!yes) {
        console.error('This will DROP and recreate every table in the dump on the target database.');
        console.error('Target: ' + (process.env.MYSQLHOST || 'localhost') + '/' + (process.env.MYSQLDATABASE || ''));
        console.error('Re-run with --yes to proceed.');
        process.exit(1);
    }

    const rl = readline.createInterface({
        input: fs.createReadStream(file, { encoding: 'utf8' }),
        crlfDelay: Infinity,
    });

    let n = 0;
    for await (const line of rl) {
        const sql = line.trim();
        if (!sql || sql.startsWith('--')) continue;
        await pool.query(sql.endsWith(';') ? sql.slice(0, -1) : sql);
        n++;
        if (n % 100 === 0) process.stdout.write(`\r${n} statements…`);
    }
    console.log(`\r✅ Restore complete: ${n} statements executed.`);
    await pool.end();
}

main().catch(e => { console.error('\nRestore FAILED:', e.message); process.exit(1); });
