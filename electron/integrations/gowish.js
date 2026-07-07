// Best-effort sync from a shared GoWish wishlist link (Settings → Wishlist).
// GoWish has no public API, so we render the share page in a hidden window
// and read the items from the DOM. If their markup changes, the UI falls
// back to manual mode with a clear message.
const { scrape } = require('./scrape');

async function fetchWishlist(shareUrl) {
  if (!shareUrl?.trim()) throw new Error('No GoWish share link set — add one in Settings');

  const extractor = `
    (() => {
      const items = [];
      const seen = new Set();
      // Wishlist entries are cards containing an image and a title.
      const cards = document.querySelectorAll('[class*="wish"], [class*="Wish"], [class*="product"], li, article');
      for (const card of cards) {
        const img = card.querySelector('img[src^="http"]');
        const titleEl = card.querySelector('h1,h2,h3,h4,[class*="title"],[class*="name"]');
        const title = titleEl?.textContent.trim().replace(/\\s+/g, ' ');
        if (!title || title.length < 2 || seen.has(title)) continue;
        const priceMatch = card.textContent.match(/(£|\\$|€|kr\\.?)\\s?[\\d.,]+/);
        seen.add(title);
        items.push({
          title,
          image: img ? img.src : null,
          price: priceMatch ? priceMatch[0] : null,
          url: card.querySelector('a[href^="http"]')?.href || null,
        });
      }
      return items.length ? items : null;
    })()
  `;

  const items = await scrape(shareUrl.trim(), extractor, { timeoutMs: 30000 });
  if (!items) throw new Error('Could not read items from the GoWish page — add items manually instead');
  return { items, syncedAt: new Date().toISOString() };
}

module.exports = { fetchWishlist };
