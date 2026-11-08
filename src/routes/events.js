const express = require('express');
const router = express.Router();

const eventStore = require('../data/eventStore');
const { createDashboardService } = require('../services/dashboardService');
const { createEventService } = require('../services/eventService');

const dashboardService = createDashboardService({ eventStore });
const eventService = createEventService({ eventStore });

// GET /api/events/notifications (Notifications for the signed-in member)
router.get('/notifications', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const result = await eventService.getNotificationsForUser(userId);
  return res.status(result.statusCode).json(result);
});

// GET /api/events (Dashboard listing with role & upcoming filtering)
router.get('/', async (req, res) => {
  const userId = req.headers['x-user-id'] || req.query.userId || 'anonymous-user';
  const userRole = (req.query.role || req.headers['x-user-role'] || 'member').toLowerCase();
  const filterApplied = req.query.role ? `role=${req.query.role}` : null;

  const result = await dashboardService.getUpcomingEvents(userId, userRole, {
    filterApplied
  });

  if (!result.success) {
    return res.status(500).json(result);
  }

  return res.status(200).json(result);
});

// POST /api/events (Create event)
router.post('/', async (req, res) => {
  const organizerId = req.headers['x-user-id'];
  const result = await eventService.createEvent(req.body, organizerId);

  const responsePayload = {
    success: result.success,
    data: result.data,
    error: result.error
  };

  return res.status(result.statusCode).json(responsePayload);
});

// PUT /api/events/:id (Organizer updates event details)
router.put('/:id', async (req, res) => {
  const organizerId = req.headers['x-user-id'];
  const result = await eventService.updateEvent(
    req.params.id,
    req.body,
    organizerId
  );

  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
    error: result.error
  });
});

module.exports = router;