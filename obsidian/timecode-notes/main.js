'use strict';

/* Timecode Notes — on-set note taking inside Obsidian.
 *
 * Plain CommonJS against the Obsidian API, so there is no build step: drop the
 * folder into .obsidian/plugins/ and enable it.
 */

const { Plugin, ItemView, Notice, MarkdownView, PluginSettingTab, Setting } = require('obsidian');

const VIEW_TYPE = 'timecode-notes-view';

/* -------------------------------------------------------------------- tags */

const TAGS = {
  good:     { num: '1', sigil: '*',  label: 'Good',     color: 'Green' },
  ng:       { num: '2', sigil: '!',  label: 'No good',  color: 'Red' },
  sound:    { num: '3', sigil: null, label: 'Sound',    color: 'Yellow' },
  broll:    { num: '4', sigil: '~',  label: 'B-roll',   color: 'Cyan' },
  question: { num: '5', sigil: '?',  label: 'Question', color: 'Purple' },
  prod:     { num: '6', sigil: '#',  label: 'Note',     color: 'Blue' },
  plain:    { num: null, sigil: null, label: 'Mark',    color: 'Blue' }
};
const TAG_ORDER = ['good', 'ng', 'sound', 'broll', 'question', 'prod', 'plain'];

const BY_NUM = {};
const BY_SIGIL = {};
for (const key of TAG_ORDER) {
  if (TAGS[key].num) BY_NUM[TAGS[key].num] = key;
  if (TAGS[key].sigil) BY_SIGIL[TAGS[key].sigil] = key;
}

/* Frame rates. `fps` is the true rate used for seconds -> frames; `timebase` is
 * the nominal integer the timecode string counts in, which is what FCP7 XML
 * wants alongside the `ntsc` flag. They differ for the 1000/1001 rates, and
 * that difference is exactly why drop-frame exists. */
const RATES = [
  { id: '23.976', label: '23.976 — NTSC film', fps: 24000 / 1001, timebase: 24, ntsc: true,  df: false },
  { id: '24',     label: '24 — film',          fps: 24,           timebase: 24, ntsc: false, df: false },
  { id: '25',     label: '25 — PAL',           fps: 25,           timebase: 25, ntsc: false, df: false },
  { id: '29.97df',label: '29.97 drop-frame',   fps: 30000 / 1001, timebase: 30, ntsc: true,  df: true  },
  { id: '29.97',  label: '29.97 non-drop',     fps: 30000 / 1001, timebase: 30, ntsc: true,  df: false },
  { id: '30',     label: '30',                 fps: 30,           timebase: 30, ntsc: false, df: false },
  { id: '50',     label: '50 — PAL HFR',       fps: 50,           timebase: 50, ntsc: false, df: false },
  { id: '59.94df',label: '59.94 drop-frame',   fps: 60000 / 1001, timebase: 60, ntsc: true,  df: true  },
  { id: '60',     label: '60',                 fps: 60,           timebase: 60, ntsc: false, df: false }
];
const DEFAULT_RATE = '25';

function rateById(id) {
  return RATES.find((r) => r.id === id) || RATES.find((r) => r.id === DEFAULT_RATE);
}

const DEFAULT_SETTINGS = {
  rateId: DEFAULT_RATE,
  leadSec: -3,
  exportFolder: '',
  sortMode: 'capture-desc'
};

const SORT_MODES = {
  'capture-desc': 'Latest first',
  'capture-asc': 'Capture order',
  'time-asc': 'Timecode \u2191',
  'time-desc': 'Timecode \u2193'
};

/* ---------------------------------------------------------------- timecode */

const pad = (n) => (n < 10 ? '0' : '') + n;

/** Seconds to a timecode string for the given rate.
 *  Drop-frame is rendered with a semicolon, as every NLE does. */
function toTimecode(sec, rate) {
  return framesToTimecode(toFrames(sec, rate), rate);
}

