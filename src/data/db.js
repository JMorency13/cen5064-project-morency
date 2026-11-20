const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    const dbPath = process.env.DATABASE_FILE || path.join(__dirname, '../../data/events.db');
    const dbDir = path.dirname(dbPath);
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log('Created data directory at:', dbDir);
    }
    
    dbInstance = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('Connected to SQLite database at:', dbPath);
      }
    });
    
    // Enable foreign keys
    dbInstance.run('PRAGMA foreign_keys = ON');
  }
  return dbInstance;
}

function initializeDatabase() {
  const db = getDb();
  
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Create users table
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('member', 'organizer')),
          salt TEXT NOT NULL,
          passwordHash TEXT NOT NULL,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('Error creating users table:', err.message);
          reject(err);
        }
      });

      // Create events table
      db.run(`
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          date TEXT NOT NULL,
          time TEXT NOT NULL,
          venue TEXT NOT NULL,
          description TEXT,
          capacity INTEGER NOT NULL CHECK(capacity > 0),
          createdBy TEXT NOT NULL,
          status TEXT DEFAULT 'open' CHECK(status IN ('open', 'full', 'cancelled')),
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          updatedAt TEXT,
          FOREIGN KEY (createdBy) REFERENCES users(id)
        )
      `, (err) => {
        if (err) {
          console.error('Error creating events table:', err.message);
          reject(err);
        }
      });

      // Create rsvps table (junction table for many-to-many relationship)
      db.run(`
        CREATE TABLE IF NOT EXISTS rsvps (
          id TEXT PRIMARY KEY,
          eventId TEXT NOT NULL,
          memberId TEXT NOT NULL,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(eventId, memberId),
          FOREIGN KEY (eventId) REFERENCES events(id) ON DELETE CASCADE,
          FOREIGN KEY (memberId) REFERENCES users(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) {
          console.error('Error creating rsvps table:', err.message);
          reject(err);
        }
      });

      // Create notifications table
      db.run(`
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          eventId TEXT NOT NULL,
          recipientId TEXT NOT NULL,
          message TEXT NOT NULL,
          changedFields TEXT,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (eventId) REFERENCES events(id) ON DELETE CASCADE,
          FOREIGN KEY (recipientId) REFERENCES users(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) {
          console.error('Error creating notifications table:', err.message);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function(err) {
      if (err) {
        console.error('Database error in runAsync:', sql, err.message);
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function(err) {
      if (err) {
        console.error('Database error in runAsync:', sql, err.message);
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) {
        console.error('Database error in getAsync:', sql, err.message);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) {
        console.error('Database error in allAsync:', sql, err.message);
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

function closeDb() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      dbInstance.close((err) => {
        if (err) {
          reject(err);
        } else {
          dbInstance = null;
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

module.exports = {
  getDb,
  initializeDatabase,
  runAsync,
  getAsync,
  allAsync,
  closeDb
};
