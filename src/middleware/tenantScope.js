const createError = (status, msg) => { const e = new Error(msg); e.status = status; e.isOperational = true; return e; };

module.exports = (req, res, next) => {
  if (!req.user || !req.user.tenantId) {
    return next(createError(401, 'Tenant context missing'));
  }
  req.tenantId = req.user.tenantId;
  next();
};
