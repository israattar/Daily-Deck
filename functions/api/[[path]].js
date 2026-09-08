// Serves the API from the same origin as the app itself.
//
// The Worker at daily-deck.*.workers.dev holds the cron jobs and is the thing
// that keeps the data fresh. But calling it from the page meant a cross-site
// request, and on a phone that blocks third-party requests those never leave
// the device at all — the app showed "Load failed" while the Worker logs stayed
// completely empty, because nothing was ever sent.
//
// Routing /api/* through Pages fixes that by removing the cross-site call: the
// page and its API share an origin, so there is no CORS, no preflight, and
// nothing for a content blocker to treat as third-party. Both bind the same KV
// namespace, so they are two doors onto one store rather than two stores.
import { handleApi } from '../../worker/index.js';

export const onRequest = ({ request, env }) => handleApi(request, env);
