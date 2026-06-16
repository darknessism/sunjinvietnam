const pool = require('./connection');

// Default filter options, seeded only when career_taxonomies is empty.
const SEED = [
    ['department', 'design',       'Design',           1],
    ['department', 'interior',     'Interior',         2],
    ['department', 'urbanplan',    'Urban Plan',       3],
    ['department', 'construction', 'Construction',     4],
    ['department', 'general',      'General Affairs',  5],
    ['location',   'hanoi',        'Hanoi',            1],
    ['location',   'danang',       'Da Nang',          2],
    ['location',   'hcm',          'Ho Chi Minh City', 3],
    ['location',   'phuquoc',      'Phu Quoc',         4],
    ['level',      'entry',        'Entry',            1],
    ['level',      'intermediate', 'Intermediate',     2],
    ['level',      'expert',       'Expert',           3],
];

// Ensure the career_taxonomies table exists and is seeded with the defaults.
// Runs once at startup so a fresh deploy works without a manual migration.
async function initCareerTax() {
    await pool.query(`CREATE TABLE IF NOT EXISTS career_taxonomies (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        kind       ENUM('department','location','level') NOT NULL,
        value      VARCHAR(60)  NOT NULL,
        label      VARCHAR(120) NOT NULL,
        sort       INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_kind_value (kind, value)
    )`);
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM career_taxonomies');
    if (!n) {
        await pool.query(
            'INSERT INTO career_taxonomies (kind, value, label, sort) VALUES ?',
            [SEED]
        );
        console.log(`✅ Seeded ${SEED.length} career filter options.`);
    }
}

module.exports = initCareerTax;
