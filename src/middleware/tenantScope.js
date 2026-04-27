const { ApiError } = require('./errorHandler');

function requireTenant(req, res, next) {
  if (!req.user?.tenantId) {
    return next(new ApiError(401, 'Unauthorized', 'Missing tenant context'));
  }
  req.tenantId = req.user.tenantId;
  next();
}

module.exports = { requireTenant };
