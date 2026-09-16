# Timecode Notes

On-set note taking that lands on a timecode.

Start the timer when the camera rolls, then just type. The **first keystroke is
the timestamp**, so the note is anchored to the moment you noticed the thing —
not the moment you finished writing about it. At the end of the session you have
a stack of notes, each on a timecode, ready to go into your notes app or straight
into the edit as markers.

**[Open the app →](https://gavinhaggis.github.io/timecode-notes/)**
· [Obsidian plugin](obsidian/timecode-notes/)

---

## Why

A three-hour shoot produces three hours of footage and, usually, no durable
record of what the director was thinking while it happened. That knowledge lives
in someone's head until the assembly edit, which might be a week later. So the
editor scrubs everything, or the director sits through a logging session, or —
most often — good takes get missed because nobody remembers which one had the
moment.

This closes that gap without adding a job on set. The person watching the monitor
types what they were already thinking. The editor opens a sequence with the
markers already placed.

## Using it

Press **Start** when the camera rolls, then type. `Enter` files the note, `Esc`
discards it.

| | |
|---|---|
| any letter | stamp the time and start a note |
| `Enter` | commit — or open an empty note |
| `Esc` | discard the note in progress |
| `1`–`6` | instant tagged marker, nothing to type |
| `*` `!` `~` `?` `#` | first character of a note sets its tag |

The six tags map to what an editor actually does next: **Good**, **No good**,
**Sound**, **B-roll**, **Question**, and **Note** (a production note, which never
becomes a marker).

Click any note's **timecode** to type an exact time — useful when something only
becomes clear later and you are at 30 minutes realising the note belongs at 22.

## Getting the notes out

| Format | For |
|---|---|
| Markdown | Obsidian, or any notes app |
| Premiere XML | an FCP7 XML that Premiere imports as a sequence with markers placed |
| CSV | spreadsheets, review |
| Chapters | `HH:MM:SS Title` lines for YouTube |

The on-screen list can be sorted however you like; **everything you export is
always chronological**, oldest first, because that is the order an edit needs.

## Frame rates

Pick the rate under **Adjust timing**. It must match the edit.

`23.976` · `24` · `25` · `29.97 drop-frame` · `29.97 non-drop` · `30` · `50` ·
`59.94 drop-frame` · `60`

The NTSC rates are handled properly: seconds convert to frames at the true
1000/1001 rate, and drop-frame timecode is renumbered the way an NLE does it —
skipping two labels a minute at 30, four at 60, except on every tenth minute.
Drop-frame is shown with a semicolon (`01:00:00;00`).

## Start timecode

By default a session starts at `00:00:00:00`. Set a **start timecode** under
Adjust timing and every note moves onto the camera's clock — which is what you
want when the cameras are jammed to time of day.

The **Local** and **UTC** buttons read the instant the session actually started,
so pressing them after the fact still gives the right answer. **Zero** clears it.

What this does and does not shift:

- the on-screen list, the markdown and the CSV move onto the camera clock
- the Premiere sequence's start timecode is set, while the markers themselves
  stay relative to the sequence, which is how FCP7 XML expects it
- YouTube chapters stay relative to the start of the video, because that is what
  YouTube needs

## Managing sessions

**New** starts a fresh session; the picker switches between them. **Delete**
removes the current one and takes two clicks — the button arms itself first, and
clicking anywhere else disarms it. Deleting the last session leaves you with a
fresh empty one rather than nothing.

Sessions live in your browser only, so export anything worth keeping before you
delete it.

## Two timing corrections

Both are applied at export, so they stay adjustable after the fact.

- **Start offset** shifts the whole session, for when you hit Start a few seconds
  off from the record button.
- **Reaction lead** shifts every marker earlier, because you always notice a
  thing after it happens. Defaults to −3 seconds.

Every note also stores absolute wall-clock time, so a session recorded today can
be re-anchored later without being invalidated.

## Your data

Everything runs in your browser. Notes are held in `localStorage` on your own
machine — there is no account, no server, and nothing is sent anywhere. Clearing
your browser's site data will clear your sessions, so export anything you want to
keep.

While a session is rolling the page asks for a screen wake lock so a phone or
tablet used as the note taker does not sleep mid-take. A green **screen awake**
marker appears when the lock is actually held.

## Obsidian plugin

The same tool inside Obsidian, writing straight into your vault:
[obsidian/timecode-notes](obsidian/timecode-notes/) — installation and notes in
that folder's README.

## Running it yourself

`index.html` is a single self-contained file with no build step. Download it and
open it, drop it on a web server, or embed it in a page. The only external
request is the Montserrat webfont, which falls back to a system stack if it does
not load — so it works offline on set once the page is open.

## Status

The timecode maths, exporters and drop-frame renumbering are covered by tests
against known reference values. **The generated Premiere XML has not yet been
verified against a real copy of Premiere Pro** — the structure follows the FCP7
`xmeml` spec and the frame arithmetic is tested, but try an import before a
production depends on it.

## Tests

```
node tests/run.js
```

No dependencies. The tests load the app and plugin source directly and cover the
timecode maths (including drop-frame renumbering against known reference
values), the exporters, note retiming, and the guarantee that display sorting
never leaks into what you export.

## Licence

MIT — see [LICENSE](LICENSE).