function framesToTimecode(totalFrames, rate) {
  const tb = rate.timebase;
  if (!rate.df) {
    const whole = Math.floor(totalFrames / tb);
    // Timecode is a clock: it wraps at 24h rather than running to 25:00:00.
    return `${pad(Math.floor(whole / 3600) % 24)}:${pad(Math.floor(whole / 60) % 60)}` +
           `:${pad(whole % 60)}:${pad(totalFrames % tb)}`;
  }

  /* Drop-frame renumbering: skip 2 labels a minute at 30, 4 at 60, except on
   * every tenth minute. The frame COUNT never changes — only the label. */
  const drop = tb / 30 * 2;
  const per10 = tb * 60 * 10 - drop * 9;
  const perMin = tb * 60 - drop;

  const tens = Math.floor(totalFrames / per10);
  const rest = totalFrames % per10;
  const adjusted = totalFrames + drop * 9 * tens +
    (rest < drop ? 0 : drop * Math.floor((rest - drop) / perMin));

  return `${pad(Math.floor(adjusted / (tb * 3600)) % 24)}:${pad(Math.floor(adjusted / (tb * 60)) % 60)}` +
         `:${pad(Math.floor(adjusted / tb) % 60)};${pad(adjusted % tb)}`;
}

/** Seconds to HH:MM:SS — the form that goes into the note. */
function toClock(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const whole = Math.floor(sec);
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor(whole / 60) % 60)}:${pad(whole % 60)}`;
}

const toFrames = (sec, rate) => Math.max(0, Math.round((isFinite(sec) ? sec : 0) * rate.fps));

/** Read a time a human typed. Rightmost field is always seconds, so "22:00" is
 *  22 minutes and "1:02:03" is an hour. Accepts bare seconds and an optional
 *  trailing frames field. Returns null if it can't be read. */
function parseTimecode(str, rate) {
  if (str == null) return null;
  const text = String(str).trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return parseFloat(text);

  const parts = text.split(':');
  if (parts.length < 2 || parts.length > 4) return null;
  if (!parts.every((p) => /^\d+(\.\d+)?$/.test(p.trim()))) return null;

  const nums = parts.map((p) => parseFloat(p));
  const frames = nums.length === 4 ? nums.pop() : 0;
  const sec = nums.length === 3
    ? nums[0] * 3600 + nums[1] * 60 + nums[2]
    : nums[0] * 60 + nums[1];
  return sec + frames / rate.fps;
}

/** Local calendar date — never UTC, or a late shoot gets yesterday's name. */
function dateStamp(ms) {
  const d = ms ? new Date(ms) : new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ----------------------------------------------------------------- session */

function newSession(leadSec) {
  return {
    title: dateStamp(),        // the producer renames it afterwards
    createdAt: Date.now(),
    startedAt: null,
    stoppedAt: null,
    offsetSec: 0,
    startTcSec: 0,             // what timecode the session's zero maps to
    leadSec: leadSec,
    notes: []
  };
}

/** Where a note lands in the footage, in seconds. Null means "no timecode". */
function noteSeconds(session, note) {
  if (note.tag === 'prod' || !session.startedAt) return null;
  const base = (note.keyDownAt - session.startedAt) / 1000;
  return Math.max(0, base + session.offsetSec + session.leadSec + (note.nudgeSec || 0));
}

/** Capture order, oldest first. Returns a fresh array, so callers that want a
 *  different display order may reorder it without affecting exports. */
/* Seconds from the session's zero, expressed on the camera's clock. Zero unless
 * a start timecode is set, which is what makes time-of-day jammed cameras line
 * up without any further arithmetic. */
const absSec = (s, sec) => (s.startTcSec || 0) + sec;

/** Seconds since local (or UTC) midnight at a given instant. */
function timeOfDaySec(ms, utc) {
  const d = new Date(ms);
  return utc
    ? d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()
    : d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

const sortedNotes = (s) => s.notes.slice().sort((a, b) => a.keyDownAt - b.keyDownAt);

/** Display order only. Exports never consult this — see markerNotes.
 *  In the timecode modes, untimed production notes sink to the bottom and keep
 *  capture order among themselves, since they have no time to sort by. */
function displayNotes(session, mode) {
  const rows = sortedNotes(session);
  if (mode === 'capture-asc') return rows;
  if (mode === 'time-asc' || mode === 'time-desc') {
    const timed = [];
    const untimed = [];
    for (const note of rows) {
      (noteSeconds(session, note) === null ? untimed : timed).push(note);
    }
    timed.sort((a, b) => noteSeconds(session, a) - noteSeconds(session, b));
    if (mode === 'time-desc') timed.reverse();
    return timed.concat(untimed);
  }
  return rows.reverse();               // capture-desc, the default
}

/** Notes that become markers, in timeline order, with resolved seconds. */
function markerNotes(session) {
  return sortedNotes(session)
    .map((note) => ({ note, sec: noteSeconds(session, note) }))
    .filter((row) => row.sec !== null)
    .sort((a, b) => a.sec - b.sec);
}

const elapsed = (s) => (s.startedAt ? ((s.stoppedAt || Date.now()) - s.startedAt) / 1000 : 0);

/** Duration to report in an export. A session that was never stopped would
 *  otherwise claim every hour since it started, so fall back to the last
 *  marker — the only defensible end point we actually know about. */
function recordedSeconds(session) {
  if (!session.startedAt) return 0;
  if (session.stoppedAt) return (session.stoppedAt - session.startedAt) / 1000;
  const rows = markerNotes(session);
  return rows.length ? rows[rows.length - 1].sec : 0;
}

/* ----------------------------------------------------------------- exports */

function buildMarkdown(session, rate) {
  const lines = [`## ${session.title}`, ''];
  lines.push(`- Recorded: ${toClock(recordedSeconds(session))} · ${rate.label}`);
  lines.push(`- Offset: ${session.offsetSec}s · Reaction lead: ${session.leadSec}s`);
  lines.push('');

  for (const row of markerNotes(session)) {
    const stamp = `- \`${toTimecode(absSec(session, row.sec), rate)}\` **${TAGS[row.note.tag].label}**`;
    lines.push(row.note.text ? `${stamp} ${row.note.text}` : stamp);
  }

  const untimed = sortedNotes(session).filter((n) => noteSeconds(session, n) === null);
  if (untimed.length) {
    lines.push('', '### Production notes', '');
    for (const note of untimed) lines.push(`- ${note.text || '—'}`);
  }
  return lines.join('\n') + '\n';
}

