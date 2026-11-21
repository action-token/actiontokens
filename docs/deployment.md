# Deployment (Vercel)

The three web apps deploy to Vercel, one **project per app per environment**. The worker runs on a server
(see [architecture.md](architecture.md#deploys)).

| App          | Folder     | Development project    | Production project (later) | Production domain       |
| ------------ | ---------- | ---------------------- | -------------------------- | ----------------------- |
| AR collector | `apps/ar`  | `actiontokens-ar-dev`  | `actiontokens-ar`          | `ar.action-tokens.com`  |
| Fan app      | `apps/app` | `actiontokens-app-dev` | `actiontokens-app`         | `app.action-tokens.com` |
| Org portal   | `apps/org` | `actiontokens-org-dev` | `actiontokens-org`         | `org.action-tokens.com` |

"Development" projects use **testnet** and the **development database**. Production projects use mainnet and
the production database, and are created only when we go live. Keep the two sets separate: never put a
production key in a development project, or the other way round.

Team: `action's projects` (`actions-projects-1ed41ec1`).

## How each project is set up

| Setting             | Value                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Root directory      | the app folder (`apps/ar`, `apps/app`, `apps/org`)                                                             |
| Framework           | Next.js                                                                                                        |
| Node.js             | 22.x                                                                                                           |
| Install             | `pnpm install --frozen-lockfile` (from each app's `vercel.json`)                                               |
| Build               | `pnpm run build` (from `vercel.json`); not `turbo run build`, whose strict env mode hides the Vercel variables |
| Functions           | region `iad1` (US East), next to the Neon database in `us-east-1`                                              |
| Source outside root | included (the apps import `packages/*`)                                                                        |

Each app has its own [`vercel.json`](../apps/ar/vercel.json). [`.vercelignore`](../.vercelignore) keeps
`.env` files, `.local/`, build output and heavy docs out of CLI uploads.

## Create a project (once per app)

```bash
vercel project create actiontokens-org-dev --scope actions-projects-1ed41ec1
vercel project update actiontokens-org-dev --scope actions-projects-1ed41ec1 \
  --root-directory apps/org --framework nextjs --node-version 22.x --yes
```

## Environment variables

Load them from the app's env file with [`scripts/vercel/push-env.mjs`](../scripts/vercel/push-env.mjs). It never
prints a value, stores secrets as **Sensitive**, and skips empty ones. Always dry-run first.

```bash
# Secrets you do not want in a file: export, then pass the variable's name.
export VERCEL_DATABASE_URL='postgresql://…'        # the DEVELOPMENT database, pooled endpoint

URL=https://actiontokens-ar-dev.vercel.app
node scripts/vercel/push-env.mjs --dry-run \
  --project actiontokens-ar-dev --scope actions-projects-1ed41ec1 \
  --from apps/ar/.env.development.local --targets preview,production \
  --from-env DATABASE_URL=VERCEL_DATABASE_URL --set DATABASE_POOL_MAX=3 \
  --set NEXTAUTH_URL=$URL --set NEXT_PUBLIC_URL=$URL --set NEXT_PUBLIC_AR_URL=$URL \
  --set NEXT_PUBLIC_APP_URL=https://app.action-tokens.com \
  --set ORG_APP_ORIGINS=https://org.action-tokens.com
# looks right? run it again without --dry-run
```

Values that **must differ** from a local file when deployed:

| Variable                                     | Local                    | On Vercel                                       |
| -------------------------------------------- | ------------------------ | ----------------------------------------------- |
| `DATABASE_URL`                               | `127.0.0.1:55432` Docker | the Neon pooled URL (a laptop is not reachable) |
| `DATABASE_POOL_MAX`                          | empty                    | `3` (serverless: many short-lived instances)    |
| `NEXTAUTH_URL`, `NEXT_PUBLIC_URL`            | `http://localhost:300x`  | the project's own URL                           |
| `NEXT_PUBLIC_APP_URL`, `_AR_URL`, `_ORG_URL` | `http://localhost:…`     | the deployed address of each app                |
| `ORG_APP_ORIGINS` (AR)                       | `http://localhost:3001`  | the org portal's address                        |

`NEXT_PUBLIC_*` values are baked into the browser bundle **at build time**: change one, then redeploy.

### What each app needs beyond the common set

Common to all three: database, network and asset (`NEXT_PUBLIC_STELLAR_NETWORK`, `NEXT_PUBLIC_ASSET_*`),
`NEXTAUTH_SECRET`, Firebase (`NEXT_PUBLIC_AUTH_*`, `FIREBASE_ADMIN_*`), chain keys (`MOTHER_SECRET`,
`TREASURY_SECRET`, `PLATFORM_TREASURY`, `CHAIN_ACCOUNT_KEY`, `NFT_CONTRACT`, `ESCROW_CONTRACT`), Square, S3
(`NEXT_AWS_*`), Mapbox, Last.fm and the site title and links.

| App        | Extra variables                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AR         | `ORG_APP_ORIGINS`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_VISION_CREDENTIALS`                                                                                                                     |
| Fan app    | `NEXT_PUBLIC_ORG_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`                                                                                                     |
| Org portal | `SMTP_*`, `MAIL_FROM`, `OPENAI_API_KEY`, `FACEBOOK_*`, `SOCIAL_TOKEN_ENC_KEY`, `DOMAIN_HOST`, and `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID` (custom domains for organizations) |

The exact list for each app is its `.env.example`.

## Deploy

```bash
# IDs of the team and the project (the project ID changes per app)
export VERCEL_ORG_ID=team_…      # vercel teams ls --format json
export VERCEL_PROJECT_ID=prj_…   # vercel project inspect <name> --json

vercel deploy --yes              # preview: a new unique URL, safe to try
vercel deploy --yes --prod       # production target of this project
```

Run these **from the repository root**: the project's root directory (`apps/ar`) is applied on Vercel's side,
and the workspace packages upload with it. Check a deployment with `vercel inspect <url>` and
`vercel logs <url>`.

## Things to know

- **Deployment Protection.** New projects put a Vercel login in front of preview URLs. Turn it off for a
  public test (Project → Settings → Deployment Protection), or share a bypass link.
- **Sign-in domains.** Google and Firebase sign-in only work on domains listed in the Firebase console under
  Authentication → Settings → Authorized domains. Add each deployed address (`*.vercel.app` hosts too).
- **One login across the apps** needs a shared parent domain (`AUTH_COOKIE_DOMAIN=.action-tokens.com`). On
  `*.vercel.app` addresses each app has its own login; that is expected until custom domains are attached.
- **`CHAIN_ACCOUNT_KEY`** must be the key the data was created with, or issuer secrets will not decrypt.
- **Hobby plan** is for non-commercial use and has smaller function limits; move to Pro before going live.
- **Git integration.** Deploys here run from the CLI. To deploy on every push, connect each project to
  `action-token/actiontokens` (Project → Settings → Git) after installing the Vercel GitHub app for the
  organization, and add `npx turbo-ignore` as the Ignored Build Step so an app builds only when it changed.

## Going to production later

1. Create `actiontokens-<app>` projects as above, with the **production** root settings.
2. Fill them from a **production** env file (mainnet network, production database, production keys).
3. Attach the custom domains and set `AUTH_COOKIE_DOMAIN` and the `NEXT_PUBLIC_*_URL` values to them.
4. Add the domains to Firebase's authorized list, then deploy with `--prod`.
