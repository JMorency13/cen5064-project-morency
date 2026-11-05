const request = require('supertest');
const assert = require('assert');
const app = require('../server');
const eventStore = require('../src/data/eventStore');
const { getTodayDateString } = require('../src/services/dashboardService');
const { authorizationFor } = require('./helpers/auth');

describe('Dashboard View - GET /api/events', () => {
  const today = getTodayDateString();
  const organizerA = 'organizer-1';
  const organizerB = 'org-uuid-2';
  const memberUser = 'member-456';
  let organizerAuthorization;
  let memberAuthorization;

  beforeEach(async () => {
    await eventStore.clear();
    organizerAuthorization = await authorizationFor('organizer');
    memberAuthorization = await authorizationFor('member');

    await eventStore.save({
      id: 'past-event-1',
      title: 'Historical Meetup',
      date: '2020-01-01',
      time: '10:00',
      venue: 'Old Hall',
      capacity: 50,
      createdBy: organizerA,
      createdAt: new Date().toISOString(),
      rsvps: [memberUser],
      status: 'open'
    });
    await eventStore.save({
      id: 'future-event-1',
      title: 'Next Gen Web',
      date: '2099-05-10',
      time: '18:00',
      venue: 'Main Auditorium',
      capacity: 100,
      createdBy: organizerA,
      createdAt: new Date().toISOString(),
      rsvps: [memberUser],
      status: 'open'
    });
    await eventStore.save({
      id: 'future-event-2',
      title: 'Intro to AI',
      date: '2099-06-15',
      time: '09:00',
      venue: 'Hall B',
      capacity: 40,
      createdBy: organizerA,
      createdAt: new Date().toISOString(),
      rsvps: [],
      status: 'open'
    });
    await eventStore.save({
      id: 'future-event-3',
      title: 'Security Deep Dive',
      date: '2099-05-10',
      time: '14:00',
      venue: 'Lab 1',
      capacity: 20,
      createdBy: organizerB,
      createdAt: new Date().toISOString(),
      rsvps: [],
      status: 'open'
    });
    await eventStore.save({
      id: 'future-event-4',
      title: 'Cancelled Keynote',
      date: '2099-06-15',
      time: '11:00',
      venue: 'Ballroom',
      capacity: 200,
      createdBy: organizerB,
      createdAt: new Date().toISOString(),
      rsvps: [],
      status: 'cancelled'
    });
  });

  it('returns only upcoming events in chronological order', async () => {
    const response = await request(app)
      .get('/api/events')
      .set('Authorization', memberAuthorization)
      .expect(200);
    const events = response.body.data.events;

    assert.strictEqual(response.body.success, true);
    assert.strictEqual(events.some((event) => event.date < today), false);
    for (let index = 0; index < events.length - 1; index += 1) {
      const current = `${events[index].date} ${events[index].time}`;
      const next = `${events[index + 1].date} ${events[index + 1].time}`;
      assert.ok(current <= next, `Expected ${current} <= ${next}`);
    }
  });

  it('returns the dashboard response shape with required event fields', async () => {
    const response = await request(app)
      .get('/api/events')
      .set('Authorization', memberAuthorization)
      .expect(200);

    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.error, null);
    assert.ok(typeof response.body.data.totalCount === 'number');
    assert.strictEqual(response.body.data.userRole, 'member');

    const event = response.body.data.events[0];
    for (const key of [
      'id', 'title', 'date', 'time', 'venue',
      'capacity', 'status', 'rsvps', 'createdBy', 'createdAt'
    ]) {
      assert.ok(Object.prototype.hasOwnProperty.call(event, key), `Missing field: ${key}`);
    }
  });

  it('shows members RSVP’d and public upcoming events, but not unRSVP’d cancelled events', async () => {
    const response = await request(app)
      .get('/api/events')
      .set('Authorization', memberAuthorization)
      .expect(200);
    const eventIds = response.body.data.events.map((event) => event.id);

    assert.ok(eventIds.includes('future-event-1'));
    assert.ok(eventIds.includes('future-event-2'));
    assert.ok(eventIds.includes('future-event-3'));
    assert.strictEqual(eventIds.includes('future-event-4'), false);
  });

  it('shows an organizer only events they manage', async () => {
    const response = await request(app)
      .get('/api/events')
      .set('Authorization', organizerAuthorization)
      .expect(200);
    const eventIds = response.body.data.events.map((event) => event.id);

    assert.strictEqual(response.body.data.userRole, 'organizer');
    assert.deepStrictEqual(eventIds, ['future-event-1', 'future-event-2']);
  });

  it('does not let a role query parameter override the signed-in member role', async () => {
    const response = await request(app)
      .get('/api/events?role=organizer')
      .set('Authorization', memberAuthorization)
      .expect(200);
    const eventIds = response.body.data.events.map((event) => event.id);

    assert.strictEqual(response.body.data.filterApplied, null);
    assert.strictEqual(response.body.data.userRole, 'member');
    assert.ok(eventIds.includes('future-event-1'));
    assert.ok(eventIds.includes('future-event-3'));
    assert.strictEqual(eventIds.includes('future-event-4'), false);
  });
});