const escapeXml = (str) =>
  String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function buildFcpXml(session, rate) {
  const rows = markerNotes(session);
  const duration = toFrames((rows.length ? rows[rows.length - 1].sec : 0) + 30, rate);
  const rateBlock = `<rate><timebase>${rate.timebase}</timebase>` +
                    `<ntsc>${rate.ntsc ? 'TRUE' : 'FALSE'}</ntsc></rate>`;

  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE xmeml>',
    '<xmeml version="4">',
    '  <sequence id="timecode-notes">',
    `    <name>${escapeXml(session.title)}</name>`,
    `    <duration>${duration}</duration>`,
    `    ${rateBlock}`,
    '    <timecode>',
    `      ${rate}`,
    `      <string>${toTimecode(session.startTcSec || 0, rate)}</string>` +
    `<frame>${toFrames(session.startTcSec || 0, rate)}</frame>` +
    `<displayformat>${rate.df ? 'DF' : 'NDF'}</displayformat>`,
    '    </timecode>',
    '    <media><video><format><samplecharacteristics>',
    `      ${rate}`,
    '      <width>1920</width><height>1080</height>',
    '    </samplecharacteristics></format></video></media>'
  ];

  for (const row of rows) {
    // FCP7 markers carry no colour field, so the tag rides in the name where
    // it is still readable at a glance in the timeline.
    const label = `[${TAGS[row.note.tag].label.toUpperCase()}]`;
    const name = row.note.text ? `${label} ${row.note.text}` : label;
    const comment = TAGS[row.note.tag].color + (row.note.text ? ` · ${row.note.text}` : '');
    out.push('    <marker>');
    out.push(`      <name>${escapeXml(name)}</name>`);
    out.push(`      <comment>${escapeXml(comment)}</comment>`);
    out.push(`      <in>${toFrames(row.sec, rate)}</in><out>-1</out>`);
    out.push('    </marker>');
  }

  out.push('  </sequence>', '</xmeml>');
  return out.join('\n') + '\n';
}

/* -------------------------------------------------------------------- view */

