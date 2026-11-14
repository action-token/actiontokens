# 52 · One organized S3 bucket, moved to the new AWS account

Status: **done 2026-11-14/15.** All 1,545 files copied to `bandcoin` (16.07 GB, sizes checked), testnet
(13 links) and mainnet (56 links) databases rewritten, new uploads use the folder layout
(`packages/storage/src/key-layout.ts`). The one-off plan, copy and rewrite scripts were run and then deleted, not committed;
the steps below describe what they did.
The old bucket `bandcoin-object-store` is untouched: keep it read-only for 30 days, then delete it and rotate
every key that was pasted into chat.

## Decided

- **One bucket** for mainnet and testnet: `bandcoin` (us-west-2), new AWS account. The old one is
  `bandcoin-object-store` (us-east-1) and stays untouched and read-only as the fallback.
- **Layout:** `<network>/<owner>/<kind>/<id>.<ext>`, e.g. `mainnet/artists/<artistId>/images/<id>.png`,
  `testnet/users/<userId>/avatars/<id>.jpg`. `network` is `mainnet` or `testnet`.
- **URLs stay S3 style** (`https://bandcoin.s3.us-west-2.amazonaws.com/<key>`), one database rewrite.
- All 8 local env files already point at the new bucket (`apps/*/.env.local`, `.env.production`).
  **Production host settings must stay on the old bucket until the copy and rewrite are done.**

## Inventory of `bandcoin-object-store` (2026-11-14, read only)

1,537 objects, 16.06 GB, all STANDARD class. By how the key looks and which database points at it:

| Key shape | Mainnet DB | Testnet DB | Neither |
|---|---:|---:|---:|
| 64-hex random key | 10 | 8 | 905 (9.1 GB) |
| flat name (`<hex><filename>`) | 39 | 0 | 435 (6.0 GB) |
| `generated-images/` | 1 | 0 | 24 |
| `stream/` (worker output) | see below | 0 | 110 (0.65 GB) |
| `fb-import/` | 0 | 0 | 5 |

- Mainnet DB (`ep-soft-term`) holds bucket URLs in 12 columns: `activity_logs.input`,
  `albums.coverUrl`, `artists.avatarUrl/coverUrl`, `generations.outputs`, `item_media.sourceUrl`,
  `items.coverUrl`, `locked_contents.url`, `pins.imageUrl`, `post_media.url`, `stories.url`,
  `users.avatarUrl`. Testnet DB (`ep-red-sea`) holds them in 5: `activity_logs.input`,
  `artists.avatarUrl/coverUrl`, `items.coverUrl`, `stories.url`.
- **Keys stored without a URL** (mainnet only): `item_media.streamKey`, `previewKey`, `waveformKey`
  (`stream/…`). These must be rewritten by key, not by URL. Testnet has none.
- **4 mainnet URLs point at files that are not in the bucket** (already broken today). They are listed
  in the dry-run report and left as they are.
- **"Neither" is not "unused".** The 159 old links in `docs/plans/19-production-data-copy.md` come from the
  old bandfan layout; the backup database `ep-steep` (`public`) and `old-bandcoin` may reference many of
  the 1,479 unreferenced objects. They are copied under `_unreferenced/`, never deleted.
- Object dates run 2024-12 to 2026-11; 24 objects are from this month.

## New key layout

| Source | New key |
|---|---|
| `artists.avatarUrl` / `coverUrl` | `<net>/artists/<artistId>/images/<hex>.<ext>` |
| `users.avatarUrl` | `<net>/users/<userId>/avatars/<hex>.<ext>` |
| `items.coverUrl`, `albums.coverUrl` | `<net>/artists/<artistId>/items/<itemId>/cover-<hex>.<ext>` |
| `item_media.*` (source, stream, preview, waveform) | `<net>/artists/<artistId>/items/<itemId>/media/<name>` |
| `locked_contents.url` | `<net>/artists/<artistId>/locked/<hex>.<ext>` |
| `pins.imageUrl` | `<net>/artists/<artistId>/pins/<pinId>/<hex>.<ext>` |
| `post_media.url`, `stories.url` | `<net>/artists/<artistId>/posts/<hex>.<ext>` |
| `murals/…` | `<net>/murals/<sessionId>/…` |
| `generated-images/…`, `generations.outputs` | `<net>/artists/<artistId>/generated/…` |
| anything no database points at | `_unreferenced/<old key>` (keeps the old key so it can be found) |

An object referenced by both databases is copied to both `mainnet/` and `testnet/` paths.
Extension comes from the stored content type, or the original name after the hex prefix for flat keys.

## Steps

1. **Code:** one key-layout function in `packages/storage` (`objectKey({ network, owner, kind, id, ext })`);
   `presignUpload`, `uploadBufferToS3`, `putMediaFile` and mural signing call it. The network comes from the
   app's chain setting. Include the region in `publicS3Url` (new bucket is not us-east-1).
2. **Bucket setup (new account): already matches the old bucket** (checked read-only 2026-11-14):
   public-read `GetObject` policy, CORS (GET/PUT/POST/DELETE from any origin, any header), public access
   block off, ObjectOwnership BucketOwnerEnforced, AES256 encryption, no versioning or lifecycle, empty.
   Nothing to apply. The old bucket's public-read policy already lets the new account's key read the
   objects, so the copy can use `CopyObject` (fall back to download and upload if S3 refuses).
3. **Dry run script** (`packages/storage/scripts/migrate-bucket/`): lists the old bucket, reads both
   databases read-only, writes a manifest (`old key → new key, network, source column`) and a report. No writes.
4. **Copy** with S3 `CopyObject` between accounts (or `sync`), from the manifest, resumable; verify size and
   ETag/checksum for every object.
5. **Rewrite** every URL and key column in one transaction per database, rehearsed first on a copy
   (a Neon branch), as the data cutover was. Same for `item_media.*Key`.
6. **Switch** production host env to the new bucket, then smoke-test: avatar upload, audio playback, pin
   image, mural scan, worker stream output.
7. **Fallback and cleanup:** keep the old bucket read-only for 30 days; then rotate and delete every key
   that was pasted into chat (4 S3 keys, 2 database passwords).

## Open items

- Include the `ep-steep` backup (and `old-bandcoin`) in the reference scan before any file is called unused?
  Needs a read-only connection string.
- The `stream/<n>/<hash>/` files: `<n>` looks like an id; confirm what it is before mapping to items.
- Whether to drop `_unreferenced/` files after review (9.1 GB + 6.0 GB of them).
