# 48 · Shared theme

**Status: built 2026-11-13. No migration.**

Seventh of the map and AR upgrades that follow wadzzo. Queue after: 49 AR marketplace tab, 50 phone
bottom tab bar. **No High contrast theme for now** (your call, 2026-11-13): light, dark and system only.

## How wadzzo did it (read 2026-11-13, commit `1a4d7eb9`, `shared-theme.ts`)

One theme choice for every site in a browser, the way the login is shared: a cookie on the parent
domain that every subdomain reads. Each app still keeps its own copy in localStorage where its theme
code reads it; the cookie keeps those copies in step:

- On load, an inline script in `<head>` copies the cookie into the app's own storage key before its
  theme code runs, so the first paint is already right.
- On change, the app writes the cookie.
- When a tab comes back into view, it re-reads the cookie, so a site left open picks up a change made
  on another one (cookies fire no change events across sites).
- The cookie is not httpOnly (page code reads and writes it) and holds nothing private. On localhost
  cookies ignore the port, so apps on different ports share it; a browser that refuses the parent
  domain (a preview host) falls back to the current host.

## Action Tokens today

The fan app, artist portal and Studio use `next-themes` (attribute `data-theme`, values light, dark,
system, storage key `theme`). AR has its own theme code (storage key `actiontokens-ar-theme`; light, dark,
auto; a boot script sets `.dark` and `data-theme`). The sites are www, app, artist and Studio under
`action-tokens.io`. Nothing is shared: each remembers its own choice.

## Decisions (your answers, 2026-11-13)

| Question | Answer                                                  |
| -------- | ------------------------------------------------------- |
| Apps     | All four: AR, the fan app, the artist portal and Studio |
| Contrast | Not now; light, dark and system only                    |

## What gets built (no API or database change)

- `packages/ui/src/lib/shared-theme.ts`: `SharedTheme` = `light | dark | system`, the cookie
  `actiontokens-theme` (a year, `samesite=lax`, `secure` on https, parent domain with a fallback),
  `readSharedTheme`, `writeSharedTheme`, `onTabReturn`, `sharedThemeSeedScript(storageKey, rename)`.
- `packages/ui/src/patterns/shared-theme-sync.tsx`: a component for the `next-themes` apps. It writes
  the cookie when the theme changes (once the cookie and the stored choice disagree, the cookie wins on
  load) and re-reads it when the tab returns.
- Fan app, artist portal, Studio: the seed script in the root layout's `<head>` (storage key `theme`,
  `system` stays `system`), and `<SharedThemeSync />` inside each app's `ThemeProvider`.
- AR: the seed script before its boot script (`actiontokens-ar-theme`, `system` becomes `auto`);
  `theme.ts` writes the cookie when the preference changes and a `useSharedThemeSync` re-reads it on tab
  return and when the page loads with an older device that only had a local choice; mounted once in
  the root layout.

## Tests

- `shared-theme`: the cookie value check, the parent domain for each host shape (`www.action-tokens.io`,
  `localhost`, an IP, `x.vercel.app` falls back), read/write against a fake `document`/`location`, no
  write when unchanged, `sharedThemeSeedScript` output (renames, ignores an unknown value).
- AR theme: `system` maps to `auto` and back; a changed cookie on tab return updates the preference.
- `pnpm typecheck && pnpm lint && pnpm test`.

## Not in this plan

- High contrast; custom domains (an artist's own domain keeps its own choice: a cookie can't cross
  domains); the app's theme toggles themselves (unchanged).

## Built (2026-11-13)

- `packages/ui`: `lib/shared-theme.ts` (cookie `actiontokens-theme`, light/dark/system, parent domain with
  a fallback, seed script), `patterns/shared-theme-sync.tsx` (for the `next-themes` apps); the package
  now has a test runner and node types. Tests: `shared-theme.test.ts` (10).
- Fan app, artist portal, Studio: the seed script in each root layout's head and `<SharedThemeSync />`
  inside each `ThemeProvider`.
- AR: the seed script before its boot script (`system` becomes `auto`), `theme.ts` writes the cookie
  on every change and `useSharedThemeSync` (mounted in the shell layout) re-reads it on tab return and
  adopts a device's local choice once; `shared-theme.test.ts` for the mapping.
- Not tried across real subdomains: it needs the sites on `*.action-tokens.io` over https to see the
  cookie shared; on localhost it works across ports.
