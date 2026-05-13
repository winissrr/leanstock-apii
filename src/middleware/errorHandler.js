module.exports = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const isOperational = err.isOperational || false;

  if (!isOperational) {
    console.error('Unhandled error:', err);
  }

  if (err.code === 'P2002') {
    return res.status(409).json({
      type: 'https://leanstock.io/errors/conflict',
      title: 'Conflict',
      status: 409,
      detail: `A record with this ${err.meta?.target?.join(', ')} already exists.`,
    });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({
      type: 'https://leanstock.io/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail: err.meta?.cause || 'Record not found',
    });
  }

  return res.status(status).json({
    type: `https://leanstock.io/errors/${status}`,
    title: err.title || 'Error',
    status,
    detail: err.message || 'An unexpected error occurred',
    ...(err.errors && { errors: err.errors }),
  });
};
