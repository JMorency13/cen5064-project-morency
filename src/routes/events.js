const express = require('express');
const router = express.Router();

const eventStore = require('../data/eventStore');
const { createDashboardService } = require('../services/dashboardService');
const { createEventService } = require('../services/eventService');
const { authenticate, authorize } = require('../middleware/auth');

const dashboardService = createDashboardService({ eventStore });
const eventService = createEventService({ eventStore });

// GET /api/events/notifications (Notifications for the signed-in member)
router.get('/notifications', authenticate, async (req, res) => {
  const userId = req.user.id;
  const result = await eventService.getNotificationsForUser(userId);
  return res.status(result.statusCode).json(result);
});

// GET /api/events (Dashboard listing with role & upcoming filtering)
router.get('/', authenticate, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  const result = await dashboardService.getUpcomingEvents(userId, userRole, {
    filterApplied: null
  });

  if (!result.success) {
    return res.status(500).json(result);
  }

  return res.status(200).json(result);
});

// POST /api/events (Create event)
router.post('/', authenticate, authorize('organizer'), async (req, res) => {
  const organizerId = req.user.id;
  const result = await eventService.createEvent(req.body, organizerId);

  const responsePayload = {
    success: result.success,
    data: result.data,
    error: result.error
  };

  return res.status(result.statusCode).json(responsePayload);
});

// PUT /api/events/:id (Organizer updates event details)
router.put('/:id', authenticate, authorize('organizer'), async (req, res) => {
  const organizerId = req.user.id;
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

router.post('/:id/rsvp', authenticate, authorize('member'), async (req, res) => {
  const result = await eventService.rsvpForEvent(req.params.id, req.user.id);
  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
    error: result.error
  });
});

module.exports = router;