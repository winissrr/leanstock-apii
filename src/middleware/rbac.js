const { ApiError } = require('./errorHandler');

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Unauthorized', 'Authentication required'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'Forbidden', `Required role: ${roles.join(', ')}`));
    }
    next();
  };
}

module.exports = { requireRoles };
