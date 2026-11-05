const {
  randomBytes,
  scrypt,
  timingSafeEqual
} = require('crypto');
const { promisify } = require('util');
const userStore = require('../data/userStore');

const scryptAsync = promisify(scrypt);
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };
}

function buildErrorResponse(error, statusCode) {
  return {
    success: false,
    data: null,
    error,
    statusCode
  };
}

async function login(email, password) {
  if (typeof email !== 'string' || typeof password !== 'string') {
    return buildErrorResponse('Email and password are required', 400);
  }

  const user = await userStore.findByEmail(email);
  if (!user) {
    return buildErrorResponse('Invalid email or password', 401);
  }

  const passwordHash = await scryptAsync(password, user.salt, 64);
  if (!timingSafeEqual(user.passwordHash, passwordHash)) {
    return buildErrorResponse('Invalid email or password', 401);
  }

  const token = randomBytes(32).toString('hex');
  sessions.set(token, {
    user: toPublicUser(user),
    expiresAt: Date.now() + SESSION_DURATION_MS
  });

  return {
    success: true,
    data: {
      token,
      user: toPublicUser(user)
    },
    error: null,
    statusCode: 200
  };
}

function getUserForToken(token) {
  const session = sessions.get(token);
  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  return session.user;
}

function logout(token) {
  return sessions.delete(token);
}

module.exports = {
  login,
  getUserForToken,
  logout
};
