# 36 · Admin Overview

**Status: built 2026-11-13 (not committed).**

One page that shows an admin what needs attention, with a link to each place.

## How bandfan did it (read 2026-11-13)

It had no Overview. `/admin` (`pages/admin/index.tsx`) redirected to `/admin/wallet`, the curated
asset list. No admin page showed counts or totals.

## Bandcoin today

`/admin` redirects to Artists. Plan 11 designed an Overview and then didn't build it ("`/admin`
opens Artists, as in Wadzzo", 2026-10-30). Since then the admin gained Pin review, Story review,
Domains and Jobs.

## Decisions (your answers, 2026-11-13)

| Question         | Answer                                                       |
| ---------------- | ------------------------------------------------------------ |
| Build it         | Yes                                                          |
| Attention counts | Every queue there is now                                     |
| Totals           | Plain number tiles, no charts                                |
| Opening `/admin` | Shows the Overview; "Overview" is first in the Admin sidebar |

## What the code makes of "every queue"

Four things I found while reading the code, for you to confirm with the plan:

- **Stories have no review queue.** Story review lists the stories that are live now, and an admin
  can take one down. So there is no "stories to review" number. The Overview shows **Live stories**
  among the totals instead, linking to Story review.
- **Stuck payments and broken domains are also alerts.** They get their own tiles as asked, so the
  same problem can count once there and once in "Open alerts".
- **"Today" means the last 24 hours**, as Alerts already counts failed payments. Failed jobs are
  counted the same way, because old failed jobs are never cleared and would only ever grow.
- **Sales this week is a number of sales** (delivered item purchases in the last 7 days), not a
  money total, because sales are paid in four currencies.

## The page

**Needs attention** (each tile links to its page; a zero is shown muted, not hidden):

| Tile                         | Counts                                                      | Opens        |
| ---------------------------- | ----------------------------------------------------------- | ------------ |
| Artists waiting for approval | Artists with status PENDING                                 | Artists      |
| Pins to review               | Pins with status PENDING                                    | Pin review   |
| Murals to review             | Murals with status PENDING (not merged)                     | Mural review |
| Open alerts                  | What Alerts lists as open                                   | Alerts       |
| Stuck payments               | Orders SUBMITTED longer than the alert setting (10 minutes) | Alerts       |
| Failed payments today        | Orders FAILED in the last 24 hours                          | Activity     |
| Failed jobs today            | Jobs FAILED in the last 24 hours                            | Jobs         |
| Broken custom domains        | Domains with status BROKEN                                  | Domains      |

**Totals** (plain tiles): Users, Artists (approved), Items, Sales this week, Live stories.

## What gets built

### API (`packages/api`)

- New `services/admin/overview.ts`: `getOverview(ctx, now)` runs the counts together and returns
  `{ attention: [...], totals: [...] }`. It reuses `listAlerts` and the alert rules for "open alerts"
  and "stuck", and the same filters the Pins, Murals and Jobs pages use.
- `admin.overview` query on the admin router (admins only). Read-only, so nothing to activity-log.

### Portal (`apps/artist`)

- `/admin` renders the Overview instead of redirecting.
- New `features/admin/overview-view.tsx`, in the same page shell, tiles and skeleton/error states as
  the other admin pages.
- Sidebar: "Overview" first in the Admin group (`features/shell/nav.ts`, and its test).

## Tests

- API: each count from a fake database (waiting, stuck by the rule, 24-hour windows, alerts already
  reviewed not counted); non-admins refused by the router.
- Portal: the nav test with the new item.
- `pnpm typecheck && pnpm lint && pnpm test`.

## Not in this plan

- Charts, money totals, or any action on the page itself.

## Built (2026-11-13)

- Confirmed with the plan: "Live stories" sits under Totals; "today" is the last 24 hours; sales are
  a count; stuck payments and broken domains have their own tiles and also count as alerts.
- API: `services/admin/overview.ts`, `admin.overview` (admins only).
- Portal: `/admin` renders `features/admin/overview-view.tsx`; "Overview" is first in the Admin
  sidebar group and lit only on `/admin`.
- Tests: `admin-overview.test.ts` (4), one more in `nav.test.ts`.
- Not checked in a browser.
