# Domain ownership and DNS setup

This guide is for project maintainers after the Card Stuff Yes domain is registered. It intentionally contains no guessed DNS targets or credentials.

## Before registration

- [ ] Have a parent or guardian review and approve the purchase, renewal price, registrar account, and payment method.
- [ ] Confirm the exact domain spelling and renewal cost before checkout.
- [ ] Enable registrar-account multi-factor authentication.
- [ ] Use accurate registrant/contact information and enable registrar privacy protection where available and appropriate.
- [ ] Turn on auto-renew only after the payment method and renewal reminders are understood.
- [ ] Keep account recovery codes and registrar credentials in a trusted password manager; never commit them to Git.

## After registration

1. Confirm the domain appears in the registrar account and that the project maintainers control the DNS zone.
2. Keep the registrar account protected with MFA and limit access to trusted maintainers.
3. Record the registrar, renewal date, and DNS provider in private operational records. Do not put account IDs, recovery codes, API tokens, or billing details in this public repository.
4. Decide where the frontend and API will be hosted before adding website records. Obtain exact A, AAAA, CNAME, or other records from that hosting provider; do not guess IP addresses or targets.
5. Add only the records required by the selected host. Verify apex and www behavior, HTTPS issuance, redirects, and DNS propagation in staging before treating the domain as production-ready.

## Transactional email (Resend)

Email DNS must be configured only after the domain exists and the sending provider has generated the exact records.

- [ ] Choose the intended sending subdomain (previously considered: mail.cardstuffyes.ca).
- [ ] Add the provider-generated DKIM record exactly as supplied.
- [ ] Add the provider's SPF record at the exact host/name it specifies. Avoid multiple SPF TXT records at the same hostname; merge mechanisms only with provider guidance.
- [ ] Add a DMARC TXT record with a cautious monitoring policy first, then tighten it after legitimate senders are confirmed.
- [ ] Verify the domain in the provider dashboard and send test messages to inboxes you control.
- [ ] Confirm From address, reply handling, bounce handling, and abuse/contact procedures before enabling account or security emails.

Do not reuse DNS values from examples, screenshots, or earlier setup attempts. Provider-generated values can be unique to the domain and account. Never publish API keys or SMTP credentials; store them in protected runtime configuration.

## Go-live gates

- [ ] Confirm website hosting and API origins are finalized.
- [ ] Verify DNS records against the hosting provider's current instructions.
- [ ] Confirm valid HTTPS for every public hostname.
- [ ] Test CORS, session-cookie domain and security attributes, API routing, and health checks.
- [ ] Verify email SPF, DKIM, and DMARC results before sending real user mail.
- [ ] Document rollback steps before changing production records.

Registering a domain does not deploy the site, provision email, or make the service production-ready. Do not change live DNS or deploy until the maintainers explicitly approve the exact plan.
