# Card Stuff Yes DNS and subdomain map

DNS sends each hostname to the application ingress. The Node server then uses the HTTP `Host` header to choose the page. **DNS cannot turn a hostname into a URL path by itself**; this repository implements that second step.

## Hostname map

| Hostname | Server destination | Status |
|---|---|---|
| `cardstuffyes.ca` | `/homepage.html` | Main site |
| `www.cardstuffyes.ca` | Redirect to the apex domain | Alias |
| `play.cardstuffyes.ca` | `/cardgame.html` | Solo Battle Arena |
| `pvp.cardstuffyes.ca` | `/multiplayer.html` | Online two-player game |
| `api.cardstuffyes.ca` | `/api/*` only | API host |
| `cards.cardstuffyes.ca` | `/set-manager.html` | Card/set manager |
| `decks.cardstuffyes.ca` | `/deckbuild.html` | Deck builder |
| `account.cardstuffyes.ca` | `/account.html` | Account page; account API remains unfinished |
| `profile.cardstuffyes.ca` | `/profile.html` | Profile page; account API remains unfinished |
| `settings.cardstuffyes.ca` | `/settings.html` | Settings page |
| `news.cardstuffyes.ca` | `/news.html` | News page |
| `help.cardstuffyes.ca` | `/how-to-play.html` | Rules/help page |
| `admin.cardstuffyes.ca` | `/admin-login.html` | Admin sign-in page; owner/admin login and server-log APIs are implemented |

Unlisted subdomains return 404. The API hostname rejects non-API paths. Page subdomains continue to serve CSS, JavaScript, images, and other static assets at their existing paths.

## DNS records to configure at the DNS provider

The correct target depends on the hosting provider. Replace placeholders with the actual public server IP or provider ingress hostname.

| Type | Name | Target |
|---|---|---|
| A (and AAAA if available) | `@` | Public IP of the reverse proxy |
| CNAME | `www` | `cardstuffyes.ca` |
| CNAME | `*` | Provider ingress hostname (or wildcard A/AAAA to the proxy IP) |

If the DNS provider supports apex CNAME flattening, the apex may point at the provider ingress hostname. If the API is hosted separately, create an explicit `api` record to the API ingress and point the wildcard at the frontend ingress.

## API and session configuration

Production browser pages call `https://api.cardstuffyes.ca`. Set `CSY_ALLOWED_ORIGINS` to the exact frontend HTTPS origins listed in `compose.yaml`. The API uses exact-origin credentialed CORS. Admin login and logout accept only same-origin or explicitly allowlisted frontend origins. Admin sessions use an HttpOnly, SameSite=Strict cookie shared with the parent domain so the admin subdomain and API subdomain can both validate it. Keep HTTPS enabled and test session continuity from the PvP page before launch. The default SameSite setting is Lax; the server adds Secure when the reverse proxy forwards `X-Forwarded-Proto: https`.

## Hosting and TLS requirements

1. Create the DNS records using the real hosting target.
2. Configure the reverse proxy/platform to accept the apex and required subdomains, preserving the original `Host` header.
3. Terminate HTTPS and set `X-Forwarded-Proto: https` only through a trusted proxy.
4. Install a certificate covering `cardstuffyes.ca` and `*.cardstuffyes.ca` (wildcard certificates normally require DNS-based validation).
5. Set `CSY_DOMAIN=cardstuffyes.ca` in the server environment.
6. Keep the Node server behind the HTTPS proxy; do not expose the prototype port directly to the public internet.

A wildcard record generally covers one subdomain label such as `play.cardstuffyes.ca`, not nested names such as `beta.play.cardstuffyes.ca`.

## Deployment status

This change adds host-based routing and documents the DNS plan. It does **not** modify registrar DNS, provision hosting, configure the reverse proxy, issue certificates, or prove the domain is live. Those actions require access to the DNS and hosting provider.

The account and profile workflows, plus admin player/news management APIs, are not implemented yet. Admin owner/admin login, session lookup, logout, and server-log reads are implemented. The admin session cookie is shared across Card Stuff Yes subdomains using `CSY_ADMIN_COOKIE_DOMAIN`; keep it restricted to the project parent domain and HTTPS.
