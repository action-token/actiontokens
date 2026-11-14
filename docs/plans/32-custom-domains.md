# 32 · Custom domains

**Status: built 2026-11-09 (not yet run against a real Vercel project or clicked through in a browser).**

An artist connects their own domain (e.g. `coldplay.com`) and it shows their Bandcoin artist page.
The `custom_domains` table and 2 domains copied from bandfan exist; nothing else does yet.

## How bandfan did it (read 2026-11-09)

- Artist › Domain: type a domain, and the server called **AWS Amplify** (`CreateDomainAssociation`) to
  attach it to bandfan's Amplify app with an Amplify SSL certificate. Root only: no `www`.
- One domain per artist, unique across artists. The row (`domain`, `creatorId`) was saved only after
  AWS accepted it. There was no status column: the page read the status live from Amplify each time.
- The page showed the DNS records AWS returned (an SSL-validation CNAME plus the CloudFront
  CNAME/ANAME), a 3-step progress bar (SSL → DNS → deployment → `AVAILABLE`) and a tutorial.
  Ownership was proved by the SSL validation record.
- Delete removed it from Amplify, then the row (the row was removed even if AWS failed).
- Fans got **the plain bandfan site** on that domain: nothing read the request's host, so it never
  showed the artist's page. There was no admin view and no re-check.

## Decisions (your answers, 2026-11-09)

| Question             | Answer                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Keep it?             | **Build it**                                                                                                                          |
| What a fan sees      | **The artist's page only.** Other links open on bandcoin.io                                                                           |
| Hook-up              | **Automatic, through a host adapter.** Vercel now; another host (e.g. Amplify) is a new adapter                                       |
| Domain kinds         | **A root domain with `www` redirecting to it, or a subdomain**                                                                        |
| Who / price          | **Free, approved artists**, one domain each (as bandfan)                                                                              |
| The 2 copied domains | **Shown as "Needs verifying"**: not served until the artist reconnects                                                                |
| Where in the portal  | **A Settings tab "Custom domain"** beside Short link                                                                                  |
| Admin                | **Admin › Domains**: list every domain and remove one (it is detached from the host too)                                              |
| Re-check             | **A daily worker check.** A broken domain is told to the artist (bell) and shows in Admin › Alerts; it is never removed automatically |
| Live notice          | **A bell when the domain goes live**                                                                                                  |

| How soon "live" is noticed | **Pending domains every 15 minutes, live and broken ones daily**; "Check now" any time |
| Admin removes a domain | **The artist gets a bell with the reason** |

## 1. Data (`packages/db`, one migration)

`CustomDomain` keeps `domain` (unique), `artistId` (unique) and `verifiedAt`, and gains:

- `status`: `NEEDS_SETUP` (copied rows: not on the host yet) → `PENDING` (on the host, waiting for
  DNS/SSL) → `LIVE` → `BROKEN` (was live, now failing).
