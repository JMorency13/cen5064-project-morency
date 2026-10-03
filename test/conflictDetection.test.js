const request = require('supertest');
const assert = require('assert');
const app = require('../server');
const eventStore = require('../src/data/eventStore');
const { detectVenueConflict, timeToMinutes, timesOverlap } = require('../src/domain/eventValidation');

describe('Venue Conflict Detection', () => {
  const organizerA = 'org-uuid-1';
  const testDate = '2099-05-10';
  const testVenue = 'Main Auditorium';

  beforeEach(async () => {
    await eventStore.clear();
  });

  describe('Unit: detectVenueConflict()', () => {
    it('should return no conflict for events on different dates', () => {
      const existingEvent = {
        id: 'event-1',
        date: '2099-05-10',
        time: '18:00',
        venue: testVenue,
        status: 'open'
      };

      const proposedEvent = {
        date: '2099-05-11', // Different date
        time: '18:00',
        venue: testVenue
      };

      const result = detectVenueConflict(proposedEvent, [existingEvent]);
      assert.strictEqual(result.hasConflict, false);
    });

    it('should return no conflict for events at different venues', () => {
      const existingEvent = {
        id: 'event-1',
        date: testDate,
        time: '18:00',
        venue: 'Hall A',
        status: 'open'
      };

      const proposedEvent = {
        date: testDate,
        time: '18:00',
        venue: 'Hall B' // Different venue
      };

      const result = detectVenueConflict(proposedEvent, [existingEvent]);
      assert.strictEqual(result.hasConflict, false);
    });

    it('should detect conflict when events overlap at same venue (overlapping times)', () => {
      const existingEvent = {
        id: 'event-1',
        date: testDate,
        time: '18:00', // 18:00 - 19:00
        venue: testVenue,
        title: 'Existing Event',
        status: 'open'
      };

      const proposedEvent = {
        date: testDate,
        time: '18:30', // 18:30 - 19:30 (overlaps 18:30 - 19:00)
        venue: testVenue
      };

      const result = detectVenueConflict(proposedEvent, [existingEvent]);
      assert.strictEqual(result.hasConflict, true);
      assert.ok(result.conflictingEvent);
      assert.ok(result.message);
      assert.ok(result.message.includes(testVenue));
      assert.ok(result.message.includes('already booked'));
    });

    it('should not detect conflict when events end/start at same time', () => {
      const existingEvent = {
        id: 'event-1',
        date: testDate,
        time: '18:00', // 18:00 - 19:00
        venue: testVenue,
        status: 'open'
      };

      const proposedEvent = {
        date: testDate,
        time: '19:00', // 19:00 - 20:00 (starts exactly when other ends)
        venue: testVenue
      };

      const result = detectVenueConflict(proposedEvent, [existingEvent]);
      assert.strictEqual(result.hasConflict, false);
    });

    it('should ignore cancelled events (they do not block venue)', () => {
      const cancelledEvent = {
        id: 'event-1',
        date: testDate,
        time: '18:00',
        venue: testVenue,
        status: 'cancelled'
      };

      const proposedEvent = {
        date: testDate,
        time: '18:00', // Same time as cancelled event
        venue: testVenue
      };

      const result = detectVenueConflict(proposedEvent, [cancelledEvent]);
      assert.strictEqual(result.hasConflict, false);
    });

    it('should detect conflict with exact same start time', () => {
      const existingEvent = {
        id: 'event-1',
        date: testDate,
        time: '18:00',
        venue: testVenue,
        title: 'Existing Event',
        status: 'open'
      };

      const proposedEvent = {
        date: testDate,
        time: '18:00', // Exact same start time
        venue: testVenue
      };

      const result = detectVenueConflict(proposedEvent, [existingEvent]);
      assert.strictEqual(result.hasConflict, true);
    });

    it('should detect conflict when proposed event is completely within existing event', () => {
      const existingEvent = {
        id: 'event-1',
        date: testDate,
        time: '14:00', // 14:00 - 15:00
        venue: testVenue,
        title: 'Long Event',
        status: 'open'
      };

      const proposedEvent = {
        date: testDate,
        time: '14:20', // 14:20 - 15:20 (overlaps with 14:20-15:00)
        venue: testVenue
      };

      const result = detectVenueConflict(proposedEvent, [existingEvent]);
      assert.strictEqual(result.hasConflict, true);
    });

    it('should detect conflict when proposed event encompasses existing event', () => {
      const existingEvent = {
        id: 'event-1',
        date: testDate,
        time: '15:00', // 15:00 - 16:00
        venue: testVenue,
        title: 'Short Event',
        status: 'open'
      };

      const proposedEvent = {
        date: testDate,
        time: '14:30', // 14:30 - 15:30 (overlaps with 15:00-15:30)
        venue: testVenue
      };

      const result = detectVenueConflict(proposedEvent, [existingEvent]);
      assert.strictEqual(result.hasConflict, true);
    });
  });

  describe('Integration: POST /api/events with conflict detection', () => {
    it('should reject event with overlapping time at same venue and return 409', async () => {
      await eventStore.save({
        id: 'event-1',
        title: 'Conference',
        date: testDate,
        time: '10:00',
        venue: testVenue,
        capacity: 100,
        createdBy: organizerA,
        createdAt: new Date().toISOString(),
        rsvps: [],
        status: 'open'
      });

      const res = await request(app)
        .post('/api/events')
        .set('x-user-id', organizerA)
        .set('Content-Type', 'application/json')
        .send({
          title: 'Workshop',
          date: testDate,
          time: '10:30', // Overlaps with 10:00-11:00
          venue: testVenue,
          capacity: 50
        })
        .expect(409);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.error);
      assert.ok(res.body.error.includes('already booked'));
    });

    it('should allow event creation with no conflicts', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('x-user-id', organizerA)
        .set('Content-Type', 'application/json')
        .send({
          title: 'Team Meeting',
          date: testDate,
          time: '14:00',
          venue: testVenue,
          capacity: 20
        })
        .expect(201);

      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data);
      assert.strictEqual(res.body.data.title, 'Team Meeting');
      assert.strictEqual(res.body.data.status, 'open');
      assert.deepStrictEqual(res.body.data.rsvps, []);
    });

    it('should allow non-conflicting events at same venue on different dates', async () => {
      await eventStore.save({
        id: 'event-1',
        title: 'Event Day 1',
        date: '2099-05-10',
        time: '10:00',
        venue: testVenue,
        capacity: 50,
        createdBy: organizerA,
        createdAt: new Date().toISOString(),
        rsvps: [],
        status: 'open'
      });

      const res = await request(app)
        .post('/api/events')
        .set('x-user-id', organizerA)
        .set('Content-Type', 'application/json')
        .send({
          title: 'Event Day 2',
          date: '2099-05-11', // Different date
          time: '10:00', // Same time but different date = no conflict
          venue: testVenue,
          capacity: 50
        })
        .expect(201);

      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data);
    });

    it('should allow events that end/start at boundary times without conflict', async () => {
      await eventStore.save({
        id: 'event-1',
        title: 'Morning Event',
        date: testDate,
        time: '10:00',
        venue: testVenue,
        capacity: 50,
        createdBy: organizerA,
        createdAt: new Date().toISOString(),
        rsvps: [],
        status: 'open'
      });

      const res = await request(app)
        .post('/api/events')
        .set('x-user-id', organizerA)
        .set('Content-Type', 'application/json')
        .send({
          title: 'Afternoon Event',
          date: testDate,
          time: '11:00', // Starts exactly when previous ends
          venue: testVenue,
          capacity: 50
        })
        .expect(201);

      assert.strictEqual(res.body.success, true);
    });

    it('should not save conflicting event to store', async () => {
      await eventStore.save({
        id: 'event-1',
        title: 'Event 1',
        date: testDate,
        time: '09:00',
        venue: testVenue,
        capacity: 50,
        createdBy: organizerA,
        createdAt: new Date().toISOString(),
        rsvps: [],
        status: 'open'
      });

      await request(app)
        .post('/api/events')
        .set('x-user-id', organizerA)
        .set('Content-Type', 'application/json')
        .send({
          title: 'Conflict Event',
          date: testDate,
          time: '09:30', // Overlaps
          venue: testVenue,
          capacity: 50
        })
        .expect(409);

      const allEvents = await eventStore.findAll();
      assert.strictEqual(allEvents.length, 1);
      assert.strictEqual(allEvents[0].id, 'event-1');
    });

    it('should allow event when cancelled event exists at same time/venue', async () => {
      await eventStore.save({
        id: 'event-1',
        title: 'Cancelled Event',
        date: testDate,
        time: '16:00',
        venue: testVenue,
        capacity: 50,
        createdBy: organizerA,
        createdAt: new Date().toISOString(),
        rsvps: [],
        status: 'cancelled' // Cancelled
      });

      const res = await request(app)
        .post('/api/events')
        .set('x-user-id', organizerA)
        .set('Content-Type', 'application/json')
        .send({
          title: 'New Event',
          date: testDate,
          time: '16:00', // Same time as cancelled event
          venue: testVenue,
          capacity: 50
        })
        .expect(201);

      assert.strictEqual(res.body.success, true);
    });
  });

  describe('Helper functions', () => {
    it('should convert time string to minutes correctly', () => {
      assert.strictEqual(timeToMinutes('00:00'), 0);
      assert.strictEqual(timeToMinutes('10:30'), 630);
      assert.strictEqual(timeToMinutes('18:00'), 1080);
      assert.strictEqual(timeToMinutes('23:59'), 1439);
    });

    it('should correctly detect time overlap', () => {
      assert.strictEqual(timesOverlap(600, 660, 630, 690), true);
      assert.strictEqual(timesOverlap(600, 660, 660, 720), false);
      assert.strictEqual(timesOverlap(600, 660, 540, 600), false);
    });
  });
});
