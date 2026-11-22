const { v4: uuidv4 } = require('uuid');
const { randomBytes, scryptSync } = require('crypto');
const { getAsync, allAsync, runAsync } = require('./db');

// Demo users kept in memory
function createDemoUser(id, email, password, role) {
  const salt = randomBytes(16);
  return {
    id,
    email,
    name: role === 'organizer' ? 'Demo Organizer' : 'Demo Member',
    role,
    salt,
    passwordHash: scryptSync(password, salt, 64)
  };
}

function getDemoPassword(environmentVariable, fallback) {
  const configuredPassword = process.env[environmentVariable];
  if (process.env.NODE_ENV === 'production' && !configuredPassword) {
    throw new Error(`${environmentVariable} must be set in production`);
  }
  return configuredPassword || fallback;
}

const demoUsers = [
  createDemoUser(
    'organizer-1',
    'organizer@example.edu',
    getDemoPassword('DEMO_ORGANIZER_PASSWORD', 'organizer-demo'),
    'organizer'
  ),
  createDemoUser(
    'member-456',
    'member@example.edu',
    getDemoPassword('DEMO_MEMBER_PASSWORD', 'member-demo'),
    'member'
  )
];

let useDatabase = false;

function init(useDb = false) {
  useDatabase = useDb;
  // Note: seedDemoUsers() is now called explicitly from server.js after database is initialized
  // to ensure proper async/await ordering
}

async function seedDemoUsers() {
  for (const user of demoUsers) {
    try {
      const existing = await findByEmail(user.email);
      if (!existing) {
        console.log(`[UserStoreDb] Seeding user: ${user.email}`);
        await runAsync(
          `INSERT INTO users (id, name, email, role, salt, passwordHash) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            user.id,
            user.name,
            user.email,
            user.role,
            user.salt.toString('hex'),
            user.passwordHash.toString('hex')
          ]
        );
        console.log(`[UserStoreDb] User seeded: ${user.email}`);
      } else {
        console.log(`[UserStoreDb] User already exists: ${user.email}`);
      }
    } catch (error) {
      console.error(`[UserStoreDb] Error seeding user ${user.email}:`, error.message);
      // User might already exist, continue
    }
  }
}

async function findByEmail(email) {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  
  if (!useDatabase) {
    return [...demoUsers].find((user) => user.email === normalizedEmail) || null;
  }

  try {
    const row = await getAsync(
      'SELECT id, name, email, role, salt, passwordHash FROM users WHERE LOWER(email) = LOWER(?)',
      [normalizedEmail]
    );
    
    if (row) {
      return {
        ...row,
        salt: Buffer.from(row.salt, 'hex'),
        passwordHash: Buffer.from(row.passwordHash, 'hex')
      };
    }
    return null;
  } catch (error) {
    console.error('Error finding user by email:', error);
    return null;
  }
}

function findById(id) {
  // Check demo users first
  const demoUser = demoUsers.find((user) => user.id === id);
  if (demoUser) {
    return demoUser;
  }

  if (!useDatabase) {
    return null;
  }

  // For database queries, this should be async, but keeping sync for compatibility
  // In production, this should be refactored to be async
  return null;
}

async function findByIdAsync(id) {
  // Check demo users first
  const demoUser = demoUsers.find((user) => user.id === id);
  if (demoUser) {
    return demoUser;
  }

  if (!useDatabase) {
    return null;
  }

  try {
    const row = await getAsync(
      'SELECT id, name, email, role, salt, passwordHash FROM users WHERE id = ?',
      [id]
    );
    
    if (row) {
      return {
        ...row,
        salt: Buffer.from(row.salt, 'hex'),
        passwordHash: Buffer.from(row.passwordHash, 'hex')
      };
    }
    return null;
  } catch (error) {
    console.error('Error finding user by id:', error);
    return null;
  }
}

function getAllUsers() {
  return [...demoUsers];
}

async function getAllUsersAsync() {
  if (!useDatabase) {
    return getAllUsers();
  }

  try {
    const rows = await allAsync(
      'SELECT id, name, email, role, salt, passwordHash FROM users'
    );
    
    return rows.map((row) => ({
      ...row,
      salt: Buffer.from(row.salt, 'hex'),
      passwordHash: Buffer.from(row.passwordHash, 'hex')
    }));
  } catch (error) {
    console.error('Error getting all users:', error);
    return getAllUsers();
  }
}

async function save(user) {
  if (!useDatabase) {
    return true; // Keep original behavior for JSON store
  }

  try {
    await runAsync(
      `INSERT INTO users (id, name, email, role, salt, passwordHash) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.name,
        user.email,
        user.role,
        user.salt.toString('hex'),
        user.passwordHash.toString('hex')
      ]
    );
    return true;
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return false; // Email already exists
    }
    console.error('Error saving user:', error);
    throw error;
  }
}

module.exports = {
  init,
  findByEmail,
  findById,
  findByIdAsync,
  getAllUsers,
  getAllUsersAsync,
  save,
  seedDemoUsersAsync: seedDemoUsers
};
