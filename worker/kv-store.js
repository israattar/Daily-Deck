// The same tiny interface as electron/store.js, backed by Cloudflare KV
// instead of JSON files, so the integrations do not know or care which one
// they are running against.
//
// A collection is one KV key holding one JSON document — exactly the shape the
// laptop already keeps on disk, which is why this adapter is so small.
export function kvStore(namespace) {
  return {
    async load(name, fallback = null) {
      const raw = await namespace.get(key(name));
      if (raw === null || raw === undefined) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        // A half-written or hand-edited value should read as "nothing yet"
        // rather than take down the whole request.
        return fallback;
      }
    },

    async save(name, data) {
      await namespace.put(key(name), JSON.stringify(data));
      return true;
    },
  };
}

// Same guard as the desktop store: a collection name becomes a key, so keep it
// to the known-safe shape rather than trusting whatever asked for it.
function key(name) {
  if (!/^[a-z-]+$/.test(name)) throw new Error(`Bad collection name: ${name}`);
  return name;
}
