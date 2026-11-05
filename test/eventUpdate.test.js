const request = require('supertest');
const assert = require('assert');
const app = require('../server');
const eventStore = require('../src/data/eventStore');
const { authorizationFor } = require('./helpers/auth');

describe('Event updates - PUT /api/events/:id', () => {
  const organizerId = 'organizer-1';
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
  let organizerAuthorization;
  let memberAuthorization;

  beforeEach(async () => {
    await eventStore.clear();
    await eventStore.save({ ...event, rsvps: [...event.rsvps] });
    organizerAuthorization = await authorizationFor('organizer');
    memberAuthorization = await authorizationFor('member');
  });

  it('updates details, saves them, and notifies members who RSVP’d', async () => {
    const response = await request(app)
      .put('/api/events/event-1')
      .set('Authorization', organizerAuthorization)
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
      .set('Authorization', memberAuthorization)
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
      .set('Authorization', organizerAuthorization)
      .send({ time: '19:30' })
      .expect(409);

    assert.strictEqual(response.body.success, false);
    assert.strictEqual((await eventStore.findAll())[0].time, '18:00');
  });

  it('does not reduce capacity below existing RSVPs', async () => {
    const [savedEvent] = await eventStore.findAll();
    await eventStore.update({
      ...savedEvent,
      rsvps: [memberId, 'another-member']
    });

    await request(app)
      .put('/api/events/event-1')
      .set('Authorization', organizerAuthorization)
      .send({ capacity: 1 })
      .expect(409);

    assert.strictEqual((await eventStore.findAll())[0].capacity, 30);
  });

  it('marks an event full when its updated capacity equals its RSVP count', async () => {
    const response = await request(app)
      .put('/api/events/event-1')
      .set('Authorization', organizerAuthorization)
      .send({ capacity: 1 })
      .expect(200);

    assert.strictEqual(response.body.data.status, 'full');
  });

  it('blocks members from updating event details', async () => {
    await request(app)
      .put('/api/events/event-1')
      .set('Authorization', memberAuthorization)
      .send({ venue: 'Library' })
      .expect(403);

    assert.strictEqual((await eventStore.findAll())[0].venue, 'Main Hall');
  });

  it('blocks an organizer from updating another organizer’s event', async () => {
    const [savedEvent] = await eventStore.findAll();
    await eventStore.update({ ...savedEvent, createdBy: 'another-organizer' });

    await request(app)
      .put('/api/events/event-1')
      .set('Authorization', organizerAuthorization)
      .send({ venue: 'Library' })
      .expect(403);

    assert.strictEqual((await eventStore.findAll())[0].venue, 'Main Hall');
  });

  it('does not allow a caller to change whose notifications are returned', async () => {
    await request(app)
      .put('/api/events/event-1')
      .set('Authorization', organizerAuthorization)
      .send({ description: 'Updated notes' })
      .expect(200);

    const response = await request(app)
      .get('/api/events/notifications')
      .set('Authorization', memberAuthorization)
      .set('x-user-id', 'someone-else')
      .expect(200);

    assert.strictEqual(response.body.data.length, 1);
    assert.strictEqual(response.body.data[0].recipientId, memberId);
  });
});
