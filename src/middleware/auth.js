const authService = require('../services/authService');

function getBearerToken(req) {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer ([^\s]+)$/i);
  return match ? match[1] : null;
}

function authenticate(req, res, next) {
  const token = getBearerToken(req);
  const user = token ? authService.getUserForToken(token) : null;

  if (!user) {
    return res.status(401).json({
      success: false,
      data: null,
      error: 'Authentication required'
    });
  }

  req.user = user;
  req.authToken = token;
  return next();
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        data: null,
        error: 'You do not have permission to perform this action'
      });
    }

    return next();
  };
}

module.exports = {
  authenticate,
  authorize,
  getBearerToken
};
