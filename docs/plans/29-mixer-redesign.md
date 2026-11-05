# 29 · Studio Mixer redesign + editing features

## Decisions (asked 2026-11-05)

- Layout: **full-height studio**. Thin top bar, the timeline fills the page, transport pinned at the bottom (styled like the prompt box), "Add audio" opens a side panel.
- Empty mix: **big start screen**. MIXER title, a handwritten line, two big choices: upload/drop a file, or pick from your Lyria music. Dropping a file anywhere on the page also works.
- Scope: **look + new features**: split + duplicate, undo/redo, snap to grid, fades + pan.
- Saved data: **extend it**. Projects are JSON (`stemProject.data`), so there's no DB migration. Older projects are converted when opened.

## The model change (the one real risk)

Today each track *is* one clip (start, trims and volume all sit on the track). Split and duplicate need **several clips per track**:

```ts
MixClip  { id, url, startTime, trimStart, trimEnd, duration, fadeIn, fadeOut }
MixTrack { id, name, color, volume, pan, muted, soloed, clips: MixClip[] }
MixProject { version: 2, bpm, masterVolume, snap, tracks, publish? }
```

- `normalizeProject(data)` turns a v1 project (one clip per track) into v2. It's used when a project is opened. No fades, pan 0, snap on.
- Server `projects.save` validates v2 only, since the client always sends v2. The checks become per clip: own S3 URL, not trimmed to nothing, fades no longer than the clip. Limits: 24 tracks, 64 clips per track.
- Artist portal publish reads only `data.publish`, which is unchanged.

## Features

| Feature | Behaviour |
|---|---|
| Select | Click a clip to select it (outlined). Esc clears. |
| Split | **S** or the scissors button: cuts the selected clip at the playhead (it must be inside the clip, and each side at least 0.25 s). |
| Duplicate | **Cmd/Ctrl+D**: copies the clip right after itself on the same track. |
| Delete | **Delete/Backspace** removes the selected clip. A track with no clips stays until you remove it. |
| Undo / redo | **Cmd/Ctrl+Z**, **Shift+Cmd/Ctrl+Z**. One step per drag (taken on pointer-up), per split, delete, volume change and so on. Up to 100 steps. Cleared when another project opens. |
| Snap | Toggle in the transport (on by default). Moves, trims and the playhead snap to beats at the project BPM. Hold **Alt** to drag freely. |
| Fades | A small handle at each top corner of a clip. Drag inward to fade in/out. Drawn as a shaded curve. |
| Pan | A small L–R slider per track. |
| Play | **Space** plays and pauses. Shortcuts are ignored while typing in a field. |

Playback, WAV export and publish stems all use the same per-clip schedule: a gain envelope for the fades, then a `StereoPannerNode` per track. Stems are rendered one per track, with all its clips.

## Layout

- **Top bar:** editable project name, Projects, Publish as a song (artists), Save.
- **Timeline (fills the page):**
  - A ruler with beat/bar lines.
  - Sticky track headers: colour bar, name, M/S, volume, pan, delete.
  - Taller lanes (96 px).
  - Rounded clips tinted in the track colour, with a waveform, the name, trim edges and fade handles.
  - A "+ Add audio" row under the last track.
- **Transport (pinned at the bottom):** play/stop/loop, time, master volume, snap, split, undo/redo, zoom, Export WAV.
- **Add audio panel:** slides in from the right, with the upload/drop zone and your Lyria list.
- **Empty:** the start screen described above.

## Files

- `features/mixer/mix.ts`: v2 types, `normalizeProject`, `split`, `duplicate`, `snapTime`, `fadeGain` (envelope points), per-clip `playSlice`, `mixLength`.
- `features/mixer/history.ts` (new): an undo/redo stack (pure).
- `features/mixer/engine.ts`: schedules per clip, with fades and pan.
- `features/mixer/use-mixer.ts`: selection, history, snap, the new actions, keyboard shortcuts.
- `features/mixer/{mixer-view,timeline,transport,sources}.tsx`: the new layout. Also `start-screen.tsx` and `add-panel.tsx` (new).
- `app/mixer/page.tsx`: full height, no padding wrapper.
- `packages/api/src/routers/studio/projects.ts` and `services/studio/projects.ts`: v2 schema and checks.

## Tests first

- `mix.test.ts`:
  - normalize v1 → v2.
  - Split: at the playhead, refuses outside the clip or a sliver under 0.25 s.
  - Duplicate placement.
  - Snap to beats, and the Alt bypass.
  - The fade envelope.
  - The per-clip play slice.
  - Mix length across clips.
  - Solo/mute.
- `history.test.ts`: push, undo, redo, a new edit clears redo, the 100-step cap.
- API: save accepts v2, and rejects a foreign URL, a clip trimmed to nothing, and a fade longer than its clip.

## Browser check

On http://localhost:3102/mixer in a new tab:

1. Upload two generated test tones (WAVs I make in the scratchpad). This uploads them to the dev storage bucket.
2. Move, trim, split, duplicate, undo/redo, snap, fade, pan.
3. Play, then Export WAV.
4. Save, reload, and reopen the project.
5. Take screenshots in dark and light mode.

## Publish is for artists (added 2026-11-05)

Anyone signed in can use the whole editor: create, edit, export a WAV, save projects. **Publish to Bandcoin** shows for everyone:

- **Approved artist:** works as today (renders the mix and stems, then opens the portal's new-song form).
- **No artist page:** the button is locked (lock icon). Clicking it opens a small panel: "Publishing is for artists", with a **Join as Artist** link to the artist portal home, where sign-up starts.
- **Pending:** locked, "Your artist page is in review".
- **Rejected / banned:** locked, "Your artist page isn't approved", with a link to the portal.
