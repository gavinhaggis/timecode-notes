# Timecode Notes — Obsidian plugin

On-set note taking that lands on a timecode. Start the session when the camera
rolls, then type. Every note carries the moment you started typing it, and the
session leaves as markdown in your note or as Premiere sequence markers.

## Install

There is no build step — the plugin is plain JavaScript.

1. Copy this `timecode-notes` folder into `<your vault>/.obsidian/plugins/`
   so that you end up with `<vault>/.obsidian/plugins/timecode-notes/main.js`.
   The folder is already named correctly — do not rename it.
2. In Obsidian: **Settings → Community plugins**, turn off Restricted mode if
   it is on, then enable **Timecode Notes**.
3. Open the panel from the clapperboard icon in the ribbon, or run
   **Timecode Notes: Open panel** from the command palette.

## Using it

Press **Start** when the camera rolls. The capture field is always live, so you
just type — the first character is the timestamp, and `Enter` files the note.

| | |
|---|---|
| `Enter` | File the note |
| `Esc` | Discard the note in progress |
| `1` on an empty field | **Good** — the take to use |
| `2` on an empty field | **No good** — don't use this one |
| `3` on an empty field | **Sound** — audio problem to fix |
| `4` on an empty field | **B-roll** — cutaway opportunity |
| `5` on an empty field | **Question** — flag it for the edit |
| `6` on an empty field | **Note** — production note, never a marker |
| `*` as first character | Good take |
| `!` as first character | No good |
| `~` as first character | B-roll |
| `?` as first character | Question for the edit |
| `#` as first character | Production note — never becomes a marker |

Sound has no shortcut character — use `3`, or click its tag button. The digits
only fire while the capture field is empty, so a note that genuinely starts with
a number still types normally once you have begun.

**Insert into note** drops the whole session into the note you have open — the
most recently used one in the main editor area, since clicking a button in the
side panel means the panel itself is what is technically focused. Obsidian jumps
to that note so you can see where it landed. In editing view it goes in at your
cursor; in reading view it is appended to the end, because there is no
meaningful cursor to use.
**Save Premiere XML** writes an FCP7 XML into the vault, which Premiere imports
as a sequence with the markers already placed.

The **sort dropdown** above the list controls the on-screen order only:

| | |
|---|---|
| Latest first | what you just typed sits at the top (default) |
| Capture order | the order you took the notes in |
| Timecode ↑ | by time, earliest first — matches what you export |
| Timecode ↓ | by time, latest first |

In the two timecode modes, production notes sink to the bottom, because they
have no time to sort by. **Nothing you insert or export is affected by this
setting** — inserted markdown and Premiere markers are always chronological.

**Click any note's timecode** to type an exact time. Useful when something only
becomes clear later — you are at 30 minutes and realise the note belongs at 22.
It accepts `22:00`, `00:22:00`, `1:02:03` or plain seconds. The note keeps its
place in the list so you can see the change took, and sorts into the right
position in whatever you export.

**Start timecode** under Adjust timing maps the session's zero onto the camera's
clock — set it by hand, or hit **Local** / **UTC** to snap it to the time of day
the session started. The Premiere sequence start moves with it while the markers
stay relative, which is how FCP7 XML expects it.

Under **Adjust timing** there are two more session-wide corrections, both applied at
export so they stay changeable:

- **Start offset** shifts the whole session, for when you hit Start a few
  seconds off from the record button.
- **Reaction lead** shifts every marker earlier, because you always notice the
  thing after it happens. Defaults to −3s.

## Settings

- **Frame rate** — `23.976`, `24`, `25`, `29.97 drop-frame`, `29.97 non-drop`,
  `30`, `50`, `59.94 drop-frame`, `60`. The NTSC rates convert seconds to frames
  at the true 1000/1001 rate, and drop-frame timecode is renumbered the way an
  NLE does it. Drop-frame is shown with a semicolon (`01:00:00;00`).
- **Reaction lead** — the default applied to new sessions.
- **XML export folder** — where saved XML goes. Blank means the vault root.

## Notes on behaviour

- One session is live at a time. **New session** starts a fresh one; the old one
  is gone, so insert it into a note first. In Obsidian the vault is the archive.
- Notes taken before you press Start become production notes, since there is
  nothing to anchor them to.
- XML export never overwrites — it walks to the next free filename.
- Every note also stores absolute wall-clock time, so multicam and per-clip
  anchoring can be added later without invalidating sessions you have already
  recorded.

## Keeping the screen awake

While a session is rolling the panel asks the device for a screen wake lock, so
a phone or tablet used as the note taker does not sleep mid-take. A green
**screen awake** marker appears under the timecode when the lock is actually
held. The lock is released when you stop, and re-acquired automatically if the
app is backgrounded and brought forward again.

Where it will not engage: desktop Obsidian generally has no need for it, and
some webviews refuse the request. The marker is the honest signal — if it is not
showing, the lock is not held.

## Untested

The generated FCP7 XML follows the `xmeml` structure and the frame arithmetic is
unit-tested, but it has not yet been imported into an actual copy of Premiere.
Try one before relying on it for a real production.
