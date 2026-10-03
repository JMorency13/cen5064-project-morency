const express = require('express');
const router = express.Router();
const dashboardService = require('../services/dashboardService');

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

// TODO: POST /api/events (Event creation) - implement eventService in future PR
// router.post('/', async (req, res) => {
//   const organizerId = req.headers['x-user-id'] || 'organizer-123';
//   const result = await eventService.createEvent(req.body, organizerId);
//   ...
// });

module.exports = router;