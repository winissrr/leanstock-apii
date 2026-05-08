const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePaginationParams(query) {
  const limit = Math.min(
    parseInt(query.limit, 10) || DEFAULT_LIMIT,
    MAX_LIMIT,
  );
  const cursor = query.cursor || null;
  return { cursor, limit };
}

function buildPrismaPage(cursor, limit) {
  const page = { take: limit + 1, orderBy: { createdAt: 'desc' } };
  if (cursor) {
    page.cursor = { id: cursor };
    page.skip = 1;
  }
  return page;
}

function buildPrismaPageById(cursor, limit) {
  const page = { take: limit + 1, orderBy: { id: 'asc' } };
  if (cursor) {
    page.cursor = { id: cursor };
    page.skip = 1;
  }
  return page;
}

function paginateResult(rows, limit) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;
  return { data, nextCursor, hasMore };
}

module.exports = {
  parsePaginationParams,
  buildPrismaPage,
  buildPrismaPageById,
  paginateResult,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};