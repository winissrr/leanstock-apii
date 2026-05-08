function rbac(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        type: 'https://leanstock.io/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Authentication required.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        type: 'https://leanstock.io/errors/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: `Role '${req.user.role}' is not permitted to access this resource. Required: ${allowedRoles.join(' | ')}.`,
      });
    }

    next();
  };
}

module.exports = { rbac };
