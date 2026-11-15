import gsmarena from 'gsmarena-api';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=60, s-maxage=300',
  'x-content-type-options': 'nosniff'
};

const cacheDurations = {
  health: 30,
  brands: 3600,
  brand: 900,
  device: 1800,
  search: 180,
  top: 300,
  deals: 300,
  glossary: 3600,
  term: 3600,
  capabilities: 3600
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

function ok(source, data, extra = {}) {
  return { ok: true, source, data, cachedAt: new Date().toISOString(), ...extra };
}

function fail(source, message, status = 502, details = undefined) {
  return json({ ok: false, source, error: message, details, cachedAt: new Date().toISOString() }, status, {
    'cache-control': 'no-store'
  });
}

function cleanId(value) {
  return decodeURIComponent(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
}

function normalizeDevice(item, source = 'GSMArena') {
  if (!item || typeof item !== 'object') return null;
  return {
    id: item.id || item.slug || null,
    name: item.name || item.title || 'Unnamed device',
    image: item.img || item.image || item.imageUrl || null,
    description: item.description || item.summary || '',
    url: item.url || (item.id ? `https://www.gsmarena.com/${item.id}.php` : null),
    source,
    raw: item
  };
}

function dedupeDevices(items) {
  const map = new Map();
  for (const raw of items.flat().filter(Boolean)) {
    const item = normalizeDevice(raw);
    if (!item) continue;
    const identity = (item.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const key = identity || item.id;
    const previous = map.get(key);
    if (!previous) map.set(key, item);
    else {
      for (const [field, value] of Object.entries(item)) {
        if ((previous[field] === null || previous[field] === '') && value) previous[field] = value;
      }
      previous.sources = [...new Set([...(previous.sources || [previous.source]), item.source])];
    }
  }
  return [...map.values()];
}

async function withCache(request, ctx, key, ttl, operation) {
  const cache = globalThis.caches?.default;
  if (!cache) return operation();
  const cacheKey = new Request(new URL(`/__edge-cache${key}`, request.url), { method: 'GET' });
  try {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const headers = new Headers(hit.headers);
      headers.set('x-cache', 'HIT');
      return new Response(hit.body, { status: hit.status, headers });
    }
  } catch { /* Cache API can be unavailable in local test runtimes. */ }

  const response = await operation();
  if (response.ok && ttl > 0) {
    const headers = new Headers(response.headers);
    headers.set('cache-control', `public, max-age=${Math.min(ttl, 300)}, s-maxage=${ttl}`);
    headers.set('x-cache', 'MISS');
    const cached = new Response(response.clone().body, { status: response.status, headers });
    ctx.waitUntil(cache.put(cacheKey, cached).catch(() => {}));
    return new Response(response.body, { status: response.status, headers: response.headers });
  }
  return response;
}

function providerCall(fn) {
  return Promise.resolve().then(fn);
}

async function routeApi(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ ok: false, error: 'Method not allowed' }, 405, { allow: 'GET, HEAD' });
  }

  if (path === '/api/providers') {
    return json(ok('alx-mobile-api', {
      primary: { id: 'gsmarena-api', status: 'built-in', features: ['catalog', 'search', 'specifications', 'top', 'deals', 'glossary'] },
      secondary: { id: 'gsmarena-dxomark-mobile-specs-api', status: env.MOBILE_SPECS_API ? 'configured' : 'not-configured', features: ['enriched phone data', 'DXOMARK scores', 'camera samples', 'review pages'] }
    }));
  }

  const secondaryBase = typeof env.MOBILE_SPECS_API === 'string' ? env.MOBILE_SPECS_API.trim().replace(/\/$/, '') : '';
  const secondaryRoutes = [
    { pattern: /^\/api\/enriched$/, upstream: '/phone', parameter: 'name' },
    { pattern: /^\/api\/dxomark$/, upstream: '/dxomark', parameter: 'name' },
    { pattern: /^\/api\/dxomark-review$/, upstream: '/dxomark/review', parameter: 'name' },
    { pattern: /^\/api\/dxomark-samples$/, upstream: '/dxomark/review/samples', parameter: 'name' },
    { pattern: /^\/api\/secondary-search$/, upstream: '/search', parameter: 'query' }
  ];
  const secondaryMatch = secondaryRoutes.find(route => route.pattern.test(path));
  const reviewMatch = path.match(/^\/api\/review\/([^/]+)(\/camera-samples|\/images)?$/);
  if (secondaryMatch || reviewMatch) {
    if (!secondaryBase) return json({ ok: false, source: 'secondary-provider', error: 'The optional DXOMARK enrichment service is not configured. Deploy the documented companion API and set MOBILE_SPECS_API to its base URL.' }, 424, { 'cache-control': 'no-store' });
    let upstreamPath;
    let parameter;
    let value;
    if (secondaryMatch) {
      upstreamPath = secondaryMatch.upstream;
      parameter = secondaryMatch.parameter;
      value = (url.searchParams.get(parameter) || '').trim();
    } else {
      upstreamPath = `/review/${cleanId(reviewMatch[1])}${reviewMatch[2] || ''}`;
      parameter = null;
      value = null;
    }
    if (parameter && (!value || value.length > 120)) return json({ ok: false, error: `A valid ${parameter} parameter is required.` }, 400, { 'cache-control': 'no-store' });
    const query = parameter ? `?${parameter}=${encodeURIComponent(value)}` : '';
    return withCache(request, ctx, `${path}${url.search}`, 300, async () => {
      try {
        const upstream = await fetch(`${secondaryBase}${upstreamPath}${query}`, { headers: { accept: 'application/json', 'user-agent': 'alx-mobile-discovery/1.0' }, signal: AbortSignal.timeout(20000) });
        const payload = await upstream.json().catch(() => null);
        if (!upstream.ok || !payload || payload.status === false) return fail('gsmarena-dxomark-mobile-specs-api', payload?.error || `Secondary provider returned HTTP ${upstream.status}`, upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502, payload?.details);
        return json(ok('gsmarena-dxomark-mobile-specs-api', payload.data ?? payload, { matched: payload.matched || null, providerCache: payload._cache || null }));
      } catch (error) {
        return fail('gsmarena-dxomark-mobile-specs-api', error.message || 'Secondary provider request failed');
      }
    });
  }

  if (path === '/api/health') {
    return json(ok('alx-mobile-api', { status: 'online', provider: 'gsmarena-api', timestamp: new Date().toISOString() }));
  }
  if (path === '/api/capabilities') {
    return json(ok('alx-mobile-api', {
      primary: 'nordmarin/gsmarena-api',
      available: ['brands', 'brand catalog', 'device specifications', 'keyword search', 'top devices', 'deals', 'glossary', 'glossary detail'],
      unavailable: [
        { feature: 'advanced device filters', reason: 'Not exported by the inspected upstream package entry point.' },
        { feature: 'news', reason: 'Not exported by the inspected upstream package entry point.' },
        { feature: 'reviews', reason: 'Not exported by the inspected upstream package entry point.' }
      ],
      note: 'The upstream package scrapes GSMArena and is not an official API.'
    }));
  }

  const match = path.match(/^\/api\/(brands|device|glossary)(?:\/([^/]+))?$/);
  if (match) {
    const [, kind, rawId] = match;
    const id = cleanId(rawId);
    if (kind === 'brands' && !id) {
      return withCache(request, ctx, path, cacheDurations.brands, async () => {
        try {
          const data = await providerCall(() => gsmarena.catalog.getBrands());
          return json(ok('GSMArena', data));
        } catch (error) { return fail('GSMArena', error.message || 'Could not load brands'); }
      });
    }
    if (kind === 'brands' && id) {
      return withCache(request, ctx, path, cacheDurations.brand, async () => {
        try {
          const data = await providerCall(() => gsmarena.catalog.getBrand(id));
          return json(ok('GSMArena', dedupeDevices([data])));
        } catch (error) { return fail('GSMArena', error.message || 'Could not load this brand'); }
      });
    }
    if (kind === 'device' && id) {
      return withCache(request, ctx, path, cacheDurations.device, async () => {
        try {
          const data = await providerCall(() => gsmarena.catalog.getDevice(id));
          return json(ok('GSMArena', data));
        } catch (error) { return fail('GSMArena', error.message || 'Could not load device specifications'); }
      });
    }
    if (kind === 'glossary' && !id) {
      return withCache(request, ctx, path, cacheDurations.glossary, async () => {
        try {
          const data = await providerCall(() => gsmarena.glossary.get());
          return json(ok('GSMArena', data));
        } catch (error) { return fail('GSMArena', error.message || 'Could not load glossary'); }
      });
    }
    if (kind === 'glossary' && id) {
      return withCache(request, ctx, path, cacheDurations.term, async () => {
        try {
          const data = await providerCall(() => gsmarena.glossary.getTerm(id));
          return json(ok('GSMArena', data));
        } catch (error) { return fail('GSMArena', error.message || 'Could not load glossary entry'); }
      });
    }
  }

  if (path === '/api/search') {
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2) return json({ ok: false, error: 'Enter at least two characters.' }, 400, { 'cache-control': 'no-store' });
    if (q.length > 80) return json({ ok: false, error: 'Search query is too long.' }, 400, { 'cache-control': 'no-store' });
    return withCache(request, ctx, `${path}?q=${encodeURIComponent(q.toLowerCase())}`, cacheDurations.search, async () => {
      try {
        const data = await providerCall(() => gsmarena.search.search(q));
        return json(ok('GSMArena', dedupeDevices([data])));
      } catch (error) { return fail('GSMArena', error.message || 'Search failed'); }
    });
  }

  if (path === '/api/top') {
    return withCache(request, ctx, path, cacheDurations.top, async () => {
      try { return json(ok('GSMArena', await providerCall(() => gsmarena.top.get()))); }
      catch (error) { return fail('GSMArena', error.message || 'Could not load popular devices'); }
    });
  }

  if (path === '/api/deals') {
    return withCache(request, ctx, path, cacheDurations.deals, async () => {
      try { return json(ok('GSMArena', await providerCall(() => gsmarena.deals.getDeals()))); }
      catch (error) { return fail('GSMArena', error.message || 'Could not load deals'); }
    });
  }

  if (path === '/api/compare') {
    const ids = (url.searchParams.get('ids') || '').split(',').map(cleanId).filter(Boolean).slice(0, 4);
    if (ids.length < 2) return json({ ok: false, error: 'Provide at least two device IDs.' }, 400, { 'cache-control': 'no-store' });
    const results = await Promise.all(ids.map(async id => {
      try { return { id, ok: true, data: await providerCall(() => gsmarena.catalog.getDevice(id)) }; }
      catch (error) { return { id, ok: false, error: error.message || 'Device lookup failed' }; }
    }));
    return json(ok('GSMArena', results, { partial: results.some(item => !item.ok) }));
  }

  if (path === '/api/news' || path === '/api/reviews' || path === '/api/filters') {
    return json({ ok: false, source: 'GSMArena adapter', error: 'This capability is listed by the upstream project but is not exported by its current public entry point. No placeholder data is returned.', capability: path.slice(5) }, 501, { 'cache-control': 'no-store' });
  }

  return json({ ok: false, error: 'API route not found.' }, 404, { 'cache-control': 'no-store' });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return routeApi(request, env, ctx);
    if (url.pathname === '/favicon.ico') return new Response(null, { status: 204 });
    return env.ASSETS.fetch(request);
  }
};
