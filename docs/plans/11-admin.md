# 11 · Admin (stage 6)

The rest of `/admin` in the artist portal. Today it has **Artists** (approve,
reject, ban), **Activity** (the log) and **Mural review**. This stage brings
main's admin pages over, laid out like Wadzzo's brand admin
(`apps/brand/src/features/admin`): list pages with filters and a table, and a
detail page per person.

Every admin action is an `adminProcedure` mutation, so it is already written
to the activity log (`admin.*` actions with the target).

## Decisions (asked 2026-10-30)

| Question           | Answer                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| User actions       | **Suspend / unsuspend.** Blocks sign-in and every action, keeps all data, can be undone. No delete.                      |
| Who manages admins | **Any admin, like main.** An admin can't remove their own admin role.                                                    |
| Platform fee       | **Both, like main:** the saved fee % for classic sales, and the contract-NFT fee changed on-chain by the admin's wallet. |
| Extras from main   | Collection report (all artists), map of all pins, wallet asset list: **built last**, after everything else.              |

## Status (2026-10-31): done

Built following Wadzzo's admin (decided 2026-10-30): Artists + artist page,
Users + user page, Admins, Pin review (approve first) + pin map, Mural review,
Bounties, Items, Collection reports (every artist or one), Alerts, Settings
(fees, short link prices, pin radius, alert thresholds, contract-NFT fee
server-signed by the treasury), Activity. Changed from the plan below:

- **Overview** not built then (`/admin` opened Artists, as in Wadzzo); built 2026-11-13, see plan 36.
- **Pins** need approval first (not "live without review").
- **Wallet asset list** dropped: admins don't curate Stellar assets in this app (asked 2026-10-31).

## Pages

### 1. Overview `/admin`

Replaces the redirect. Counts that need attention, each linking to its page:
artists waiting for approval, murals to review, open alerts, payments stuck in
`SUBMITTED`, failed payments today. Plus totals: users, artists, items, sales
this week.

### 2. Users `/admin/users`

Table: name and avatar, username, email or wallet (masked), role, joined,
last active, status. Search by name, username, email or wallet; filter by role
and status. Like Wadzzo's users page.

### 3. Person page `/admin/users/[id]`

One page for any person (artists too, with an extra artist block). Left:
profile, wallet address with balances, role and status, counts (items owned,
pins collected, rewards redeemed, following). Right: **activity timeline**
from `ActivityLog` (sign-ins, purchases, uploads, pin claims, bounty
submissions, failed actions), newest first, filter by kind, paging. Below:
their orders and items owned.

Actions (each with a confirm dialog and a reason that goes in the log):

- **Suspend / Unsuspend.** New `User.suspendedAt` + `suspendedReason`. A
  suspended user is signed out and refused at sign-in and in every
  `authedProcedure` (error: "This account is suspended."). Pages that are
  public stay public.
- **Make admin / Remove admin.** Role change; can't remove your own.
- For artists: the existing approve / reject / ban, plus their issuer and
  storage accounts and items.

`/admin/artists` rows link here.

### 4. Pins `/admin/pins`

Every artist's pins (pins go live without review, decided in stage 4).
Filter by artist, type, status (live, hidden, ended), search. Actions: **hide**,
**show again**, **delete** (delete only when nothing was collected; otherwise
hide). Like Wadzzo's pin review list, without the approve step.

### 5. Bounties `/admin/bounties`

Every bounty: artist, prize and currency, escrow state (draft, funded,
paid out, refunded), participants, ends. Filter by status and artist. Read
only, plus **hide** (fans stop seeing it; escrow is untouched). Links to the
bounty and its escrow transaction on Stellar Expert.

### 6. Items `/admin/items`

Every item and listing (main's "market assets"): artist, type, chain
(classic / contract NFT), price, sold / supply, visibility. Filter and search.
Action: **hide** (unpublish) with a reason. No delete: items with sales are
kept.

### 7. Fees & settings `/admin/settings`

The single `AppSetting` row as a form:

- Platform fee % on sales and the account that receives it.
- **Contract-NFT fee:** shows what the shared NFT contract enforces now
  (read on-chain) next to the saved value. Changing it builds the
  `set_platform_fee` call; the admin signs with their own wallet (the
  contract admin), with the usual price breakdown and custodial countdown.
  Port of main's `platformFee` router (`buildSetPlatformFeeXDR`).
- Short link prices (monthly, name change; ACTION and USD).
- Nearby pin radius.

Saving shows what changed; every change is in the activity log.

### 8. Alerts `/admin/alerts`

Computed when the page loads (no worker yet), each with the person, what was
seen and a link to their timeline:

| Alert                 | Rule (default)                                              |
| --------------------- | ----------------------------------------------------------- |
| Many failed payments  | 5+ failed `order.*` actions by one person in 24 h           |
| Too-fast pin claims   | Two claims by one person further apart than 300 km/h allows |
| Many sign-in failures | 10+ failed sign-ins for one account or IP in 1 h            |
| Large transfer        | One order over 1,000 USD worth                              |
| Stuck payment         | Order `SUBMITTED` for more than 10 minutes                  |

An admin can **mark reviewed** (new table `AdminAlertReview`: kind, key,
reviewer, note), so it drops off the list. Thresholds live in `AppSetting`
and are editable on the settings page.

### 9. Extras (last)

- **Collection report, all artists:** the artist portal's report
  (`/reports`) with an artist picker and an "all artists" view, CSV export.
- **Map of all pins:** one map, every artist's pins, filter by artist; reuses
  the pins map.
- **Wallet asset list:** admins curate the Stellar assets fans see in their
  wallet (code, issuer, logo, description, market links), like main's
  `/admin/wallet` (`AdminAsset`). New `WalletAsset` table; the fan app wallet
  reads it.

## Changes outside the admin pages

- `User.suspendedAt`, `User.suspendedReason`; `AdminAlertReview`; alert
  thresholds on `AppSetting`; `WalletAsset` (extras). One migration each,
  applied to the dev database only.
- `packages/auth`: refuse sign-in for suspended users. `trpc.ts`:
  `authedProcedure` refuses them.
- `packages/chain`: `buildSetPlatformFee` for the NFT contract (from main's
  `lib/stellar/oz/nft`), with a test.
- Sidebar Admin group: Overview, Artists, Users, Pins, Bounties, Items,
  Alerts, Settings, Activity, Mural review.

## Order of work

Each step: service + router + tests, then the page, then a Safari check
(no real signing), then a local commit.

1. Suspend (schema, auth, trpc) and the Users list.
2. Person page with the activity timeline; Artists rows link to it.
3. Pins, Bounties, Items.
4. Fees & settings (saved values first, then the contract-NFT fee).
5. Alerts and the Overview page.
6. Extras: collection report, map of all pins, wallet asset list.

## Risks

- **Suspension** touches sign-in and every procedure: tests cover a suspended
  user being refused, and admins never being suspendable by themselves.
- **Contract-NFT fee** changes what every future NFT sale pays. The page
  shows the on-chain value before and after, and nothing is sent without the
  admin signing. It is not tested on mainnet.
- **Alerts** are computed per page load; fine for now, moves to the worker
  later.
