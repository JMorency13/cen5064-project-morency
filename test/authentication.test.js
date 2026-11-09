const request = require('supertest');
const assert = require('assert');
const app = require('../server');
const eventStore = require('../src/data/eventStore');
const { authorizationFor, credentialsByRole } = require('./helpers/auth');

describe('Authentication and role authorization', () => {
  beforeEach(async () => {
    await eventStore.clear();
  });

  it('authenticates a valid organizer and returns its role', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send(credentialsByRole.organizer)
      .expect(200);

    assert.ok(response.body.data.token);
    assert.strictEqual(response.body.data.user.id, 'organizer-1');
    assert.strictEqual(response.body.data.user.role, 'organizer');

    await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${response.body.data.token}`)
      .send({
        title: 'Authorized Event',
        date: '2099-05-10',
        time: '18:00',
        venue: 'Main Hall',
        capacity: 10
      })
      .expect(201);
  });

  it('rejects invalid credentials without issuing a token', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'organizer@example.edu',
        password: 'incorrect-password'
      })
      .expect(401);

    assert.strictEqual(response.body.success, false);
    assert.strictEqual(response.body.data, null);
    assert.strictEqual(response.body.error, 'Invalid email or password');
  });

  it('requires authentication and does not trust caller-supplied identity or role', async () => {
    await request(app)
      .get('/api/events')
      .expect(401);

    const memberAuthorization = await authorizationFor('member');
    const dashboard = await request(app)
      .get('/api/events?role=organizer')
      .set('Authorization', memberAuthorization)
      .set('x-user-id', 'organizer-1')
      .set('x-user-role', 'organizer')
      .expect(200);

    assert.strictEqual(dashboard.body.data.userRole, 'member');

    await request(app)
      .post('/api/events')
      .set('Authorization', memberAuthorization)
      .set('x-user-id', 'organizer-1')
      .set('x-user-role', 'organizer')
      .send({
        title: 'Unauthorized Event',
        date: '2099-05-10',
        time: '18:00',
        venue: 'Main Hall',
        capacity: 10
      })
      .expect(403);

    assert.strictEqual((await eventStore.findAll()).length, 0);
  });

  it('allows members to RSVP, prevents organizer RSVP, and enforces capacity', async () => {
    await eventStore.save({
      id: 'limited-event',
      title: 'Limited Event',
      date: '2099-05-10',
      time: '18:00',
      venue: 'Main Hall',
      capacity: 1,
      createdBy: 'organizer-1',
      createdAt: new Date().toISOString(),
      rsvps: [],
      status: 'open'
    });

    const organizerAuthorization = await authorizationFor('organizer');
    await request(app)
      .post('/api/events/limited-event/rsvp')
      .set('Authorization', organizerAuthorization)
      .expect(403);

    const memberAuthorization = await authorizationFor('member');
    const response = await request(app)
      .post('/api/events/limited-event/rsvp')
      .set('Authorization', memberAuthorization)
      .set('x-user-id', 'somebody-else')
      .expect(201);

    assert.deepStrictEqual(response.body.data.rsvps, ['member-456']);
    assert.strictEqual(response.body.data.status, 'full');

    await request(app)
      .post('/api/events/limited-event/rsvp')
      .set('Authorization', memberAuthorization)
      .expect(200);
    assert.deepStrictEqual((await eventStore.findAll())[0].rsvps, ['member-456']);

    const [fullEvent] = await eventStore.findAll();
    await eventStore.update({
      ...fullEvent,
      rsvps: ['another-member'],
      status: 'full'
    });

    await request(app)
      .post('/api/events/limited-event/rsvp')
      .set('Authorization', memberAuthorization)
      .expect(409);
  });
});
