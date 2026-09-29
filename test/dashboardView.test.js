const request = require('supertest');
const assert = require('assert');
const app = require('../server');
const eventStore = require('../src/data/eventStore');
const { getTodayDateString } = require('../src/services/dashboardService');

describe('Dashboard View - GET /api/events', () => {
  const today = getTodayDateString();
  const pastDate = '2020-01-01';
  const futureDateA = '2099-05-10';
  const futureDateB = '2099-06-15';

  const organizerA = 'org-uuid-1';
  const organizerB = 'org-uuid-2';
  const memberUser = 'member-uuid-1';

  beforeEach(async () => {
    await eventStore.clear();

    // 1. Past event (must be filtered out)
    await eventStore.save({
      id: 'past-event-1',
      title: 'Historical Meetup',
      date: pastDate,
      time: '10:00',
      venue: 'Old Hall',
      capacity: 50,
      createdBy: organizerA,
      createdAt: new Date().toISOString(),
      rsvps: [memberUser],
      status: 'open'
    });

    // 2. Upcoming event created by organizerA, memberUser is RSVP'd
    await eventStore.save({
      id: 'future-event-1',
      title: 'Next Gen Web',
      date: futureDateA,
      time: '18:00',
      venue: 'Main Auditorium',
      capacity: 100,
      createdBy: organizerA,
      createdAt: new Date().toISOString(),
      rsvps: [memberUser],
      status: 'open'
    });

    // 3. Upcoming event created by organizerA, memberUser NOT RSVP'd (Public)
    await eventStore.save({
      id: 'future-event-2',
      title: 'Intro to AI',
      date: futureDateB,
      time: '09:00',
      venue: 'Hall B',
      capacity: 40,
      createdBy: organizerA,
      createdAt: new Date().toISOString(),
      rsvps: [],
      status: 'open'
    });

    // 4. Upcoming event created by organizerB, memberUser NOT RSVP'd
    await eventStore.save({
      id: 'future-event-3',
      title: 'Security Deep Dive',
      date: futureDateA,
      time: '14:00',
      venue: 'Lab 1',
      capacity: 20,
      createdBy: organizerB,
      createdAt: new Date().toISOString(),
      rsvps: [],
      status: 'open'
    });

    // 5. Cancelled upcoming event (Created by organizerB)
    await eventStore.save({
      id: 'future-event-4',
      title: 'Cancelled Keynote',
      date: futureDateB,
      time: '11:00',
      venue: 'Ballroom',
      capacity: 200,
      createdBy: organizerB,
      createdAt: new Date().toISOString(),
      rsvps: [],
      status: 'cancelled'
    });
  });

  it('should return only upcoming events and sort them chronologically', async () => {
    const res = await request(app)
      .get('/api/events')
      .set('x-user-id', memberUser)
      .set('x-user-role', 'member')
      .expect(200);

    assert.strictEqual(res.body.success, true);
    const { events } = res.body.data;

    // Past event must not be present
    const hasPast = events.some((e) => e.date < today);
    assert.strictEqual(hasPast, false);

    // Verify chronological ordering
    for (let i = 0; i < events.length - 1; i++) {
      const current = `${events[i].date} ${events[i].time}`;
      const next = `${events[i + 1].date} ${events[i + 1].time}`;
      assert.ok(current <= next, `Expected ${current} <= ${next}`);
    }
  });

  it('should return the exact dashboard response shape with all required event fields', async () => {
    const res = await request(app)
      .get('/api/events')
      .set('x-user-id', memberUser)
      .set('x-user-role', 'member')
      .expect(200);

    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.error, null);
    assert.ok(typeof res.body.data.totalCount === 'number');
    assert.strictEqual(res.body.data.userRole, 'member');

    const firstEvent = res.body.data.events[0];
    const requiredKeys = [
      'id', 'title', 'date', 'time', 'venue',
      'capacity', 'status', 'rsvps', 'createdBy', 'createdAt'
    ];
    for (const key of requiredKeys) {
      assert.ok(Object.prototype.hasOwnProperty.call(firstEvent, key), `Missing field: ${key}`);
    }
  });

  it('should allow members to see events they RSVPd to and public upcoming events', async () => {
    const res = await request(app)
      .get('/api/events')
      .set('x-user-id', memberUser)
      .set('x-user-role', 'member')
      .expect(200);

    const eventIds = res.body.data.events.map((e) => e.id);

    // Member sees future-event-1 (RSVP'd), future-event-2 (public open), future-event-3 (public open)
    assert.ok(eventIds.includes('future-event-1'));
    assert.ok(eventIds.includes('future-event-2'));
    assert.ok(eventIds.includes('future-event-3'));

    // Cancelled event with no RSVP should not be included for regular members
    assert.strictEqual(eventIds.includes('future-event-4'), false);
  });

  it('should filter events for organizers showing all their managed events (including cancelled)', async () => {
    const res = await request(app)
      .get('/api/events')
      .set('x-user-id', organizerB)
      .set('x-user-role', 'organizer')
      .expect(200);

    assert.strictEqual(res.body.data.userRole, 'organizer');
    const { events } = res.body.data;
    const eventIds = events.map((e) => e.id);

    // Organizer B manages future-event-3 and future-event-4
    assert.strictEqual(events.length, 2);
    assert.ok(eventIds.includes('future-event-3'));
    assert.ok(eventIds.includes('future-event-4'));
    assert.strictEqual(eventIds.includes('future-event-1'), false);
  });

  it('should accept ?role=organizer query parameter and set filterApplied', async () => {
    const res = await request(app)
      .get('/api/events?role=organizer')
      .set('x-user-id', organizerA)
      .expect(200);

    assert.strictEqual(res.body.data.filterApplied, 'role=organizer');
    assert.strictEqual(res.body.data.userRole, 'organizer');

    const eventIds = res.body.data.events.map((e) => e.id);
    assert.ok(eventIds.includes('future-event-1'));
    assert.ok(eventIds.includes('future-event-2'));
    assert.strictEqual(eventIds.includes('future-event-3'), false);
  });
});
