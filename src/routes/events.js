const express = require('express');
const router = express.Router();
const dashboardService = require('../services/dashboardService');
const eventService = require('../services/eventService');

// GET /api/events (Dashboard listing with role & upcoming filtering)
router.get('/', async (req, res) => {
  // Extract user context from headers or query params
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

  // Return standard response shape matching API requirements
  const responsePayload = {
    success: result.success,
    data: result.data,
    error: result.error
  };

  return res.status(result.statusCode).json(responsePayload);
});

module.exports = router;
