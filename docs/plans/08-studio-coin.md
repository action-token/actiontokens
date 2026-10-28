# 08 · Studio coin

A real Stellar asset (code to be decided, e.g. `STUDIO`), issued by a platform issuer account. There's a platform **studio treasury** account.

## Top-up deposit (your choice)

1. **Get coins:** swap Bandcoin → STUDIO (the platform sells at the admin-set price), pay with USDC/XLM, pay by card (Square, coins sent to the custodial wallet), or buy on the Stellar DEX.
2. **Deposit:** one payment from the artist's wallet → treasury, memo = deposit id. It goes through the same `useTransaction` flow and cancel toast as any other payment.
3. The worker (or the confirm call) verifies the payment on Horizon, then writes `StudioLedgerEntry(kind: DEPOSIT, txHash)` and increases `StudioBalance`.
4. **Spend:** each generation reserves its price first (`SPEND`, pending), then commits it when the job succeeds. If the job fails, a `REFUND` entry is written automatically. No signing, so it's instant.
5. **Withdraw:** the artist asks for any unused balance, and the treasury pays it back on-chain (`WITHDRAW`, txHash).

Balance = sum of ledger entries. `StudioBalance` is a cached total kept in the same database transaction, and a nightly check compares it with the ledger.

## Pricing

`AppSetting.studioPrices`: a cost per generation type (text per 1k tokens, image per image, music per 30 s, video per 5 s). It's shown on every Generate button before you run it. Admin can edit it.

## To decide later

The asset code, the issuer and treasury accounts, the supply, whether to list it on the DEX at launch, and how existing DB credits (`CreditBalance`) carry over (suggestion: converted 1:1 into deposited balance).
