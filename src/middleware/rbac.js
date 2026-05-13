const createError = (status, msg) => { const e = new Error(msg); e.status = status; e.isOperational = true; return e; };

module.exports = (...allowedRoles) => (req, res, next) => {
  if (!req.user) return next(createError(401, 'Unauthenticated'));
  if (!allowedRoles.includes(req.user.role)) {
    return next(createError(403, `Access denied. Requires role: ${allowedRoles.join(' or ')}`));
  }
  next();
};
