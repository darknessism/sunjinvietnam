require('dotenv').config();
const mysql = require('mysql2/promise');

const tables = [
    `CREATE TABLE IF NOT EXISTS projects (
        id                   VARCHAR(120) PRIMARY KEY,
        title                VARCHAR(255) NOT NULL,
        category             VARCHAR(60),
        location             VARCHAR(255),
        year                 INT,
        award                TEXT,
        architects           TEXT,
        cover_image          TEXT,
        status               ENUM('published','draft') DEFAULT 'draft',
        cols                 INT DEFAULT 12,
        scale                VARCHAR(120),
        investor             VARCHAR(255),
        construction_status  VARCHAR(120),
        created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS project_details (
        project_id     VARCHAR(120) PRIMARY KEY,
        title_plain    VARCHAR(255),
        title_display  VARCHAR(255),
        category_label VARCHAR(120),
        year_loc       VARCHAR(120),
        award          TEXT,
        images         JSON,
        \`lead\`        TEXT,
        photo1_alt     VARCHAR(255),
        photo1_cap     TEXT,
        photo2_alt     VARCHAR(255),
        photo2_cap     TEXT,
        photo3_alt     VARCHAR(255),
        photo3_cap     TEXT,
        narrative1     JSON,
        narrative2     JSON,
        highlights     JSON,
        specs          JSON,
        credits        JSON,
        awards_list    JSON,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS blog_posts (
        id          VARCHAR(120) PRIMARY KEY,
        title       VARCHAR(255) NOT NULL,
        category    VARCHAR(60),
        author      VARCHAR(255),
        post_date   DATE,
        read_time   INT DEFAULT 5,
        excerpt     TEXT,
        cover_image TEXT,
        status      ENUM('published','draft') DEFAULT 'draft',
        cols        INT DEFAULT 12,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS blog_content (
        post_id           VARCHAR(120) PRIMARY KEY,
        \`lead\`           TEXT,
        body              JSON,
        pull_quote        TEXT,
        pull_quote_cite   VARCHAR(255),
        figure_image      TEXT,
        figure_caption    TEXT,
        body_after_figure JSON,
        tags              VARCHAR(500),
        related_posts     JSON,
        FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS careers (
        id           VARCHAR(120) PRIMARY KEY,
        title        VARCHAR(255) NOT NULL,
        department   VARCHAR(60),
        location     VARCHAR(60),
        level        VARCHAR(60),
        \`type\`      VARCHAR(60),
        salary       VARCHAR(120),
        deadline     DATE,
        cover_image  TEXT,
        description  TEXT,
        requirements TEXT,
        benefits     JSON,
        status       ENUM('published','draft') DEFAULT 'draft',
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS career_taxonomies (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        kind       ENUM('department','location','level') NOT NULL,
        value      VARCHAR(60)  NOT NULL,
        label      VARCHAR(120) NOT NULL,
        sort       INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_kind_value (kind, value)
    )`,
];

// Default filter options, seeded only when career_taxonomies is empty.
const TAXONOMY_SEED = [
    ['department', 'design',       'Design',          1],
    ['department', 'interior',     'Interior',        2],
    ['department', 'urbanplan',    'Urban Plan',      3],
    ['department', 'construction', 'Construction',    4],
    ['department', 'general',      'General Affairs', 5],
    ['location',   'hanoi',        'Hanoi',           1],
    ['location',   'danang',       'Da Nang',         2],
    ['location',   'hcm',          'Ho Chi Minh City',3],
    ['location',   'phuquoc',      'Phu Quoc',        4],
    ['level',      'entry',        'Entry',           1],
    ['level',      'intermediate', 'Intermediate',    2],
    ['level',      'expert',       'Expert',          3],
];

(async () => {
    const c = await mysql.createConnection({
        host:     process.env.MYSQLHOST,
        port:     process.env.MYSQLPORT,
        user:     process.env.MYSQLUSER,
        password: process.env.MYSQLPASSWORD,
        database: process.env.MYSQLDATABASE,
    });
    for (const sql of tables) {
        await c.query(sql);
    }
    const [[{ n }]] = await c.query('SELECT COUNT(*) AS n FROM career_taxonomies');
    if (!n) {
        await c.query(
            'INSERT INTO career_taxonomies (kind, value, label, sort) VALUES ?',
            [TAXONOMY_SEED]
        );
        console.log(`Seeded ${TAXONOMY_SEED.length} career filter options.`);
    }
    const [rows] = await c.query('SHOW TABLES');
    console.log('Tables ready:', rows.map(t => Object.values(t)[0]).join(', '));
    await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
