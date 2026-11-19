# Frontend migration — phase 1

This branch prepares the shared frontend/backend boundary. It does not move
pages or change either deployed branch.

## Added

- `runtime-config.js`: one API-origin configuration for production, local
  development, or an explicit per-deployment meta-tag override.
- `api.js`: one browser API client with credentialed requests, no-store
  caching, JSON request-body handling, and consistent HTTP errors.

## Include order

Pages that use the API should load these scripts in this order, before their
page-specific JavaScript:

```html
<script src="/runtime-config.js" defer></script>
<script src="/api.js" defer></script>
<script src="/path/to/page.js" defer></script>
```

The scripts use `defer`, so they execute in document order after parsing.

For a staging deployment, set an explicit API origin:

```html
<meta name="csy-api-base" content="https://staging-api.example.test">
```

Do not use a production API origin for local or staging testing unless that is
intentional.

## Migration rules

1. Preserve existing frontend paths on the first transfer; do not reorganize
   into `css/`, `js/`, or `pages/` until the site is working from Main.
2. Load the shared configuration before any script that calls `/api/*`.
3. Replace direct API `fetch("/api/...")` calls with `CSY_API` methods.
4. Keep credentials in browser-managed HttpOnly cookies; never put session
   tokens in local storage.
5. The API server must allow only the exact frontend origins and support
   credentialed CORS. Cookie domain, SameSite, Secure, HTTPS, and CSRF policy
   must be reviewed together before cross-origin authentication is enabled.
6. A successful frontend build does not prove account, profile, admin, or
   deck APIs exist. Verify each endpoint against the backend implementation.
7. Keep the current Server-hosted frontend until every migrated page and route
   has passed staging tests.

## Not included in phase 1

- No page or asset copies.
- No changes to Server, DNS, Cloudflare Tunnel, Nginx, or the live Ubuntu host.
- No production deployment switch.
- No removal of the compatibility frontend from Server.

## Next phase

Copy the current Server frontend to this branch while preserving file paths and
binary asset bytes. Then add the two shared scripts to pages and migrate each
page-specific API caller in small, testable groups.
