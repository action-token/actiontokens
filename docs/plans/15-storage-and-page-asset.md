# 15 — Storage account and page asset (fan token) in use

Every artist gets a storage account holding their fan token supply, and the
app uses those tokens. Prices stay as they are (ACTION, XLM, USDC, card from
the artist's two prices): no extra token prices, no new platform trustlines.
Same contracts, no contract change.

## Decisions (asked 2026-10-31)

| Topic                        | Decision                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Who pays for storage         | **The platform**, at approval (≈1.5 XLM: account + fan-token trustline). The artist still pays only the 1.5 XLM issuer setup when applying. |
| Starting supply              | **A fixed amount** for every artist (1,000,000), issued into storage at approval. Kept in admin settings so it can change.                  |
| Storage used by              | Bounty prizes (wallet + storage, page asset shown), Sell Page Assets, **gifts from storage**, **pin rewards**, **a balances page**.         |
| Artists approved before this | **Open it from the portal**: "Open your storage account"; the platform pays, as at approval.                                                |

## 1. Storage at approval

- On Approve, after the fan token is made: one transaction from the treasury
  (mother) creates the storage account (starting balance for the account +
  one trustline), storage trusts the fan token, the issuer pays the fixed
  supply into storage. Like main's `creator-aproval.ts`, which did the same.
- The storage key is generated and kept encrypted like the issuer's; the
  artist never handles it. `Artist.storageAccountId` is set once it's on the
  network.
- An existing fan token from elsewhere (EXISTING mode): storage is opened and
  trusts it, but nothing is issued (we can't issue someone else's token).
- Approval never fails because of this: if the transaction fails, the artist
  sees "Open your storage account" in the portal (same as older artists).
- Logged in the activity log; cost shown to the admin before Approve.

## 2. Older artists

Portal banner and a Settings row: "Open your storage account". Same
transaction, platform pays, done once (idempotent).

## 3. Balances page

`/balances` in the portal: what the wallet and the storage account hold
(fan token, ACTION, XLM, USDC, other tokens), with links to the explorer.
Move tokens between wallet and storage (wallet → storage the artist signs;
storage → wallet the platform signs for storage), price breakdown first,
custodial 5 s countdown.

## 4. Bounties

The prize list shows wallet and storage holdings together, grouped "Wallet"
and "Storage", with the fan token (page asset) first. Picking one sets the
funding source. One prize token per bounty, as now.

## 5. Gifts from storage (main's token gift, decided 2026-10-31)

- Followers only (the free follow), like main's check.
- The fan token is sent from storage (the platform signs for storage), not
  newly issued, so the supply stays what was issued.
- A fan with a trustline gets it straight away. Without one, storage creates
  a claimable balance for them (like main), claimable by the fan and by
  storage (so it can come back). It locks 1 XLM (0.5 per claimant), paid by
  the artist and shown in the breakdown before they confirm. The fan claims
  it on their wallet page; opening their trustline is their own 0.5 XLM.
- The artist can take back an unclaimed gift: plan 34 (built 2026-11-13).
- No "Become a member" button: membership stays "you hold enough tokens".
- Falls back to issuing only if the artist has no storage.

## 6. Pin rewards

A pin can give an amount of the fan token per collect, paid from storage when
the fan claims (the existing two-step collect/claim). The pin form shows what
storage holds; claims stop with a plain message when storage runs out.

## Order of work

1 → 2 → 3 → 4 → 5 → 6, then back to plan 14 step 3 (Non Stellar Items).
Each step: tests first, Safari check, every mutation logged, committed
separately.

## Risks

- **Platform cost:** ≈1.5 XLM per approval from the treasury; the admin sees
  it, and approval shows a plain message if the treasury is short.
- **Keys:** the storage secret is encrypted with the same key as issuers.
- **Pin rewards and gifts move real tokens from storage:** server-side checks
  on amount and balance, never trusting the client.
