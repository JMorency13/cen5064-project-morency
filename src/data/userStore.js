const { randomBytes, scryptSync } = require('crypto');

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

const users = [
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

async function findByEmail(email) {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return users.find((user) => user.email === normalizedEmail) || null;
}

module.exports = {
  findByEmail
};
