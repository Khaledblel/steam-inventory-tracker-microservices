const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'portfolio.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Error connecting to Portfolio SQLite:', err.message);
    else console.log('Connected to Portfolio SQLite database.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS user_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        steam_id TEXT NOT NULL,
        market_hash_name TEXT NOT NULL,
        alert_message TEXT NOT NULL
    )`);

    db.get(`SELECT count(*) as count FROM user_alerts`, (err, row) => {
        if (row.count === 0) {
            db.run(`INSERT INTO user_alerts (steam_id, market_hash_name, alert_message) 
            VALUES ('Khaled', 'AK-47 | Redline (Field-Tested)', 'Price dropped below 21 EUR!')`);
        }
    });
});

const getUserAlertsFromDb = (steamId) => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT market_hash_name, alert_message FROM user_alerts WHERE steam_id = ?`, 
        [steamId], (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
};

module.exports = { getUserAlertsFromDb };