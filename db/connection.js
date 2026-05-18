const mysql = require('mysql2/promise');

// Railway injects MYSQLHOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE, MYSQLPORT
const pool = mysql.createPool({
    host:     process.env.MYSQLHOST     || 'localhost',
    port:     parseInt(process.env.MYSQLPORT || '3306'),
    user:     process.env.MYSQLUSER     || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || 'sunjin',
    waitForConnections: true,
    connectionLimit:    10,
    timezone: '+00:00',
});

module.exports = pool;
