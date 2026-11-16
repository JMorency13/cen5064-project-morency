const {
  randomBytes,
  randomUUID,
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

function createSession(user, statusCode = 200) {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, {
    user: toPublicUser(user),
    expiresAt: Date.now() + SESSION_DURATION_MS
  });
  return {
    success: true,
    data: { token, user: toPublicUser(user) },
    error: null,
    statusCode
  };
}

async function register(name, email, password, role) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    return buildErrorResponse('Name is required and must be at most 100 characters', 400);
  }
  if (typeof email !== 'string' || email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return buildErrorResponse('A valid email is required', 400);
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return buildErrorResponse('Password must be between 8 and 128 characters', 400);
  }
  if (!['member', 'organizer'].includes(role)) {
    return buildErrorResponse('Choose a valid account role', 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (await userStore.findByEmail(normalizedEmail)) {
    return buildErrorResponse('An account with that email already exists', 409);
  }
  const salt = randomBytes(16);
  const user = {
    id: randomUUID(),
    name: name.trim(),
    email: normalizedEmail,
    role,
    salt,
    passwordHash: await scryptAsync(password, salt, 64)
  };
  if (!userStore.save(user)) {
    return buildErrorResponse('An account with that email already exists', 409);
  }
  return createSession(user, 201);
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

  return createSession(user);
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
  register,
  login,
  getUserForToken,
  logout
};
