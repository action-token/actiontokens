# 12 · Artist onboarding wizard (like Wadzzo)

Replace today's three short steps (apply form → pay 1.5 XLM → wait) with one
wizard laid out like Wadzzo's brand onboarding
(`apps/brand/src/features/onboarding/onboarding-page.tsx`): a steps rail on
the left, one step card on the right, Back / Continue, a progress bar.

## Decisions (asked 2026-10-31)

| Question                | Answer                                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fan token in onboarding | **Yes.** Chosen in the wizard, saved with the application, **created when an admin approves**. No extra payment.                                               |
| Bring your own token    | **Yes, like Wadzzo.** An asset already on Stellar (code + issuer, checked live). The app already supports this (`fan-token.ts` mode `EXISTING`, `isExternal`). |
| Where the 1.5 XLM goes  | **Last step**, then "Waiting for approval". Same pay-then-approve rule as now.                                                                                 |
| Signed out              | Sidebar with every link; any page shows the sign-in card. **Done** (244b8ce).                                                                                  |

## Steps

1. **Photos** — profile picture (required) and cover (optional), with the
   artist page header previewed. Uploads use the existing `useUpload`.
2. **Details** — artist or band name (2–60), a line about you (optional, 500).
3. **Fan token** — two tabs, like Wadzzo's "Page asset":
   - _New_: the code (4–12 letters, suggested from the name, editable) and an
     image. Issued from their own Bandcoin account.
   - _Already on Stellar_: code + issuer, checked on the network as they type
     (`checkExistingToken`: valid, exists, not used by another artist).
4. **Page address** — `bandcoin.io/artist/{slug}`, suggested from the name,
   checked live (new `onboarding.checkSlug`). This is the free page address,
   not the paid short link.
5. **Review & pay** — everything above in one card with Edit links, then the
   1.5 XLM price breakdown and Pay (custodial wallets get the 5-second
   countdown with Cancel). Paying submits the application and opens the
   account in one go; then confetti and "Waiting for approval".

Leaving and coming back keeps what was typed (saved in the browser per
account), and a rejected artist starts from their last answers plus the
admin's reason.

## Server

- `Artist` gets `pendingFanToken Json?` (mode, code, issuer, coverUrl) — one
  migration on the dev database.
- `onboarding.submitApplication` takes the new fields (avatarUrl, coverUrl,
  fanToken) and validates them (own S3 URLs, code rules, existing-token check).
- `onboarding.checkSlug` and `onboarding.checkToken` for the live checks.
- **Approve** (`admin/artists.approveArtist`): after the status change, creates
  the fan token from `pendingFanToken` with `createFanToken` (an existing token
  is checked again first) and clears it. If that fails (say the code was taken
  meanwhile), approval still goes through and the artist sees "Set up your fan
  token" in Memberships, as today; the admin is told.
- Admin artist page shows the chosen token on a waiting application.

## Tests

Apply validation (photos, token modes, slug), checkSlug/checkToken, approval
creating each token kind and the fallback when it can't, rejected artist
re-applying with old answers. Then the wizard in Safari up to the pay step (no
real payment).

## Not in this stage

The paid short link (bandcoin.io/name) stays in Settings; Wadzzo's "Vanity
URL" step maps to the free page address here.
