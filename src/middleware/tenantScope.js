function tenantScope(req, res, next) {
  if (!req.user || !req.user.tenantId) {
    return res.status(401).json({
      type: 'https://leanstock.io/errors/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: 'Tenant context not established.',
    });
  }
  req.tenantId = req.user.tenantId;
  next();
}

module.exports = { tenantScope };
