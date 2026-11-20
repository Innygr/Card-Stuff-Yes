# Card Stuff Yes transactional email

Card Stuff Yes uses Resend as its transactional email transport. The integration is deliberately disabled unless both required environment variables are present.

## Environment variables

Configure these only on the server, in the root-owned environment file (never in GitHub frontend variables or browser code):

- `RESEND_API_KEY`: Resend API key. Keep it secret.
- `CSY_EMAIL_FROM`: verified sender address, for example `Card Stuff Yes <noreply@cardstuffyes.ca>` once the domain is verified with Resend.

Optional:
- `CSY_EMAIL_REPLY_TO`: reserved for a future support/reply workflow; not currently used automatically.

Do not set either variable until the domain is verified and the provider account is ready. Without them, `emailStatus()` reports disabled and send attempts return `{ sent: false, reason: "email_not_configured" }` without making a network request.

## DNS and provider setup (later)

When the domain is ready, add the exact DNS records Resend supplies for domain verification and sending authentication. Do not guess or reuse records from another provider. Coordinate SPF so the domain has one valid SPF policy, enable DKIM, and publish a DMARC policy. Keep inbound mailbox MX records separate from Resend's sending records as directed by each provider.

## Current server foundation

- Provider API calls are server-side only; no API key is exposed to clients.
- Sends use HTTPS, a 10-second timeout, bounded payloads, and recipient validation.
- Provider response bodies and credentials are never logged or returned to clients.
- HTML templates escape interpolated text and require HTTPS action URLs.
- Verification and password-reset email templates are ready to use.
- Email is not yet connected to registration or password reset routes. Those flows require one-time, hashed database tokens, generic responses, rate limits, and atomic token consumption; they will be implemented before enabling user-facing email actions.
- Do not treat a successful provider API response as proof of inbox delivery.

## Local checks

Run `npm test` and `npm run check`. The email tests do not send messages and do not require a provider account.
