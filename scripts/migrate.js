#!/usr/bin/env node

const path = require('path');
const { initializeDatabase, closeDb } = require('../src/data/db');

async function migrate() {
  try {
    console.log('Initializing database...');
    await initializeDatabase();
    console.log('✓ Database initialized successfully');
    console.log('✓ Tables created: users, events, rsvps, notifications');
    await closeDb();
  } catch (error) {
    console.error('✗ Database initialization failed:', error.message);
    process.exit(1);
  }
}

migrate();
