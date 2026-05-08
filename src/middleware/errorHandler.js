const { ZodError } = require('zod');

function errorHandler(err, req, res, next) { 
  if (err instanceof ZodError) {
    return res.status(422).json({
      type: 'https://leanstock.io/errors/validation',
      title: 'Validation Error',
      status: 422,
      detail: 'One or more request fields failed validation.',
      errors: err.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    });
  }

  if (err.code === 'P2002') {
    const field = err.meta?.target?.join(', ') || 'field';
    return res.status(409).json({
      type: 'https://leanstock.io/errors/conflict',
      title: 'Conflict',
      status: 409,
      detail: `A record with the same ${field} already exists.`,
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      type: 'https://leanstock.io/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail: err.meta?.cause || 'Resource not found.',
    });
  }

  if (err.statusCode) {
    return res.status(err.statusCode).json({
      type: `https://leanstock.io/errors/${err.code || 'error'}`,
      title: err.title || 'Error',
      status: err.statusCode,
      detail: err.message,
    });
  }

  console.error('[LeanStock] Unhandled error:', err);
  return res.status(500).json({
    type: 'https://leanstock.io/errors/internal',
    title: 'Internal Server Error',
    status: 500,
    detail:
      process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred.'
        : err.message,
  });
}

function createError(statusCode, message, { code, title } = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.title = title;
  return err;
}

module.exports = { errorHandler, createError };
