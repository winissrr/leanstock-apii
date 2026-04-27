class ApiError extends Error {
  constructor(status, title, detail, extra = {}) {
    super(detail || title);
    this.status = status;
    this.title = title;
    this.detail = detail || title;
    this.extra = extra;
  }
}

function notFound(req, res, next) {
  next(new ApiError(404, 'Not Found', `Route ${req.method} ${req.originalUrl} not found`));
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err?.name === 'ZodError') {
    return res.status(422).json({
      type: 'https://httpstatuses.com/422',
      title: 'Validation Error',
      status: 422,
      detail: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      issues: err.issues
    });
  }

  if (err?.code === 'P2002') {
    return res.status(409).json({
      type: 'https://httpstatuses.com/409',
      title: 'Conflict',
      status: 409,
      detail: 'Unique constraint violation'
    });
  }

  if (err?.code === 'P2025') {
    return res.status(404).json({
      type: 'https://httpstatuses.com/404',
      title: 'Not Found',
      status: 404,
      detail: 'Record not found'
    });
  }

  const status = err.status || 500;
  const title = err.title || (status === 500 ? 'Internal Server Error' : 'Error');
  return res.status(status).json({
    type: `https://httpstatuses.com/${status}`,
    title,
    status,
    detail: err.detail || err.message || 'Unexpected error',
    ...(err.extra || {})
  });
}

module.exports = { ApiError, notFound, errorHandler };