- `withWww` (root domains: `www.` is added on the host as a redirect to the root).
- `lastCheckedAt`, `brokenSince`, plus `lastError` (the host's plain message).

The 2 copied rows become `NEEDS_SETUP`. A new `NotificationType` value `DOMAIN` is added.

## 2. Host adapter (`packages/api/src/services/domains/`)

```
host.ts       interface: add(domain, { www }), status(domain) → { records, verified, configured, error }, remove(domain)
vercel.ts     Vercel REST API: project domains (add / get / verify / delete) and domain config
manual.ts     no host API: says "Custom domains aren't open yet" so nothing half-works
index.ts      picks the adapter from DOMAIN_HOST=vercel|manual (default manual)
```

- Env: `DOMAIN_HOST`, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` (the **fan app's** project), and
  `VERCEL_TEAM_ID` (optional). Added to the API, artist portal and worker `.env.example`.
- The DNS records shown come **from the host's answer**, never hard-coded (bandfan's tutorial fell
  back to a sample CloudFront address).
- Before writing the adapter I check Vercel's current API docs for the exact endpoints.

## 3. Service and API (`routers/artist/domain.ts`, `routers/admin`)

- `domain.overview`: the artist's domain, its status read **live from the host** when the page
  opens (as bandfan did), saved back to the row, plus the records to add.
- `domain.add({ domain })`: approved artists only. It checks the domain looks real, refuses bandcoin's
  own hosts, and refuses one already used by any artist. It also refuses if this artist has one
  already (remove it first, as bandfan). It is added on the host first, and the row is saved only if
  that worked.
- `domain.check`: the "Check now" button; same as the live read.
- `domain.reconnect`: for `NEEDS_SETUP` rows; adds it on the host and moves to `PENDING`.
- `domain.remove`: off the host, then the row. If the host says it's already gone, the row is still
  removed. Any other host error stops, so nothing is left half-removed.
- `admin.domains.list` / `admin.domains.remove` (with a required reason, logged).
- Every mutation goes through the activity log as usual.

## 4. Serving the artist page (`apps/app`)

- `proxy.ts`: a request whose host isn't one of Bandcoin's own (`FAN_APP_URL`'s host, `www.`,
  `localhost`, `*.vercel.app`) is a custom domain.
  - `/` is rewritten to `/domain-site/[host]`, which looks the host up and shows `ArtistView` only
    when the domain is `LIVE`. Anything else is a 404.
  - Every other path redirects (307) to the same path on bandcoin.io, so the artist page's links
    work. `_next` assets and images pass straight through.
- Metadata: the canonical URL is the custom domain.
- Sign-in stays on bandcoin.io (the cookie can't be shared with another domain), so "Sign in" and
  any money action happen there.

## 5. Worker

- `domains.check` (every 15 minutes): reads every `PENDING` domain, and every `LIVE`/`BROKEN`
  domain whose `lastCheckedAt` is over a day old, from the host.
  - `PENDING → LIVE`: sets `verifiedAt` and sends the "is live" bell.
  - `LIVE → BROKEN`: sets `brokenSince` and sends a bell.
  - `BROKEN → LIVE`: clears it.
  - It is not a payment, so it can safely repeat. One failing domain doesn't stop the rest.
- Admin › Alerts gains `brokenDomain` (any `BROKEN` row), computed on page load like the others.

## 6. Screens (same look as the other portal pages)

- **Settings › Custom domain**: built from the Short link tab's pieces (the same `SettingsSection`,
  bordered card, buttons, error and skeleton states).
  - No domain: a field and "Connect domain", with a line saying it's free.
  - Connected: the domain as a link with a status line in plain words ("Waiting for DNS", "Live",
    "Stopped working since 3 Nov: …", "Needs verifying") and the record table (type, name, value,
    each with Copy). Below that: "Check now" and "Remove" (confirm dialog), plus a short note that
    DNS can take up to 48 hours.
  - Root domains show the `www` record too.
- **Admin › Domains**: in the admin menu, shaped like the other admin lists: domain, artist (links to
  the artist page), status, last checked, and Remove with a reason.
- Fan app: nothing new to look at; the domain shows the existing artist page.

## Tests

- Unit: domain validation (root vs subdomain, bandcoin's own hosts refused), status transitions,
  the adapter's mapping from Vercel answers (fake HTTP), add/remove failure paths, and proxy host
  matching and redirects.
- Worker: the live bell is sent once, broken is told once, and one bad domain doesn't stop the run.
- A real Vercel run needs your `VERCEL_TOKEN` and project id. Until then the adapter is tested with
  recorded answers only.

## Needs from you

- A Vercel token with access to the fan app project, the project id (and team id if it's a team).

## Built (2026-11-09)

- Schema + migration `20261109100000_custom_domain_status` (copied rows become `NEEDS_SETUP`). **Not applied
  to any database yet**: run `pnpm --filter @bandcoin/db migrate:deploy` on dev, then production.
- `services/domains/` (host interface, Vercel and manual adapters, status rules, service), name rules in
  `@bandcoin/utils/domain` (shared with the portal), portal `domain.*` router, `admin.domains.*`,
  `artist.byDomain` for the fan app, a `DOMAIN` bell note, Admin › Alerts `brokenDomain`.
- Fan app: `proxy.ts` + `lib/custom-host.ts` route custom hosts; `/domain-site/[host]` shows the artist page.
- Worker: `domains.check` every 15 minutes (waiting domains each run, live/broken ones daily).
- Portal: Settings › Custom domain (built from the Short link tab's pieces, now shared in
  `features/domain/panel-card.tsx`), Admin › Domains (shaped like Story review). `HideDialog` gained an
  optional `confirmLabel`.
- Tests: `domains.test.ts`, `domains-host.test.ts` (Vercel answers faked), `custom-host.test.ts`, the
  alerts and nav tests updated. Typecheck, lint (changed files) and all suites pass.

Vercel's answers in the tests follow its API reference (checked 2026-11-09); its error body shape
(`error.message`) isn't documented there, so a refusal without it shows "Vercel answered <status>".
