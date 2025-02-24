import mysql from 'mysql2/promise';

const db = mysql.createConnection({
    host: 'localhost',
    user: 'bee_user',
    password: 'G_rizzy3430@',
    database: 'bee_balanced_db'
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err.stack);
        return;
    }
    console.log('Connected to MySQL database');
});

module.exports = db;
