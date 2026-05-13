function buildCursorPage(cursor, limit = 20) {
  const take = Math.min(parseInt(limit) || 20, 100);
  const args = { take: take + 1 };
  if (cursor) {
    args.skip = 1;
    args.cursor = { id: cursor };
  }
  return args;
}

function paginateResult(items, take) {
  const realTake = Math.min(parseInt(take) || 20, 100);
  const hasMore = items.length > realTake;
  const data = hasMore ? items.slice(0, realTake) : items;
  const nextCursor = hasMore ? data[data.length - 1].id : null;
  return { data, nextCursor, hasMore };
}

module.exports = { buildCursorPage, paginateResult };