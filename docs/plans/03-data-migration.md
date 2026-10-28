# 03 · Data migration (old dev DB → new dev DB)

- **Source:** `old-bandcoin` dev DB, opened **read-only** (`default_transaction_read_only=on`).
- **Target:** the new Neon dev DB. Its URL lives only in `packages/db/.env` (git-ignored).
- **Production:** not touched. Cutover is a separate plan with its own approval (phase 9).

## How

`packages/db/scripts/migrate-legacy/`, one file per domain, run in dependency order:

```
01-users → 02-artists → 03-chain-accounts → 04-items → 05-listings → 06-orders-ownership
→ 07-music → 08-social → 09-pins → 10-bounties → 11-studio → 12-settings
```

- An id map table (`legacy_id_map`: oldTable, oldId, newId) makes the script re-runnable and lets every later step find new foreign keys. Wallet-key user ids become cuids here.
- Money `Float` values become `Decimal` with 7 decimal places (the Stellar precision).
- Secrets are re-encrypted with the new key on the way in.
- `--dry-run` prints counts per table and every row that can't be mapped (orphans, broken references), without writing anything.

## Checks after a run

- Row counts old vs new per domain.
- Every `Ownership` row is re-checked against Horizon balances for a sample of users.
- Each artist's token, items, followers, and pins match.
- Report written to `docs/migration-report.md` for you to review.
