/**
 * Bulk project importer
 * Usage: node db/import.js <path-to-csv>
 * Example: node db/import.js db/projects_import.csv
 *
 * CSV delimiter rules for JSON columns:
 *   images       — pipe-separated URLs:        https://a.jpg|https://b.jpg
 *   narrative1   — paragraphs separated by ||: First para||Second para
 *   narrative2   — same as narrative1
 *   highlights   — pipe-separated strings:     Point one|Point two
 *   specs        — key=value pipe-separated:   Area=1 200 m²|Year=2024
 *   credits      — role=name pipe-separated:   Lead Architect=KTS Tran|Team=Nguyen Van A
 *   awards       — pipe-separated strings:     Award One|Award Two
 *
 * Note: next_id / next_title / next_type / next_img columns have been removed.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs    = require('fs');
const path  = require('path');
const mysql = require('mysql2/promise');

// ── helpers ──────────────────────────────────────────────────────────────────

function slugify(str) {
    return str.toLowerCase()
        .replace(/[àáâãäå]/g,'a').replace(/[èéêë]/g,'e')
        .replace(/[ìíîï]/g,'i').replace(/[òóôõö]/g,'o')
        .replace(/[ùúûü]/g,'u').replace(/[ý]/g,'y')
        .replace(/[đ]/g,'d').replace(/[ơ]/g,'o').replace(/[ư]/g,'u')
        .replace(/[ắặằẳẵ]/g,'a').replace(/[ếệềểễ]/g,'e')
        .replace(/[ốộồổỗ]/g,'o').replace(/[ứựừửữ]/g,'u')
        .replace(/[ấậầẩẫ]/g,'a').replace(/[íị]/g,'i')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim().replace(/\s+/g, '-').replace(/-+/g, '-')
        .slice(0, 100);
}

function parsePipe(val)       { return val ? val.split('|').map(s => s.trim()).filter(Boolean) : []; }
function parseParagraphs(val) { return val ? val.split('||').map(s => s.trim()).filter(Boolean) : []; }
function parsePairs(val)      {
    return parsePipe(val).map(item => {
        const eq = item.indexOf('=');
        return eq === -1
            ? { label: item.trim(), value: '' }
            : { label: item.slice(0, eq).trim(), value: item.slice(eq + 1).trim() };
    });
}

// Simple RFC 4180-compliant CSV parser
function parseCSV(text) {
    const rows = [];
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let i = 0, headers = null;

    function readField() {
        if (i >= lines.length) return '';
        if (lines[i] === '"') {
            i++; let f = '';
            while (i < lines.length) {
                if (lines[i] === '"' && lines[i+1] === '"') { f += '"'; i += 2; }
                else if (lines[i] === '"') { i++; break; }
                else { f += lines[i++]; }
            }
            return f;
        }
        let f = '';
        while (i < lines.length && lines[i] !== ',' && lines[i] !== '\n') f += lines[i++];
        return f.trim();
    }

    function readRow() {
        const row = [];
        while (i < lines.length && lines[i] !== '\n') {
            row.push(readField());
            if (i < lines.length && lines[i] === ',') i++;
        }
        if (lines[i] === '\n') i++;
        return row;
    }

    while (i < lines.length) {
        const row = readRow();
        if (row.every(c => c === '')) continue;
        if (!headers) { headers = row; continue; }
        const obj = {};
        headers.forEach((h, idx) => { obj[h.trim()] = (row[idx] || '').trim(); });
        rows.push(obj);
    }
    return rows;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
    const csvPath = process.argv[2];
    if (!csvPath) {
        console.error('Usage: node db/import.js <path-to-csv>');
        process.exit(1);
    }

    const absPath = path.resolve(csvPath);
    if (!fs.existsSync(absPath)) {
        console.error('File not found:', absPath);
        process.exit(1);
    }

    const rows = parseCSV(fs.readFileSync(absPath, 'utf8'));
    if (!rows.length) { console.log('No rows to import.'); return; }

    const conn = await mysql.createConnection({
        host:     process.env.MYSQLHOST,
        port:     process.env.MYSQLPORT,
        user:     process.env.MYSQLUSER,
        password: process.env.MYSQLPASSWORD,
        database: process.env.MYSQLDATABASE,
    });

    let inserted = 0, updated = 0, errors = 0;

    for (const r of rows) {
        if (!r.title) { console.warn('  SKIP — missing title:', JSON.stringify(r)); continue; }

        const id        = r.id || slugify(r.title) + '-' + Date.now();
        const status    = r.status === 'draft' ? 'draft' : 'published';
        const cols      = parseInt(r.cols) || 12;
        const year      = parseInt(r.year) || null;
        const createdAt = r.created_at || new Date().toISOString().slice(0, 10);

        try {
            // ── projects row ────────────────────────────────────────────────
            await conn.query(
                `INSERT INTO projects
                    (id, title, category, location, year, award, architects,
                     cover_image, status, cols, scale, investor, construction_status, created_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE
                    title=VALUES(title), category=VALUES(category),
                    location=VALUES(location), year=VALUES(year),
                    award=VALUES(award), architects=VALUES(architects),
                    cover_image=VALUES(cover_image), status=VALUES(status),
                    scale=VALUES(scale), investor=VALUES(investor),
                    construction_status=VALUES(construction_status)`,
                [id, r.title, r.category || 'planning', r.location || '',
                 year, r.award || '', r.architects || '',
                 r.cover_image || '', status, cols,
                 r.scale || null, r.investor || null, r.construction_status || null,
                 createdAt]
            );

            // ── project_details row ─────────────────────────────────────────
            const hasDetail = r.lead || r.title_plain || r.images;
            if (hasDetail) {
                const images    = JSON.stringify(parsePipe(r.images));
                const narrative1 = JSON.stringify(parseParagraphs(r.narrative1));
                const narrative2 = JSON.stringify(parseParagraphs(r.narrative2));
                const highlights = JSON.stringify(parsePipe(r.highlights));
                const specs      = JSON.stringify(parsePairs(r.specs));
                const credits    = JSON.stringify(parsePairs(r.credits));
                const awards     = JSON.stringify(parsePipe(r.awards));

                await conn.query(
                    `INSERT INTO project_details
                        (project_id, title_plain, title_display, category_label,
                         year_loc, award, images, \`lead\`,
                         photo1_alt, photo1_cap, photo2_alt, photo2_cap,
                         photo3_alt, photo3_cap,
                         narrative1, narrative2, highlights, specs,
                         credits, awards_list)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                     ON DUPLICATE KEY UPDATE
                        title_plain=VALUES(title_plain),
                        title_display=VALUES(title_display),
                        category_label=VALUES(category_label),
                        year_loc=VALUES(year_loc), award=VALUES(award),
                        images=VALUES(images), \`lead\`=VALUES(\`lead\`),
                        photo1_alt=VALUES(photo1_alt), photo1_cap=VALUES(photo1_cap),
                        photo2_alt=VALUES(photo2_alt), photo2_cap=VALUES(photo2_cap),
                        photo3_alt=VALUES(photo3_alt), photo3_cap=VALUES(photo3_cap),
                        narrative1=VALUES(narrative1), narrative2=VALUES(narrative2),
                        highlights=VALUES(highlights), specs=VALUES(specs),
                        credits=VALUES(credits), awards_list=VALUES(awards_list)`,
                    [id,
                     r.title_plain || r.title,
                     r.title_display || r.title,
                     r.category_label || r.category || '',
                     r.year_loc || [year, r.location].filter(Boolean).join(' · '),
                     r.award || '',
                     images, r.lead || '',
                     r.photo1_alt || '', r.photo1_cap || '',
                     r.photo2_alt || '', r.photo2_cap || '',
                     r.photo3_alt || '', r.photo3_cap || '',
                     narrative1, narrative2, highlights, specs,
                     credits, awards]
                );
            }

            inserted++;
            process.stdout.write(`  OK [${inserted}] ${r.title}\n`);
        } catch (e) {
            errors++;
            console.error(`  ERR ${r.title}: ${e.message}`);
        }
    }

    await conn.end();
    console.log(`\nDone — ${inserted} upserted, ${errors} errors out of ${rows.length} rows.`);
}

main().catch(e => { console.error(e); process.exit(1); });
