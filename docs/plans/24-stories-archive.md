# 24 · Story archive, story notifications and editing

Status: **plan, waiting for approval** (2026-11-05). Nothing built.

## What you asked for

1. Followers get a bell notification when an artist shares a story.
2. An artist can edit a story.
3. An artist's page shows **every story they have ever shared**, not only the live 24 hours.

## Decided (your answers)

- **Where**: a **Highlights row** on the artist page (a horizontal row of past stories), under the header. The live ring stays as it is.
- **Who can watch an old story**: the same rule it had when shared. A Subscribers story stays Subscribers-only, a Members story stays Members-only; others see a locked thumbnail with the same prompt as today. The artist can change the audience later (edit).
- **Notifications**: one per artist per day, to who can watch it. The first story of the day notifies; more stories that day add nothing. A story limited to subscribers or members only notifies them.
- **Edit**: the caption, who can watch, and deleting one story, on live and archived stories. The photo or clip itself can't be swapped.
- Not chosen, so not built: deleting expired story files. Files stay in storage.

## Found while planning (read this first)

- **The live worker deletes ended stories.** `stories.sweep` (`services/feed/stories.ts`, `sweepStories`) deletes a story's row a day after it ends. The worker is live in production, so it is doing this daily. Keeping stories forever means the sweep must stop deleting ended stories, and that change must reach the production worker **before more stories expire**. Stories the sweep has already deleted cannot be brought back (their files may still be in storage, but nothing points to them). The archive starts from whatever is left.
- A story the artist deletes is kept as a hidden row (`removedAt`) like today; the sweep clears those a day later. Their files are not deleted (no delete exists in storage).
- Storage cost grows with every story kept. Nothing prunes files.

## What exists today

- `Story` has `expiresAt` (created + 24 h), `removedAt`, `audience` (EVERYONE, FOLLOWERS, SUBSCRIBERS, MEMBERS), `tierId`, `caption`.
- `story.artist(slug)` (`artistStories`) returns only live stories with locks; the ring and the viewer read it.
- Portal `stories.createStory`, `removeStory`, `stories` (my live stories). No edit.
- `notifyFollowers` (`services/notifications/send.ts`) sends to all followers; used for posts, items and bounties. No story type.
- `Follow.isTemporary = false` marks a subscriber (a trustline to the fan token), kept in step with the wallet by `follows.sync`.

## Phase A: keep the stories and show them (backend, tests first)

1. `sweepStories` stops deleting ended stories. It only clears stories taken down more than a day ago.
2. New public `story.archive({ slug, cursor })` (`services/feed/stories.ts`): the artist's ended, not-removed stories, newest first, 24 per page. Same lock rules as `artistStories` (`locksFor`), so a locked story has no picture or words. Live stories are not repeated here.
3. Tests: the sweep keeps an ended story and still clears a removed one; the archive hides removed and live stories, locks a Subscribers story from a non-subscriber and opens it for a subscriber, pages by cursor, and 404s an unapproved artist.

## Phase B: the Highlights row (fan app)

1. `apps/app/src/features/artist-page/artist-highlights.tsx`: a horizontal row under the header with a thumbnail, the date, and a lock for stories the viewer can't open. Hidden when the artist has none. Loads more as you scroll sideways.
2. Tapping one opens the existing story viewer (`features/feed/story-viewer.tsx`) in archive mode: it steps through the highlights newest to oldest, no "seen" ring, and no view is recorded on archived stories.
3. Browser check: an artist with live and ended stories, a locked one, signed out and signed in.

## Phase C: notifications

1. New `NotificationType` value `STORY` (migration, applied like the subscribers one). Text: "X shared a story", linking to the artist page.
2. On `createStory`: work out who can watch it (EVERYONE or FOLLOWERS: all followers; SUBSCRIBERS or MEMBERS: followers whose saved flag says subscriber), drop anyone who already got a STORY notification from this artist in the last 24 hours, and notify the rest. Best effort, like the others: a failed notification never undoes the story.
3. A Members story notifies subscribers (the saved flag), not the exact members, because deciding members needs each fan's live wallet. The lock still decides who can open it.
4. Tests: first story notifies, a second the same day does not, a Subscribers story skips plain followers, someone who got one 25 hours ago is told again.

## Phase D: editing (artist portal)

1. `stories.updateStory({ storyId, caption?, audience?, tierId? })` and `stories.deleteStory` (the existing remove, now also for archived stories). Caption up to 200 characters; MEMBERS needs a tier of the artist's, as in `createStory`.
2. The stories page lists live and ended stories with Edit and Delete; Edit opens a small dialog with the caption and the audience picker (the same four choices).
3. Tests: only the artist's own story can be changed, the audience rules match create, delete hides it from the ring and the archive.
4. Browser check in the portal.

## Order

A, B together (the archive is useless without the row), then C, then D. Each ends with typecheck, lint, tests and a browser check.

## Needs from you

- Approval of this plan.
- A deploy of the **worker** with the sweep change soon after Phase A, so no more ended stories are deleted. I won't push or deploy unless you ask.
