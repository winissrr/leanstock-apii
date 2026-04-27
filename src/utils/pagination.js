function buildCursorPage({ items, limit }) {
  const hasNextPage = items.length > limit;
  const pageItems = hasNextPage ? items.slice(0, limit) : items;
  const nextCursor = hasNextPage ? pageItems[pageItems.length - 1].id : null;
  return { items: pageItems, nextCursor, hasNextPage };
}

module.exports = { buildCursorPage };
