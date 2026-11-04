# 22 · Feed like Wadzzo, plus stories

Status: **approved 2026-11-05, in progress** (Phase A, then stories).

## What you asked for

The feed page is too plain. Make it work like Wadzzo's, public for anyone, with a creators row, a
story section, upcoming events and more. Locked posts show as locked to anyone who isn't eligible.

## Decided (your answers)

- **Public**: anyone can open `/feed` without signing in. Tabs **For you** (every artist's posts) and
  **Following** (needs sign-in).
- **Locked posts**: shown as a card with the title and a lock (and what unlocks it); the body and
  media stay hidden until the viewer is eligible. This already works in `PostCard`; the public feed
  just reuses it (the feed code already accepts a signed-out viewer).
- **Sections**: Artists to follow, Upcoming events, a creators row on top, New music.
- **Stories**: real 24-hour stories (new feature, see below).
- **Layout**: posts in the middle (about 640px), a right column on desktop with Upcoming events and
  Artists to follow, like Wadzzo; New music sits in the same column. One column on a phone.

## What exists today

- `post.feed` is signed-in only and only returns artists you follow (`feedPage`).
- `toCards` already takes a viewer that can be `null` and returns the lock for posts the viewer can't open.
- Events are public data (`Event`), but only shown on an artist's page; there is no list across artists.
- There is no story model anywhere (Wadzzo has none either).

## Phase A: the public feed (no new tables)

1. **Backend, tests first**
   - `post.feed` becomes public with `scope: "all" | "following"` (following still needs a session) and
     keeps the same page size and cursor. Ordering: newest first. Hidden/import-only posts stay out.
   - `artist.suggested` (public): approved artists by followers, with a follow flag when signed in.
   - `event.upcoming` (public): next events across artists (starts in the future, soonest first).
   - New music reuses `music.tracks` (newest).
2. **Frontend (app)**: `FeedView` gets the tabs, the creators row, and the right column; the composer
   stays for artists. Locked posts show as today.
3. Browser check in Chrome: signed out, signed in, a locked post.

## Phase B: stories (new)

**Data**: `Story` (artist, IMAGE or VIDEO, url, thumbnail, caption, audience + tier like posts,
`expiresAt` = created + 24h) and `StoryView` (story, user, when) so the ring turns grey once seen.
A migration written by hand, applied to dev only.

**Backend (tests first)**
- Artist: create (limit per artist), list mine, remove.
- Fan: the ring row (artists with a live story: followed first, unseen first), one artist's live
  stories (locked ones come back as a lock, no media), mark viewed.
- Worker job `stories.sweep`: deletes expired stories and their files after a day's grace.
- Admin can take a story down (same as other content).

**Frontend**
- Artist portal: a "Stories" page (add a photo or short clip with a caption, who can see it, see the
  live ones, remove).
- Fan app: the ring row at the top of the feed and a full-screen viewer (tap or swipe through, progress
  bars, a lock screen for stories you can't open, link to the artist).

**One row, not two**: the creators row and the story rings are the same row. An artist with a live
story has a ring; the others follow it as plain avatars, so there is one place to browse artists.

## Order of work

A first (small, visible, no migration), then B in this order: data and backend, artist portal page,
fan viewer. Each step is committed with its checks and a browser look.

## Not in scope

Likes or comments on stories, story replies, reposting, and a story composer in the fan app.

## Story decisions (your answers)

- Content: one photo or a short video (up to 30 seconds) plus an optional caption.
- Audience: the same choices as posts (everyone, followers, or a members tier); a viewer who isn't
  eligible sees a lock screen, never the media.
- Rules: live at once with no review, admins can take one down; up to 10 live stories per artist;
  artists see how many people viewed each story (a count, not names).
- Order: build everything in sequence without stopping in between.
