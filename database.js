const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure data folder exists
const dbDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dbDir, 'madmax.db');
console.log(`[Database] Connecting to SQLite database at: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('[Database] Connection failed:', err.message);
  } else {
    console.log('[Database] Connected successfully.');
  }
});

// Helper for Promises
const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Initialize tables and default settings
const initDb = async () => {
  try {
    // Users table
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sensor Readings table
    await run(`
      CREATE TABLE IF NOT EXISTS sensor_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        temperature REAL NOT NULL,
        humidity REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Device Settings table (LED & LCD state)
    await run(`
      CREATE TABLE IF NOT EXISTS device_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default settings if not exists
    const defaultSettings = [
      { key: 'led_status', value: 'OFF' },
      { key: 'lcd_row1', value: 'Madmax System' },
      { key: 'lcd_row2', value: 'Online & Ready' }
    ];

    for (const setting of defaultSettings) {
      await run(`
        INSERT OR IGNORE INTO device_settings (key, value)
        VALUES (?, ?)
      `, [setting.key, setting.value]);
    }

    console.log('[Database] Tables & Default Settings initialized successfully.');
  } catch (error) {
    console.error('[Database] Initialization error:', error);
  }
};

// Convert ISO timestamp to Asia/Kolkata (+5:30) Time and Date strings
const formatKolkataDateTime = (timestampStr) => {
  try {
    // If SQLite stored timestamp like '2026-09-24 06:15:30', parse as UTC
    let dateObj;
    if (typeof timestampStr === 'string' && !timestampStr.endsWith('Z') && !timestampStr.includes('+')) {
      dateObj = new Date(timestampStr.replace(' ', 'T') + 'Z');
    } else {
      dateObj = new Date(timestampStr);
    }

    if (isNaN(dateObj.getTime())) {
      dateObj = new Date();
    }

    const timeFormatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    const dateFormatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    return {
      time: timeFormatter.format(dateObj),
      date: dateFormatter.format(dateObj),
      iso: dateObj.toISOString()
    };
  } catch (e) {
    return {
      time: '00:00:00 AM',
      date: '01/01/2026',
      iso: new Date().toISOString()
    };
  }
};

module.exports = {
  db,
  run,
  get,
  all,
  initDb,
  formatKolkataDateTime
};