class TimecodeNotesView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.draftStampedAt = null;   // set by the first keystroke of a note
    this.clockTimer = null;
    this.wakeLock = null;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Timecode Notes'; }
  getIcon() { return 'clapperboard'; }

  get session() { return this.plugin.session; }

  async onOpen() {
    this.build();
    this.render();
    // A plain interval is enough — this only repaints two text nodes.
    this.clockTimer = window.setInterval(() => this.renderClock(), 250);
    this.registerInterval(this.clockTimer);

    this.registerDomEvent(document, 'visibilitychange', () => {
      if (document.visibilityState === 'visible') this.syncWakeLock();
    });
    this.syncWakeLock();
  }

  async onClose() {
    if (this.clockTimer) window.clearInterval(this.clockTimer);
    this.releaseWakeLock();
  }

  build() {
    const root = this.contentEl;
    root.empty();
    root.addClass('tcnotes');

    root.createDiv({ cls: 'tcnotes-brand', text: 'Timecode Notes' });

    /* --- header: title, clock, transport --- */
    const head = root.createDiv({ cls: 'tcnotes-head' });

    this.titleInput = head.createEl('input', { cls: 'tcnotes-title', type: 'text' });
    this.titleInput.placeholder = 'Session name';
    this.registerDomEvent(this.titleInput, 'input', () => {
      this.session.title = this.titleInput.value;
      this.plugin.persist();
    });

    const clockRow = head.createDiv({ cls: 'tcnotes-clockrow' });
    this.clockEl = clockRow.createDiv({ cls: 'tcnotes-clock', text: '00:00:00' });
    this.tcEl = clockRow.createDiv({ cls: 'tcnotes-tc', text: '00:00:00:00' });
    this.wakeEl = clockRow.createDiv({ cls: 'tcnotes-wake', text: '● screen awake' });
    this.wakeEl.hide();

    this.transportBtn = head.createEl('button', { cls: 'mod-cta tcnotes-transport', text: 'Start' });
    this.registerDomEvent(this.transportBtn, 'click', () => this.toggleTransport());

    /* --- capture --- */
    const capture = root.createDiv({ cls: 'tcnotes-capture' });
    this.captureInput = capture.createEl('input', { cls: 'tcnotes-input', type: 'text' });
    this.captureInput.placeholder = 'Type a note — the first keystroke is the timestamp';
    this.stampEl = capture.createDiv({ cls: 'tcnotes-stamp' });

    // The empty -> non-empty transition is the stamp. Listening to `input`
    // rather than `keydown` means paste and IME composition behave too, and it
    // never competes with Obsidian's own hotkeys.
    this.registerDomEvent(this.captureInput, 'input', () => {
      if (this.captureInput.value.length > 0 && this.draftStampedAt === null) {
        this.draftStampedAt = Date.now();
        this.renderStamp();
      } else if (this.captureInput.value.length === 0) {
        this.draftStampedAt = null;
        this.renderStamp();
      }
    });

    this.registerDomEvent(this.captureInput, 'keydown', (evt) => {
      if (evt.key === 'Enter') { evt.preventDefault(); this.commit(); return; }
      if (evt.key === 'Escape') {
        evt.preventDefault();
        this.captureInput.value = '';
        this.draftStampedAt = null;
        this.renderStamp();
        return;
      }
      // A digit on an empty field is an instant marker, no typing needed.
      if (this.captureInput.value.length === 0 && BY_NUM[evt.key]) {
        evt.preventDefault();
        this.addNote(BY_NUM[evt.key], '', Date.now());
      }
    });

    /* --- tag buttons, for the mouse --- */
    const tagRow = root.createDiv({ cls: 'tcnotes-tags' });
    for (const tag of TAG_ORDER) {
      if (tag === 'plain') continue;
      const btn = tagRow.createEl('button', { cls: `tcnotes-tag tcnotes-tag-${tag}` });
      btn.createSpan({ cls: 'tcnotes-dot' });
      btn.createSpan({ text: TAGS[tag].label });
      btn.setAttribute('aria-label', `${TAGS[tag].label} — key ${TAGS[tag].num}`);
      this.registerDomEvent(btn, 'click', () => {
        const stampedAt = this.draftStampedAt || Date.now();
        const text = this.captureInput.value.trim();
        this.captureInput.value = '';
        this.draftStampedAt = null;
        this.addNote(tag, text, stampedAt);
        this.captureInput.focus();
      });
    }

    /* --- summary + handoff --- */
    root.createDiv({ cls: 'tcnotes-label', text: 'Session' });
    this.summaryEl = root.createDiv({ cls: 'tcnotes-summary' });

    const actions = root.createDiv({ cls: 'tcnotes-actions' });
    const insertBtn = actions.createEl('button', { cls: 'mod-cta', text: 'Insert into note' });
    this.registerDomEvent(insertBtn, 'click', () => this.plugin.insertIntoActiveNote());

    const xmlBtn = actions.createEl('button', { text: 'Save Premiere XML' });
    this.registerDomEvent(xmlBtn, 'click', () => this.plugin.exportXmlToVault());

    const newBtn = actions.createEl('button', { text: 'New session' });
    this.registerDomEvent(newBtn, 'click', () => this.plugin.startNewSession());

    /* --- timing --- */
    const timing = root.createEl('details', { cls: 'tcnotes-timing' });
    timing.createEl('summary', { text: 'Adjust timing' });
    this.startTcRow(timing);
    this.offsetInput = this.numberRow(timing, 'Start offset', 'offsetSec');
    this.leadInput = this.numberRow(timing, 'Reaction lead', 'leadSec');

    /* --- notes --- */
    const notesHead = root.createDiv({ cls: 'tcnotes-listhead' });
    notesHead.createSpan({ cls: 'tcnotes-label tcnotes-bare', text: 'Notes' });

    const sort = notesHead.createEl('select', { cls: 'tcnotes-sort dropdown' });
    for (const [value, label] of Object.entries(SORT_MODES)) {
      const opt = sort.createEl('option', { text: label });
      opt.value = value;
    }
    sort.value = this.plugin.settings.sortMode;
    this.registerDomEvent(sort, 'change', async () => {
      this.plugin.settings.sortMode = sort.value;
      await this.plugin.saveSettings();
      this.renderList();
    });

    this.listEl = root.createDiv({ cls: 'tcnotes-list' });
  }

  /** Start timecode, with buttons to snap it to the time of day. */
  startTcRow(parent) {
    const row = parent.createDiv({ cls: 'tcnotes-numrow' });
    row.createSpan({ text: 'Start TC' });

    const input = row.createEl('input', { type: 'text', cls: 'tcnotes-starttc' });
    this.startTcInput = input;
    this.registerDomEvent(input, 'change', () => {
      const parsed = parseTimecode(input.value, rateById(this.plugin.settings.rateId));
      if (parsed === null) {
        new Notice('Could not read that timecode — try 14:32:07 or 14:32:07:12');
        this.render();
        return;
      }
      this.setStartTc(parsed);
    });

    const tod = (utc) => {
      const s = this.session;
      this.setStartTc(timeOfDaySec(s.startedAt || Date.now(), utc));
    };
    const local = row.createEl('button', { text: 'Local' });
    this.registerDomEvent(local, 'click', () => tod(false));
    const utcBtn = row.createEl('button', { text: 'UTC' });
    this.registerDomEvent(utcBtn, 'click', () => tod(true));
    const zero = row.createEl('button', { text: 'Zero' });
    this.registerDomEvent(zero, 'click', () => this.setStartTc(0));
  }

  setStartTc(sec) {
    this.session.startTcSec = Math.max(0, sec);
    this.plugin.persist();
    this.render();
    new Notice(`Start timecode ${toTimecode(this.session.startTcSec, rateById(this.plugin.settings.rateId))}`);
  }

  numberRow(parent, label, key) {
    const row = parent.createDiv({ cls: 'tcnotes-numrow' });
    row.createSpan({ text: label });
    const input = row.createEl('input', { type: 'number' });
    input.step = '0.5';
    this.registerDomEvent(input, 'input', () => {
      const v = parseFloat(input.value);
      if (!isFinite(v)) return;
      this.session[key] = v;
      this.plugin.persist();
      this.renderList();
      this.renderSummary();
    });
    row.createSpan({ text: 's', cls: 'tcnotes-unit' });
    return input;
  }

  /* --- wake lock --- */

  /* A phone or tablet used as the note taker will sleep mid-take otherwise.
   * The webview drops the lock whenever the page hides, so it has to be
   * re-acquired on visibilitychange for as long as the session is rolling.
   * Desktop Obsidian and unsupported webviews just fail quietly. */
  releaseWakeLock() {
    if (!this.wakeLock) return;
    const lock = this.wakeLock;
    this.wakeLock = null;
    lock.release().catch(() => {});
    if (this.wakeEl) this.wakeEl.hide();
  }

  requestWakeLock() {
    if (this.wakeLock || !navigator.wakeLock) return;
    navigator.wakeLock.request('screen').then((lock) => {
      this.wakeLock = lock;
      if (this.wakeEl) this.wakeEl.show();
      lock.addEventListener('release', () => {
        this.wakeLock = null;
        if (this.wakeEl) this.wakeEl.hide();
      });
    }).catch(() => {
      if (this.wakeEl) this.wakeEl.hide();
    });
  }

  syncWakeLock() {
    const s = this.session;
    if (s.startedAt && !s.stoppedAt) this.requestWakeLock();
    else this.releaseWakeLock();
  }

  /* --- actions --- */

  toggleTransport() {
    const s = this.session;
    if (!s.startedAt) { s.startedAt = Date.now(); s.stoppedAt = null; new Notice('Rolling — zero is now'); }
    else if (!s.stoppedAt) { s.stoppedAt = Date.now(); new Notice('Stopped'); }
    else { s.stoppedAt = null; new Notice('Resumed'); }
    this.plugin.persist();
    this.render();
    this.syncWakeLock();
    this.captureInput.focus();
  }

  commit() {
    let text = this.captureInput.value.replace(/^\s+/, '');
    let tag = 'plain';
    if (text.length && BY_SIGIL[text.charAt(0)]) {
      tag = BY_SIGIL[text.charAt(0)];
      text = text.slice(1);
    }
    text = text.trim();
    if (!text && tag === 'plain') { this.captureInput.value = ''; this.draftStampedAt = null; return; }

    this.addNote(tag, text, this.draftStampedAt || Date.now());
    this.captureInput.value = '';
    this.draftStampedAt = null;
    this.renderStamp();
  }

  addNote(tag, text, keyDownAt) {
    const s = this.session;
    // Before the timer starts there is nothing to anchor to, so a bare note
    // becomes a production note rather than a marker at zero.
    const effective = (!s.startedAt && tag === 'plain') ? 'prod' : tag;

    s.notes.push({
      id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      wallClock: new Date(keyDownAt).toISOString(),
      keyDownAt,
      committedAt: Date.now(),
      tag: effective,
      text: text || '',
      nudgeSec: 0
    });
    this.plugin.persist();
    this.render();
  }

  /* --- retiming --- */

  /* Stores a delta rather than an absolute, so a note moved by hand still
   * travels with any later change to the session offset. */
  retime(note, targetSec) {
    const s = this.session;
    const base = (note.keyDownAt - s.startedAt) / 1000;
    note.nudgeSec = targetSec - (base + s.offsetSec + s.leadSec);
    this.plugin.persist();
    this.render();
  }

  /** Swap the timecode cell for an input so an exact time can be typed. */
  editNoteTime(note, cell) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tcnotes-tcedit';
    input.value = toClock(absSec(this.session, noteSeconds(this.session, note)));
    cell.replaceWith(input);
    input.focus();
    input.select();

    let settled = false;
    const finish = (apply) => {
      if (settled) return;
      settled = true;
      if (!apply) { this.render(); return; }

      const target = parseTimecode(input.value, rateById(this.plugin.settings.rateId));
      if (target === null) {
        new Notice('Could not read that time — try 22:00 or 00:22:00');
        this.render();
        return;
      }
      // Typed as camera-clock time, stored relative to the session's zero.
      const relative = Math.max(0, target - (this.session.startTcSec || 0));
      this.retime(note, relative);
      new Notice(`Moved to ${toClock(absSec(this.session, relative))}`);
    };

    input.addEventListener('keydown', (evt) => {
      evt.stopPropagation();
      if (evt.key === 'Enter') { evt.preventDefault(); finish(true); }
      else if (evt.key === 'Escape') { evt.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  /* --- render --- */

  render() {
    const s = this.session;
    this.titleInput.value = s.title;
    this.offsetInput.value = s.offsetSec;
    if (this.startTcInput && document.activeElement !== this.startTcInput) {
      this.startTcInput.value = toTimecode(s.startTcSec || 0, rateById(this.plugin.settings.rateId));
    }
    this.leadInput.value = s.leadSec;
    this.transportBtn.setText(!s.startedAt ? 'Start' : (s.stoppedAt ? 'Resume' : 'Stop'));
    this.transportBtn.toggleClass('tcnotes-rolling', !!s.startedAt && !s.stoppedAt);
    this.renderClock();
    this.renderStamp();
    this.renderSummary();
    this.renderList();
  }

  renderClock() {
    const s = this.session;
    const e = elapsed(s);
    this.clockEl.setText(toClock(e));
    this.clockEl.toggleClass('tcnotes-live', !!s.startedAt && !s.stoppedAt);
    this.tcEl.setText(toTimecode(e, rateById(this.plugin.settings.rateId)));
  }

  renderStamp() {
    if (!this.stampEl) return;
    const s = this.session;
    if (this.draftStampedAt === null) { this.stampEl.setText(''); return; }
    if (!s.startedAt) { this.stampEl.setText('no timecode — session not started'); return; }
    const sec = (this.draftStampedAt - s.startedAt) / 1000 + s.offsetSec + s.leadSec;
    this.stampEl.setText(toTimecode(sec, rateById(this.plugin.settings.rateId)));
  }

  renderSummary() {
    const s = this.session;
    this.summaryEl.empty();
    const markers = markerNotes(s).length;
    this.summaryEl.createSpan({ text: `${markers} marker${markers === 1 ? '' : 's'}` });

    const counts = {};
    for (const n of s.notes) counts[n.tag] = (counts[n.tag] || 0) + 1;
    for (const tag of TAG_ORDER) {
      if (!counts[tag]) continue;
      const chip = this.summaryEl.createSpan({ cls: `tcnotes-count tcnotes-tag-${tag}` });
      chip.createSpan({ cls: 'tcnotes-dot' });
      chip.createSpan({ text: `${TAGS[tag].label} ${counts[tag]}` });
    }
  }

  renderList() {
    const s = this.session;
    this.listEl.empty();

    const rows = displayNotes(s, this.plugin.settings.sortMode);
    if (!rows.length) {
      this.listEl.createDiv({ cls: 'tcnotes-empty', text: 'No notes yet.' });
      return;
    }

    for (const note of rows) {
      const sec = noteSeconds(s, note);
      const row = this.listEl.createDiv({ cls: `tcnotes-row tcnotes-tag-${note.tag}` });

      const tc = row.createSpan({
        cls: 'tcnotes-rowtc' + (sec === null ? ' tcnotes-muted' : ' tcnotes-editable'),
        text: sec === null ? 'untimed' : toClock(absSec(s, sec))
      });
      if (sec !== null) {
        tc.setAttribute('aria-label', 'Click to set an exact time');
        this.registerDomEvent(tc, 'click', () => this.editNoteTime(note, tc));
      }
      row.createSpan({ cls: 'tcnotes-rowtext', text: note.text || TAGS[note.tag].label });

      const del = row.createEl('button', { cls: 'tcnotes-del', text: '×' });
      del.setAttribute('aria-label', 'Delete note');
      this.registerDomEvent(del, 'click', () => {
        s.notes = s.notes.filter((n) => n.id !== note.id);
        this.plugin.persist();
        this.render();
      });
    }
  }
}

/* ---------------------------------------------------------------- settings */

class TimecodeNotesSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Frame rate')
      .setDesc('Must match the edit. Drop-frame rates display with a semicolon.')
      .addDropdown((d) => d
        .addOptions(RATES.reduce((acc, r) => { acc[r.id] = r.label; return acc; }, {}))
        .setValue(this.plugin.settings.rateId)
        .onChange(async (v) => {
          this.plugin.settings.rateId = v;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        }));

    new Setting(containerEl)
      .setName('Reaction lead')
      .setDesc('Seconds to shift every marker earlier, since notes are typed after the thing they describe.')
      .addText((t) => t
        .setValue(String(this.plugin.settings.leadSec))
        .onChange(async (v) => {
          const n = parseFloat(v);
          if (!isFinite(n)) return;
          this.plugin.settings.leadSec = n;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('XML export folder')
      .setDesc('Vault folder for saved Premiere XML. Leave blank for the vault root.')
      .addText((t) => t
        .setPlaceholder('Productions/markers')
        .setValue(this.plugin.settings.exportFolder)
        .onChange(async (v) => {
          this.plugin.settings.exportFolder = v.trim();
          await this.plugin.saveSettings();
        }));
  }
}

/* ------------------------------------------------------------------ plugin */

module.exports = class TimecodeNotesPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    const saved = await this.loadData();
    this.session = (saved && saved.session) ? saved.session : newSession(this.settings.leadSec);

    this.registerView(VIEW_TYPE, (leaf) => new TimecodeNotesView(leaf, this));

    this.addRibbonIcon('clapperboard', 'Timecode Notes', () => this.activateView());

    this.addCommand({
      id: 'open-panel',
      name: 'Open panel',
      callback: () => this.activateView()
    });

    this.addCommand({
      id: 'toggle-session',
      name: 'Start / stop session',
      callback: async () => {
        await this.activateView();
        const view = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view;
        if (view) view.toggleTransport();
      }
    });

    this.addCommand({
      id: 'insert-notes',
      name: 'Insert session notes into a note',
      callback: () => this.insertIntoActiveNote()
    });

    this.addCommand({
      id: 'export-xml',
      name: 'Save Premiere XML to vault',
      callback: () => this.exportXmlToVault()
    });

    this.addSettingTab(new TimecodeNotesSettingTab(this.app, this));
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data && data.settings);
  }

  async saveSettings() { await this.persist(); }

  /** One write path for both settings and the live session. */
  async persist() {
    await this.saveData({ settings: this.settings, session: this.session });
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view && leaf.view.render) leaf.view.render();
    }
  }

  /** The leaf holding the note to insert into.
   *
   * Clicking a button in the side panel makes THIS view the active one, so
   * getActiveViewOfType would always miss the note the user is looking at.
   * Fall back to the most recent leaf in the main editor area, then to any
   * open markdown leaf. */
  findTargetMarkdownLeaf() {
    const ws = this.app.workspace;

    const active = ws.getActiveViewOfType(MarkdownView);
    if (active) return active.leaf;

    if (typeof ws.getMostRecentLeaf === 'function') {
      const recent = ws.getMostRecentLeaf();
      if (recent && recent.view instanceof MarkdownView) return recent;
    }

    return ws.getLeavesOfType('markdown')[0] || null;
  }

  insertIntoActiveNote() {
    const leaf = this.findTargetMarkdownLeaf();
    if (!leaf || !(leaf.view instanceof MarkdownView)) {
      new Notice('Open a note in the editor first');
      return;
    }

    const view = leaf.view;
    const editor = view.editor;
    const markdown = buildMarkdown(this.session, rateById(this.settings.rateId));

    if (typeof view.getMode === 'function' && view.getMode() === 'preview') {
      // Reading view has no meaningful cursor, and a stale one would drop the
      // session somewhere near the top of the note. Append instead.
      const lastLine = editor.lastLine();
      editor.replaceRange('\n' + markdown, { line: lastLine, ch: editor.getLine(lastLine).length });
    } else {
      editor.replaceSelection(markdown);
    }

    this.app.workspace.revealLeaf(leaf);
    new Notice(`Session notes inserted into ${view.file ? view.file.basename : 'note'}`);
  }

  async exportXmlToVault() {
    const rows = markerNotes(this.session);
    if (!rows.length) {
      new Notice('No markers to export yet');
      return;
    }

    const base = (this.session.title || dateStamp())
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || dateStamp();
    const folder = this.settings.exportFolder ? this.settings.exportFolder.replace(/\/+$/, '') + '/' : '';
    const xml = buildFcpXml(this.session, rateById(this.settings.rateId));

    // Never clobber an earlier export — walk to the first free name.
    let path = `${folder}${base}.xml`;
    let n = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = `${folder}${base}-${n}.xml`;
      n += 1;
    }

    try {
      await this.app.vault.create(path, xml);
      new Notice(`Saved ${path}`);
    } catch (err) {
      new Notice(`Could not save XML: ${err.message}`);
    }
  }

  async startNewSession() {
    this.session = newSession(this.settings.leadSec);
    await this.persist();
    this.refreshViews();
    new Notice(`New session — ${this.session.title}`);
  }
};
