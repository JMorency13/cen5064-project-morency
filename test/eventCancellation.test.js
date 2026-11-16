const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const app = require('../server');
const eventStore = require('../src/data/eventStore');
const userStore = require('../src/data/userStore');
const { authorizationFor } = require('./helpers/auth');

describe('Event cancellation - POST /api/events/:id/cancel', () => {
  let organizer;
  let member;
  let otherMember;

  beforeEach(async () => {
    userStore.init(null);
    await eventStore.clear();
    organizer = await authorizationFor('organizer');
    member = await authorizationFor('member');
    const registration = await request(app).post('/api/auth/register').send({
      name: 'Other Member',
      email: 'other-member@example.edu',
      password: 'a-good-password',
      role: 'member'
    }).expect(201);
    otherMember = `Bearer ${registration.body.data.token}`;
    await eventStore.save({
      id: 'event-1',
      title: 'Study Session',
      date: '2099-05-10',
      time: '18:00',
      venue: 'Main Hall',
      capacity: 1,
      createdBy: 'organizer-1',
      createdAt: new Date().toISOString(),
      rsvps: ['member-456'],
      status: 'full',
      notifications: [{
        id: 'previous-notification',
        type: 'event_updated',
        eventId: 'event-1',
        recipientId: 'member-456',
        message: 'Previous update',
        createdAt: new Date().toISOString()
      }]
    });
  });

  afterEach(() => userStore.init(null));

  it('cancels a full event, notifies RSVP members and marks both dashboards', async () => {
    const response = await request(app).post('/api/events/event-1/cancel')
      .set('Authorization', organizer).expect(200);
    assert.strictEqual(response.body.data.status, 'cancelled');
    assert.strictEqual(response.body.data.notifications, undefined);
    const [saved] = await eventStore.findAll();
    assert.strictEqual(saved.status, 'cancelled');
    assert.deepStrictEqual(saved.rsvps, ['member-456']);
    assert.strictEqual(saved.notifications.length, 2);
    assert.strictEqual(saved.notifications[1].type, 'event_cancelled');
    assert.strictEqual(saved.notifications[1].recipientId, 'member-456');
    assert.match(saved.notifications[1].message, /Study Session.*cancelled/);

    for (const authorization of [organizer, member]) {
      const dashboard = await request(app).get('/api/events')
        .set('Authorization', authorization).expect(200);
      assert.strictEqual(dashboard.body.data.events[0].status, 'cancelled');
    }
    const notifications = await request(app).get('/api/events/notifications')
      .set('Authorization', member).expect(200);
    assert.deepStrictEqual(notifications.body.data.map((item) => item.type),
      ['event_updated', 'event_cancelled']);
    const otherNotifications = await request(app).get('/api/events/notifications')
      .set('Authorization', otherMember).expect(200);
    assert.deepStrictEqual(otherNotifications.body.data, []);
    const otherDashboard = await request(app).get('/api/events')
      .set('Authorization', otherMember).expect(200);
    assert.deepStrictEqual(otherDashboard.body.data.events, []);
    await request(app).post('/api/events/event-1/rsvp')
      .set('Authorization', otherMember).expect(409);
  });

  it('is idempotent and does not send duplicate cancellation notifications', async () => {
    for (let count = 0; count < 2; count += 1) {
      await request(app).post('/api/events/event-1/cancel')
        .set('Authorization', organizer).expect(200);
    }
    assert.strictEqual((await eventStore.findAll())[0].notifications.length, 2);
  });

  it('notifies every member who RSVP’d', async () => {
    const [event] = await eventStore.findAll();
    await eventStore.update({ ...event, capacity: 3, status: 'open' });
    await request(app).post('/api/events/event-1/rsvp')
      .set('Authorization', otherMember).expect(201);
    await request(app).post('/api/events/event-1/cancel')
      .set('Authorization', organizer).expect(200);
    for (const authorization of [member, otherMember]) {
      const response = await request(app).get('/api/events/notifications')
        .set('Authorization', authorization).expect(200);
      assert.strictEqual(response.body.data.filter((item) => item.type === 'event_cancelled').length, 1);
    }
  });

  it('rejects unauthenticated users, members, other organizers and missing events', async () => {
    await request(app).post('/api/events/event-1/cancel').expect(401);
    await request(app).post('/api/events/event-1/cancel')
      .set('Authorization', member).expect(403);
    const [event] = await eventStore.findAll();
    await eventStore.update({ ...event, createdBy: 'another-organizer' });
    await request(app).post('/api/events/event-1/cancel')
      .set('Authorization', organizer).expect(403);
    await request(app).post('/api/events/missing/cancel')
      .set('Authorization', organizer).expect(404);
    const [saved] = await eventStore.findAll();
    assert.strictEqual(saved.status, 'full');
    assert.strictEqual(saved.notifications.length, 1);
  });

  it('persists cancellation and releases the venue for a replacement event', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'event-cancel-'));
    const file = path.join(directory, 'events.json');
    const [event] = await eventStore.findAll();
    try {
      eventStore.init(file);
      await eventStore.save(event);
      await request(app).post('/api/events/event-1/cancel')
        .set('Authorization', organizer).expect(200);
      eventStore.init(file);
      const [saved] = await eventStore.findAll();
      assert.strictEqual(saved.status, 'cancelled');
      assert.strictEqual(saved.notifications[1].type, 'event_cancelled');
      await request(app).post('/api/events').set('Authorization', organizer)
        .send({ title: 'Replacement', date: event.date, time: event.time, venue: event.venue, capacity: 5 })
        .expect(201);
    } finally {
      eventStore.init(null);
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('reports a persistence failure and leaves the event unchanged', async () => {
    const persist = eventStore.persist;
    eventStore.persist = () => { throw new Error('Storage unavailable'); };
    try {
      const response = await request(app).post('/api/events/event-1/cancel')
        .set('Authorization', organizer).expect(500);
      assert.strictEqual(response.body.success, false);
      const [saved] = await eventStore.findAll();
      assert.strictEqual(saved.status, 'full');
      assert.strictEqual(saved.notifications.length, 1);
    } finally {
      eventStore.persist = persist;
    }
  });
});
