const express = require('express');
const authService = require('../services/authService');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const result = await authService.login(
    req.body && req.body.email,
    req.body && req.body.password
  );

  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
    error: result.error
  });
});

router.get('/me', authenticate, (req, res) => {
  return res.status(200).json({
    success: true,
    data: req.user,
    error: null
  });
});

router.post('/logout', authenticate, (req, res) => {
  authService.logout(req.authToken);
  return res.status(200).json({
    success: true,
    data: null,
    error: null
  });
});

module.exports = router;
