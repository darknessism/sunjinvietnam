const mysql = require('mysql2/promise');

// Railway exposes the MySQL service either as discrete vars
// (MYSQLHOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE, MYSQLPORT)
// or as a single connection URL (MYSQL_URL / DATABASE_URL).
// Support both so linking the DB on Railway is a one-variable step.
function buildConfig() {
    const url = process.env.MYSQL_URL || process.env.DATABASE_URL;
    if (url) {
        const u = new URL(url);
        return {
            host:     u.hostname,
            port:     parseInt(u.port || '3306'),
            user:     decodeURIComponent(u.username),
            password: decodeURIComponent(u.password),
            database: u.pathname.replace(/^\//, ''),
        };
    }
    return {
        host:     process.env.MYSQLHOST     || 'localhost',
        port:     parseInt(process.env.MYSQLPORT || '3306'),
        user:     process.env.MYSQLUSER     || 'root',
        password: process.env.MYSQLPASSWORD || '',
        database: process.env.MYSQLDATABASE || 'sunjin',
    };
}

const cfg = buildConfig();

const pool = mysql.createPool({
    ...cfg,
    waitForConnections: true,
    connectionLimit:    10,
    timezone: '+00:00',
});

// Surface connectivity problems loudly at startup instead of failing
// silently (which previously showed up as "no positions" in the UI).
pool.getConnection()
    .then(conn => {
        console.log(`✅ MySQL connected — ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
        conn.release();
    })
    .catch(err => {
        console.error(`❌ MySQL connection FAILED — ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
        console.error(`   ${err.code || ''} ${err.message}`);
        console.error('   On Railway: ensure the app service has the MySQL variables ' +
                      '(reference MYSQL_URL or MYSQLHOST/PORT/USER/PASSWORD/DATABASE from the MySQL service).');
    });

module.exports = pool;
