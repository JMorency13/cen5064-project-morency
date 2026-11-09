const request = require('supertest');
const app = require('../../server');

const credentialsByRole = {
  organizer: {
    email: 'organizer@example.edu',
    password: process.env.DEMO_ORGANIZER_PASSWORD || 'organizer-demo'
  },
  member: {
    email: 'member@example.edu',
    password: process.env.DEMO_MEMBER_PASSWORD || 'member-demo'
  }
};
const authorizationByRole = new Map();

async function authorizationFor(role) {
  if (!credentialsByRole[role]) {
    throw new Error(`Unknown test role: ${role}`);
  }

  if (!authorizationByRole.has(role)) {
    const response = await request(app)
      .post('/api/auth/login')
      .send(credentialsByRole[role])
      .expect(200);
    authorizationByRole.set(role, `Bearer ${response.body.data.token}`);
  }

  return authorizationByRole.get(role);
}

module.exports = {
  authorizationFor,
  credentialsByRole
};
