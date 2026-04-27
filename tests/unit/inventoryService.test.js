const { applyDecayPrice } = require('../../src/services/decayService');
const { buildCursorPage } = require('../../src/utils/pagination');

describe('inventory logic', () => {
  test('applies decay but respects 30% floor', () => {
    expect(applyDecayPrice(100, 80, 50)).toBe(50);
    expect(applyDecayPrice(100, 20, 50)).toBe(30);
  });

  test('builds cursor pages', () => {
    const page = buildCursorPage({
      items: [{ id: '1' }, { id: '2' }, { id: '3' }],
      limit: 2
    });
    expect(page.hasNextPage).toBe(true);
    expect(page.nextCursor).toBe('2');
    expect(page.items).toHaveLength(2);
  });
});
