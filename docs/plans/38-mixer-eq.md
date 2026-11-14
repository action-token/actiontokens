# 38 · Studio extras 1: mixer EQ

**Status: built 2026-11-13 (not committed).**

First of four Studio extras bandfan had and bandcoin doesn't (the others: more live-music controls,
your usage numbers, admin Studio totals; each gets its own plan).

## How bandfan did it (read 2026-11-13)

`components/module/studio/components/AdaptiveMixer.tsx` and `hooks/useAudio.ts`: one EQ on the whole
mix. Three sliders from −12 to +12 dB and a Reset button:

| Band | Filter              |
| ---- | ------------------- |
| LOW  | Low shelf at 100 Hz |
| MID  | Peak at 1 kHz, Q 1  |
| HIGH | High shelf at 8 kHz |

It was heard while playing and applied to the exported file. It wasn't saved (bandfan's mixer had
no saved projects).

## Bandcoin today

The mixer (`apps/studio/src/features/mixer`) has tracks with volume, pan, mute and solo, a master
volume in the top bar, undo, saved projects, Export WAV and Publish (the mix plus one stem per
track). No EQ anywhere.

## Decisions (your answers, 2026-11-13)

| Question | Answer                                                              |
| -------- | ------------------------------------------------------------------- |
| Scope    | The whole mix **and** each track                                    |
| Saved    | With the project (comes back on reopen, can be undone)              |
| Place    | An "EQ" button that opens a small pop-up with the sliders and Reset |

## What gets built

Same three bands and range as bandfan, for the master and for every track.

### Model (`mix.ts`)

- `MixEq = { low, mid, high }` in dB, each −12 to 12. `MixProject.masterEq` and `MixTrack.eq`, both
  optional: a project saved before this opens flat, with no format change (still version 2).
- Helpers: `FLAT_EQ`, `isFlat`, and the three band definitions in one place.

### Sound (`engine.ts`)

- A track's sound goes: clip fades → **track EQ** → volume → pan → master. The master goes: **master
  EQ** → master volume → out. Flat bands add no filters, so a project without EQ sounds exactly as
  it does today.
- Moving a slider while playing changes the sound at once, like the master volume does.
- Export WAV and the published mix include both EQs.
- **Stems:** a published stem includes its own track's EQ, but not the master EQ, the same way
  stems already leave out the master volume.

### Screen

- Top bar (`transport.tsx`): an "EQ" button beside the master volume. It opens a pop-up with LOW,
  MID and HIGH sliders, each showing its value ("+3 dB"), and Reset. The button is highlighted when
  the EQ isn't flat. Double-clicking a slider sets it to 0, as pan does.
- Each track's controls (`timeline.tsx`): the same "EQ" button and pop-up for that track.
- One shared `eq-popover.tsx` for both.
- Changes go through the mixer's normal change path, so they save with the project and undo works
  (one undo step per slider drag, as for volume).

### API (`packages/api`)

- The project save check (`routers/studio/projects.ts`) accepts the optional `eq` and `masterEq`,
  each band limited to −12…12.

## Tests

- `mix.test.ts`: flat by default; an older project opens flat; `isFlat`.
- `engine.test.ts`: the filter chain for a track and the master, none when flat, and stems without
  the master EQ.
- API: a project with EQ saves; a band out of range is refused.
- `pnpm typecheck && pnpm lint && pnpm test`.

## Not in this plan

- More bands, changing the frequencies, or EQ on single clips.

## Built (2026-11-13)

- `mix.ts`: `MixEq`, `EQ_BANDS`, `FLAT_EQ`, `isFlat`, `clampEq`; optional `MixTrack.eq` and
  `MixProject.masterEq`.
- `engine.ts`: `equalize`, `setMasterEq`, `setTrackEq`; `play` and `exportWav` take
  `{ volume, eq }` for the master. Exports add a filter only for a band that isn't 0. While playing,
  all three filters are always in the chain at their value (0 dB changes nothing), so a slider can
  move them without restarting.
- `eq-popover.tsx`, used in `transport.tsx` (the mix) and `timeline.tsx` (each track).
- API: `routers/studio/projects.ts` accepts optional `eq` and `masterEq`, each band −12…12.
- Tests: 5 in `engine.test.ts`, 2 in `mix.test.ts`, 2 in `studio-projects.test.ts`.
- Not listened to in a browser.
