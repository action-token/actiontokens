# 39 · Studio extras 2: more Live Jam controls

**Status: built 2026-11-13 (not committed).**

## How bandfan did it (read 2026-11-13)

`components/module/studio/components/IntelligentAIPanel.tsx` ("Tuning") and `lib/lyria-realtime.ts`
steered Lyria RealTime while it played:

| Control                                    | Range         | Default |
| ------------------------------------------ | ------------- | ------- |
| Tempo                                      | 60–200        | 120     |
| Scale                                      | Auto + 7 keys | Auto    |
| Density                                    | 0–1           | 0.5     |
| Brightness                                 | 0–1           | 0.5     |
| Guidance                                   | 0–6           | 4       |
| Temperature                                | 0–3           | 1.1     |
| Mute drums, Mute bass, Only bass and drums | switches      | off     |

"Only bass and drums" turned both mutes off, and either mute turned it off.

## Bandcoin today

Live Jam (`apps/studio/src/features/live`) has up to four typed ideas with a mix slider each, and
Tempo, Busy-ness (density) and Brightness. The worker's session
(`packages/api/src/services/studio/live-session.ts`) passes only those three to Lyria.

## What Google's documentation says (read 2026-11-13)

- Ranges and defaults match bandfan's. Lyria has 12 keys.
- The whole configuration must be sent every time; anything left out goes back to its default.
- A tempo or key change only takes effect after the context is reset (`resetContext()` in the
  installed SDK, `@google/genai` 2.30): the stream keeps going, with a hard transition.
- Bandcoin doesn't reset today, so its Tempo slider probably does nothing while playing (not tested).

## Decisions (your answers, 2026-11-13)

| Question               | Answer                                                      |
| ---------------------- | ----------------------------------------------------------- |
| Which controls         | All six: Guidance, Temperature, Key, and the three switches |
| Key list               | All 12 keys plus Auto                                       |
| Tempo and key changes  | Reset automatically, with a note that the music jumps       |
| Lyria's "mode" setting | Not added                                                   |

## What gets built

### Server (`packages/api/src/services/studio`)

- `live-session.ts`: the `config` message also carries `guidance` (0–6), `temperature` (0–3),
  `scale` (one of the 12 keys or Auto), `muteBass`, `muteDrums`, `onlyBassAndDrums`. Every value is
  checked and clamped; an unknown key becomes Auto; "only bass and drums" wins over the two mutes.
- The session remembers the last settings it sent. Each `config` sends the whole configuration, and
  when the tempo or the key differs from last time it resets the context right after.
- `lyria.ts`: the `LiveLyria` type gains the new fields and `resetContext()`.
- Billing is untouched: a reset doesn't stop the minute clock.

### Screen (`apps/studio/src/features/live`)

- Under the three sliders: **Guidance** and **Temperature** sliders, a **Key** menu (Auto, then
  "C major / A minor" and the other eleven), and three switches: **Mute drums**, **Mute bass**,
  **Only bass and drums** (switching one on turns the conflicting ones off, as in bandfan).
- A line under Tempo and Key: "Changing the tempo or key restarts the groove: you'll hear a jump."
- Starting values: bandfan's (Guidance 4, Temperature 1.1, Key Auto, switches off). Tempo, Busy-ness
  and Brightness keep today's starting values.
- Same look as the existing sliders; the menu and switches are the shared UI components.

## Tests

- `studio-live-session` tests: the full configuration is sent each time; values are clamped; an
  unknown key becomes Auto; the mute rule; a reset after a tempo or key change and none otherwise.
- `pnpm typecheck && pnpm lint && pnpm test`.

## Not in this plan

- Lyria's mode (Quality / Diversity / Vocalization), seed and top-k.
- Bandfan's instrument, genre and mood chips: bandcoin uses typed ideas with a mix each.

## Built (2026-11-13)

- `lyria.ts`: `LIVE_SCALES`, `LiveMusicConfig`, `resetContext()` on `LiveLyria`.
- `live-session.ts`: `liveConfigOf` checks every setting; the session keeps the last settings, sends
  all of them each time, and resets the context when the tempo or key changed. It only resets once
  music has played (before the first Play there is nothing to restart), and also while paused.
- Screen: `live-jam.tsx` (Guidance, Temperature, Key, three switches, the note), `keys.ts`.
- Tests: 3 more in `studio-live.test.ts`, `keys.test.ts` (4).
- Not tried against Lyria: whether the reset makes tempo and key changes audible is taken from
  Google's documentation, not heard.
