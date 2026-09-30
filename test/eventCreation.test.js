const request = require('supertest');
const assert = require('assert');
const app = require('../server');
const eventStore = require('../src/data/eventStore');

describe('Event Creation - POST /api/events', () => {
  beforeEach(async () => {
    await eventStore.clear();
  });

  it('should create a valid event and return 201', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('x-user-id', 'organizer-123')
      .send({
        title: 'Campus Hack Night',
        date: '2099-05-10',
        time: '18:00',
        venue: 'Main Hall',
        capacity: 60
      })
      .expect(201);

    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.error, null);
    assert.ok(res.body.data.id);
    assert.strictEqual(res.body.data.createdBy, 'organizer-123');
    assert.strictEqual(res.body.data.status, 'open');
    assert.deepStrictEqual(res.body.data.rsvps, []);

    const dashboardRes = await request(app)
      .get('/api/events')
      .set('x-user-id', 'member-123')
      .set('x-user-role', 'member')
      .expect(200);

    const eventIds = dashboardRes.body.data.events.map((event) => event.id);
    assert.ok(eventIds.includes(res.body.data.id));
  });

  it('should reject missing required fields', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('x-user-id', 'organizer-123')
      .send({
        title: 'Missing Fields',
        date: '2099-05-10',
        venue: 'Main Hall'
      })
      .expect(400);

    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('Missing required field'));
  });

  it('should reject duplicate venue/date/time conflicts', async () => {
    await eventStore.save({
      id: 'existing-1',
      title: 'Existing Event',
      date: '2099-05-10',
      time: '18:00',
      venue: 'Main Hall',
      capacity: 30,
      createdBy: 'organizer-111',
      createdAt: new Date().toISOString(),
      rsvps: [],
      status: 'open'
    });

    const res = await request(app)
      .post('/api/events')
      .set('x-user-id', 'organizer-123')
      .send({
        title: 'Conflict Event',
        date: '2099-05-10',
        time: '18:00',
        venue: 'Main Hall',
        capacity: 50
      })
      .expect(409);

    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('already booked'));
  });
});