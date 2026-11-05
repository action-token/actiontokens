# 27 — Wallet like Wadzzo's, with Send and Swap

Both wallet pages (marketplace `/wallet`, artist portal `/wallet`) get the
layout of Wadzzo's marketplace wallet, and two new money actions: **Send** and
a two-way **Swap**.

## Decisions (2026-11-05)

- **Pages:** both, from shared pieces in `packages/ui`.
- **Layout:** a big brand-colour balance block (BANDCOIN big, the address chip,
  the action buttons), then **Assets** (every token, each with Send) on the
  left, an **XLM** card (spendable / reserved) and **Pending gifts** on the
  right, then **History**. Owned songs and items stay on My collection (link).
- **Send:** any classic token in the main wallet (XLM, BANDCOIN, USDC, fan
  tokens, item tokens), to a **Stellar address or a Bandcoin @username**. A
  recipient who can't hold the token yet gets it **as a gift to claim**; the
  sender pays the reserve it locks. The platform never pays.
- **Swap:** **any amount, both ways**: BANDCOIN → XLM and XLM → BANDCOIN, with
  the platform treasury (mother account) at the live price with the 2%
  cushion. Replaces the fixed "BANDCOIN for 1 XLM" on the Recharge page too.

## Send

`services/wallet/send.ts`, shaped like `storage-deposit.ts` (quote → start →
submit, an `Order` so history, reconcile and the custodial countdown work
unchanged).

- **Recipient:** `G…` (valid key) or `@username` → that user's wallet. Not
  yourself. Unknown username or address: a clear message.
- **What happens on chain** (`buildTransfer`, extended):
  - recipient holds the token (or it's XLM to an existing account): payment;
  - recipient can't hold it (no trustline, or no account yet): claimable
    balance for them (the sender can take it back until it's claimed). It
    locks 1 XLM of the sender's reserve (two claimants × 0.5 XLM);
  - XLM to an account that doesn't exist: `createAccount`, at least 1 XLM,
    otherwise refused ("That account needs at least 1 XLM to open").
- **Checks before signing:** the amount is above zero and within what the
  wallet holds (XLM: spendable after reserves, the fee and any gift reserve);
  the sender's account exists.
- **Order:** new `OrderKind.SEND`, `currency: XLM` (what it costs: fee plus any
  reserve), the token, amount, recipient and mode in `breakdown.sendDetails`.
  Finished with `finishPlain`. No retries.
- **Pending gifts:** `listGifts` shows every claimable balance waiting for the
  fan, not only artist item gifts (BANDCOIN, USDC, fan tokens, other tokens),
  with who sent it.

## Swap

`quoteSwap` (pure, `@bandcoin/chain`) and `buildSwap`:

- **BANDCOIN → XLM:** pay N BANDCOIN, receive XLM = N × price × (1 − 2%),
  rounded down.
- **XLM → BANDCOIN:** pay N XLM (spendable), receive BANDCOIN = N × price ×
  (1 − 2%), rounded down; opens the BANDCOIN line first when needed (0.5 XLM).
- Both: one transaction, the fan pays the network fee, the treasury co-signs.
  Refused when the price can't be loaded, the fan is short, or the treasury
  can't cover what it sends ("Swap isn't available right now").
- **Orders:** `XLM_SWAP` (BANDCOIN → XLM) and new `BANDCOIN_SWAP` (XLM →
  BANDCOIN). The amounts go in the breakdown; history says "Swapped 40
  BANDCOIN for 0.27 XLM".
- Price follows the BANDCOIN rule: fixed on testnet, Stellar market on
  mainnet, no fallback.

## Database

One migration: `OrderKind` gains `SEND` and `BANDCOIN_SWAP`. No new tables.

## API

App and artist routers get `wallet.send.{quote,start,submit,cancel}` and
`wallet.swap.{quote,start,submit,cancel}`; `submit`/`cancel` refuse any order
that isn't the viewer's order of that kind (as AR's subscribe router does).
`wallet.assets` lists the main wallet's holdings with names (shared with the
artist's `walletContents`).

## Screens

Shared in `packages/ui`: the balance block, the action buttons, the Assets
list and the XLM card. Each app adds its dialogs (Send, Swap, Receive) using
its own signing hook (custodial countdown + Cancel, or wallet signing) and the
transaction toast.

- **Marketplace:** block (Recharge, Send, Swap, Receive), Assets | XLM +
  Pending gifts, History, link to My collection; activation card when the
  wallet isn't on Stellar yet.
- **Artist portal:** the same block for the main wallet, the Creator storage
  card beside XLM, then Recharge (card top-up) as today.

## Tests (first)

- `quoteSwap`: both directions, the 2% cushion, rounding, short funds,
  treasury short, no price.
- Send service: address vs @username, self refused, payment vs gift vs create,
  under 1 XLM to a new account refused, over-balance refused, the reserve in
  the cost, the order's details.
- Routers: send/swap submit and cancel refuse other kinds and other people's
  orders.
- `listGifts`: shows non-item tokens.

## Risks

- Real money: a wrong amount or recipient can't be undone, so the dialog shows
  the recipient (username and address) and the exact amounts before Confirm.
- The treasury must hold XLM and BANDCOIN for swaps both ways.

## Browser check (2026-11-05, dev, testnet)

- Marketplace and portal `/wallet`: the balance block (25B BANDCOIN), Assets
  with Send per token, the XLM card, Pending gifts (a waiting 50,000 BANDCOIN
  from @fyronalis shows), History; the portal adds Creator storage and
  Recharge. Dark (chartreuse block) and light (ink block) both checked.
- Swap quote: 100 BANDCOIN → 1.3516998 XLM (1.3792856 at today's price, less
  the 2% cushion, 0.00002 fee).
- Send quote: `@nobodyhere` → "There's no Bandcoin user called @nobodyhere.";
  your own username → "That's your own wallet."; 0.5 XLM to a new address →
  "That account needs at least 1 XLM to open."; 2 XLM → "This address isn't on
  Stellar yet: your XLM opens it", 2.00001 XLM in all.
- Not signed: a real Send or Swap needs Albedo approval from the account owner.
