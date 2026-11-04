const request = require('supertest');
const assert = require('assert');
const app = require('../server');
const eventStore = require('../src/data/eventStore');

describe('Event updates - PUT /api/events/:id', () => {
  const organizerId = 'organizer-123';
  const memberId = 'member-456';
  const event = {
    id: 'event-1',
    title: 'Study Session',
    date: '2099-05-10',
    time: '18:00',
    venue: 'Main Hall',
    description: 'Bring your notes',
    capacity: 30,
    createdBy: organizerId,
    createdAt: new Date().toISOString(),
    rsvps: [memberId],
    status: 'open'
  };

  beforeEach(async () => {
    await eventStore.clear();
    await eventStore.save({ ...event, rsvps: [...event.rsvps] });
  });

  it('updates details, saves them, and notifies members who RSVP’d', async () => {
    const response = await request(app)
      .put('/api/events/event-1')
      .set('x-user-id', organizerId)
      .send({
        time: '19:00',
        venue: 'Library',
        description: 'Room 2'
      })
      .expect(200);

    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.data.time, '19:00');
    assert.strictEqual(response.body.data.venue, 'Library');
    assert.strictEqual(response.body.data.description, 'Room 2');

    const savedEvents = await eventStore.findAll();
    assert.strictEqual(savedEvents[0].time, '19:00');
    assert.strictEqual(savedEvents[0].notifications.length, 1);
    assert.strictEqual(savedEvents[0].notifications[0].recipientId, memberId);

    const notifications = await request(app)
      .get('/api/events/notifications')
      .set('x-user-id', memberId)
      .expect(200);

    assert.strictEqual(notifications.body.data.length, 1);
    assert.ok(
      notifications.body.data[0].message.includes('time, venue, description')
    );
  });

  it('rejects a conflicting update without saving it', async () => {
    await eventStore.save({
      ...event,
      id: 'event-2',
      title: 'Another Event',
      time: '20:00',
      rsvps: []
    });

    const response = await request(app)
      .put('/api/events/event-1')
      .set('x-user-id', organizerId)
      .send({ time: '19:30' })
      .expect(409);

    assert.strictEqual(response.body.success, false);
    assert.strictEqual((await eventStore.findAll())[0].time, '18:00');
  });

  it('only allows the event organizer to update it', async () => {
    await request(app)
      .put('/api/events/event-1')
      .set('x-user-id', 'another-organizer')
      .send({ venue: 'Library' })
      .expect(403);

    assert.strictEqual((await eventStore.findAll())[0].venue, 'Main Hall');
  });

  it('does not return another member’s notifications', async () => {
    await request(app)
      .put('/api/events/event-1')
      .set('x-user-id', organizerId)
      .send({ description: 'Updated notes' })
      .expect(200);

    const response = await request(app)
      .get('/api/events/notifications')
      .set('x-user-id', 'someone-else')
      .expect(200);

    assert.deepStrictEqual(response.body.data, []);
  });
});