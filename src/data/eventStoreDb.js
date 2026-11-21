const { v4: uuidv4 } = require('uuid');
const { getAsync, allAsync, runAsync } = require('./db');

class EventStoreDatabase {
  static #instance = null;

  static getInstance() {
    if (!EventStoreDatabase.#instance) {
      EventStoreDatabase.#instance = new EventStoreDatabase();
    }
    return EventStoreDatabase.#instance;
  }

  constructor() {
    this.useDatabase = false;
  }

  init(useDatabase = false) {
    this.useDatabase = useDatabase;
  }

  async findAll() {
    if (!this.useDatabase) {
      return []; // Return empty when not using database
    }

    try {
      const events = await allAsync(`
        SELECT 
          e.id,
          e.title,
          e.date,
          e.time,
          e.venue,
          e.description,
          e.capacity,
          e.createdBy,
          e.status,
          e.createdAt,
          e.updatedAt
        FROM events e
        ORDER BY e.date, e.time
      `);

      // Load RSVPs and notifications for each event
      for (const event of events) {
        const rsvpRows = await allAsync(
          'SELECT memberId FROM rsvps WHERE eventId = ?',
          [event.id]
        );
        event.rsvps = rsvpRows.map((row) => row.memberId);

        const notificationRows = await allAsync(
          `SELECT id, type, eventId, recipientId, message, changedFields, createdAt 
           FROM notifications WHERE eventId = ?`,
          [event.id]
        );
        event.notifications = notificationRows.map((row) => ({
          id: row.id,
          type: row.type,
          eventId: row.eventId,
          recipientId: row.recipientId,
          message: row.message,
          changedFields: row.changedFields ? JSON.parse(row.changedFields) : [],
          createdAt: row.createdAt
        }));
      }

      return events;
    } catch (error) {
      console.error('Error finding all events:', error);
      return [];
    }
  }

  async save(event) {
    console.log(`[EventStoreDb.save] useDatabase: ${this.useDatabase}, event: ${event.title}`);
    
    if (!this.useDatabase) {
      console.log(`[EventStoreDb.save] WARNING: useDatabase is false, returning without saving to database`);
      return event;
    }

    try {
      console.log(`[EventStoreDb] Saving event: ${event.id} - ${event.title}`);
      
      await runAsync(
        `INSERT INTO events (id, title, date, time, venue, description, capacity, createdBy, status, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.id,
          event.title,
          event.date,
          event.time,
          event.venue,
          event.description || '',
          event.capacity,
          event.createdBy,
          event.status || 'open',
          event.createdAt
        ]
      );
      
      console.log(`[EventStoreDb] Event saved to database: ${event.id}`);

      // Save RSVPs
      if (Array.isArray(event.rsvps)) {
        for (const memberId of event.rsvps) {
          await runAsync(
            'INSERT INTO rsvps (id, eventId, memberId) VALUES (?, ?, ?)',
            [uuidv4(), event.id, memberId]
          );
        }
      }

      // Save notifications
      if (Array.isArray(event.notifications)) {
        for (const notification of event.notifications) {
          await runAsync(
            `INSERT INTO notifications (id, type, eventId, recipientId, message, changedFields, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              notification.id || uuidv4(),
              notification.type,
              notification.eventId,
              notification.recipientId,
              notification.message,
              notification.changedFields ? JSON.stringify(notification.changedFields) : '[]',
              notification.createdAt || new Date().toISOString()
            ]
          );
        }
      }

      return event;
    } catch (error) {
      console.error('Error saving event:', error);
      throw error;
    }
  }

  async update(event) {
    if (!this.useDatabase) {
      return event;
    }

    try {
      // Update event
      await runAsync(
        `UPDATE events 
         SET title = ?, date = ?, time = ?, venue = ?, description = ?, capacity = ?, status = ?, updatedAt = ?
         WHERE id = ?`,
        [
          event.title,
          event.date,
          event.time,
          event.venue,
          event.description || '',
          event.capacity,
          event.status,
          event.updatedAt,
          event.id
        ]
      );

      // Clear existing RSVPs
      await runAsync('DELETE FROM rsvps WHERE eventId = ?', [event.id]);

      // Re-insert RSVPs
      if (Array.isArray(event.rsvps)) {
        for (const memberId of event.rsvps) {
          await runAsync(
            'INSERT INTO rsvps (id, eventId, memberId) VALUES (?, ?, ?)',
            [uuidv4(), event.id, memberId]
          );
        }
      }

      // Save notifications - add new ones only (they're appended to existing array)
      if (Array.isArray(event.notifications)) {
        for (const notification of event.notifications) {
          // Check if notification is already in database (has an id from DB)
          if (notification.id && notification.id.startsWith && !notification.id.startsWith('new-')) {
            // Skip notifications that already exist in database
            const existing = await getAsync(
              'SELECT id FROM notifications WHERE id = ?',
              [notification.id]
            );
            if (existing) continue;
          }

          // Insert new notifications
          await runAsync(
            `INSERT INTO notifications (id, type, eventId, recipientId, message, changedFields, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              notification.id || uuidv4(),
              notification.type,
              notification.eventId,
              notification.recipientId,
              notification.message,
              notification.changedFields ? JSON.stringify(notification.changedFields) : '[]',
              notification.createdAt || new Date().toISOString()
            ]
          );
        }
      }

      return event;
    } catch (error) {
      console.error('Error updating event:', error);
      throw error;
    }
  }

  async clear() {
    if (!this.useDatabase) {
      return;
    }

    try {
      await runAsync('DELETE FROM notifications');
      await runAsync('DELETE FROM rsvps');
      await runAsync('DELETE FROM events');
    } catch (error) {
      console.error('Error clearing events:', error);
      throw error;
    }
  }
}

const eventStoreDb = EventStoreDatabase.getInstance();
eventStoreDb.getInstance = EventStoreDatabase.getInstance;

module.exports = eventStoreDb;
