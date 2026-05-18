const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'inventory.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to SQLite:', err.message);
    } else {
        console.log('Connected to SQLite database.');
    }
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS user_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        steam_id TEXT NOT NULL,
        market_hash_name TEXT NOT NULL
    )`);
});

// Function to insert a tracked item
const trackItemInDb = (steamId, itemName) => {
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO user_items (steam_id, market_hash_name) VALUES (?, ?)`, 
        [steamId, itemName], 
        function(err) {
            if (err) reject(err);
            resolve(this.lastID);
        });
    });
};

// Function to fetch a user's tracked items
const getUserItemsFromDb = (steamId) => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT market_hash_name FROM user_items WHERE steam_id = ?`, 
        [steamId], 
        (err, rows) => {
            if (err) reject(err);
            resolve(rows.map(row => row.market_hash_name));
        });
    });
};

// Function to update an item
const updateItemInDb = (steamId, oldName, newName) => {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE user_items SET market_hash_name = ? WHERE steam_id = ? AND market_hash_name = ?`, 
        [newName, steamId, oldName], 
        function(err) {
            if (err) reject(err);
            resolve(this.changes);
        });
    });
};

// Function to delete an item
const deleteItemFromDb = (steamId, itemName) => {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM user_items WHERE steam_id = ? AND market_hash_name = ?`, 
        [steamId, itemName], 
        function(err) {
            if (err) reject(err);
            resolve(this.changes);
        });
    });
};

module.exports = { trackItemInDb, getUserItemsFromDb, updateItemInDb, deleteItemFromDb };