# alx mobile discovery

A warm, editorial-style smartphone discovery database for `mobile.alx12.dpdns.org`.
Built as a Cloudflare Worker with static assets and a server-side API adapter for [`nordmarin/gsmarena-api`](https://github.com/nordmarin/gsmarena-api).

## Features

- GSMArena brand directory, brand catalog, device search and full device specifications
- GSMArena top lists, hot deals and glossary/term detail
- Optional second provider adapter for enriched phone data, DXOMARK scores, camera samples and review pages
- Device comparison using complete available specification groups
- Source-aware normalized responses and duplicate merging for multi-source extensions
- API status, health check, upstream error handling, short-lived edge caching
- Responsive warm-orange / Nunito interface, mobile navigation and persistent search
- Optional Kawarp WebGL background using the existing About-page image
- Cloudflare Worker + Static Assets deployment

## Important upstream notes

`gsmarena-api` is a scraper/parser of the public GSMArena website, not an official GSMArena API. Its README calls the project early-development software. The package's public entry point currently exposes `catalog`, `deals`, `glossary`, `search`, and `top`. The upstream README also lists advanced filters, news and reviews as planned/implemented feature areas, but those are not exported by the package entry point inspected for this build. This project reports those areas as unavailable rather than fabricating data. They are isolated behind the provider adapter so they can be added when the upstream package exposes them or a compatible source is configured.

The optional companion source is [`Sanjeevu-Tarun/gsmarena-dxomark-mobile-specs-api`](https://github.com/Sanjeevu-Tarun/gsmarena-dxomark-mobile-specs-api). It documents enriched phone data, DXOMARK scores, categorized camera samples, reviews and additional device endpoints. The project says it must be self-hosted; no public API instance is assumed. Deploy that companion separately if desired, then set `MOBILE_SPECS_API` in the Worker variables to its base URL. The main GSMArena experience does not depend on it.

The package is executed inside the Worker using `nodejs_compat`. Scraping providers can change markup or block automated traffic; upstream errors are surfaced as source errors, not converted into fake empty results.

## Local development

```bash
npm install
npm run dev
```

## Deploy

```bash
npm install
npx wrangler login
npm run deploy
```

Then in Cloudflare, open the Worker `alx-mobile-discovery` and add the custom domain:

`mobile.alx12.dpdns.org`

Cloudflare will provision HTTPS and route the hostname to the Worker. If that domain is already attached to another service, remove the conflicting route first.

## API

- `GET /api/health`
- `GET /api/brands`
- `GET /api/brands/:brandId`
- `GET /api/device/:deviceId`
- `GET /api/search?q=iphone`
- `GET /api/top`
- `GET /api/deals`
- `GET /api/glossary`
- `GET /api/glossary/:termId`
- `GET /api/compare?ids=device-id,device-id`
- `GET /api/capabilities`
- `GET /api/providers`
- Optional companion routes: `/api/enriched?name=`, `/api/dxomark?name=`, `/api/dxomark-review?name=`, `/api/dxomark-samples?name=`, `/api/secondary-search?query=`, `/api/review/:slug`

Responses use `{ ok, source, data, error, cachedAt }`.

## Adding providers

Add another provider in `src/providers/` and register it in `src/index.js`. Keep provider-specific parsing in the adapter, normalize shared device fields, retain source attribution, and deduplicate on normalized manufacturer + model identity (fall back to provider ID). Never overwrite a non-empty field with an empty value.
