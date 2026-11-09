const { randomBytes, scryptSync } = require('crypto');
const fs = require('fs');
const path = require('path');

function getDemoPassword(environmentVariable, fallback) {
  const configuredPassword = process.env[environmentVariable];
  if (process.env.NODE_ENV === 'production' && !configuredPassword) {
    throw new Error(`${environmentVariable} must be set in production`);
  }
  return configuredPassword || fallback;
}

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

let registeredUsers = [];
let filePath = null;

function init(file) {
  let loadedUsers = [];
  if (file && fs.existsSync(file)) {
    const records = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(records)) throw new Error('Invalid user store format');
    const emails = new Set(demoUsers.map((user) => user.email));
    loadedUsers = records.map((record) => {
      if (!record || typeof record.id !== 'string' || typeof record.name !== 'string' ||
          typeof record.email !== 'string' || !['member', 'organizer'].includes(record.role) ||
          !/^[0-9a-f]{32}$/.test(record.salt) ||
          !/^[0-9a-f]{128}$/.test(record.passwordHash) ||
          emails.has(record.email) || record.email !== record.email.trim().toLowerCase()) {
        throw new Error('Invalid user record in user store');
      }
      emails.add(record.email);
      return { ...record, salt: Buffer.from(record.salt, 'hex'), passwordHash: Buffer.from(record.passwordHash, 'hex') };
    });
  }
  filePath = file;
  registeredUsers = loadedUsers;
}

function persist(users) {
  if (!filePath) return;
  const records = users.map((user) => ({
    ...user,
    salt: user.salt.toString('hex'),
    passwordHash: user.passwordHash.toString('hex')
  }));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryFile = `${filePath}.${randomBytes(8).toString('hex')}.tmp`;
  let written = false;
  try {
    fs.writeFileSync(temporaryFile, JSON.stringify(records, null, 2), { mode: 0o600, flag: 'wx' });
    written = true;
    fs.renameSync(temporaryFile, filePath);
  } catch (error) {
    if (written || error.code !== 'EEXIST') {
      try {
        fs.unlinkSync(temporaryFile);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') console.error('Unable to remove temporary user store:', cleanupError);
      }
    }
    throw error;
  }
}

async function findByEmail(email) {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return [...demoUsers, ...registeredUsers].find((user) => user.email === normalizedEmail) || null;
}

function save(user) {
  if ([...demoUsers, ...registeredUsers].some((existing) => existing.email === user.email)) return false;
  const updatedUsers = [...registeredUsers, user];
  persist(updatedUsers);
  registeredUsers = updatedUsers;
  return true;
}

module.exports = {
  init,
  findByEmail,
  save
};
