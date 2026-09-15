const Module = require('module');
const origResolve = Module._resolveFilename;
class Base { constructor() {} }
class MarkdownView extends Base {}
const notices = [];
class Notice { constructor(msg) { notices.push(msg); } }
const stub = { Plugin: Base, ItemView: Base, Notice, MarkdownView,
               PluginSettingTab: Base, Setting: Base };
Module._resolveFilename = function (r, ...rest) {
  return r === 'obsidian' ? 'obsidian-stub' : origResolve.call(this, r, ...rest);
};
require.cache['obsidian-stub'] = { id:'obsidian-stub', filename:'obsidian-stub', loaded:true, exports: stub };

const PluginClass = require(require('path').join(__dirname, '..', 'obsidian', 'timecode-notes', 'main.js'));

// Minimal fakes -------------------------------------------------------------
function mdLeaf(name, mode) {
  const lines = ['# ' + name, 'existing body'];
  const view = new MarkdownView();
  view.file = { basename: name };
  view.getMode = () => mode || 'source';
  view.inserted = null;
  view.editor = {
    replaceSelection(t) { view.inserted = { how: 'cursor', text: t }; },
    lastLine: () => lines.length - 1,
    getLine: (n) => lines[n],
    replaceRange(t, pos) { view.inserted = { how: 'append', text: t, pos }; }
  };
  const leaf = { view };
  view.leaf = leaf;
  return leaf;
}

function makePlugin(ws) {
  const p = Object.create(PluginClass.prototype);
  p.app = { workspace: ws };
  p.settings = { fps: 25 };
  p.session = { title: 'T', createdAt: Date.now(), startedAt: Date.now() - 60000,
                stoppedAt: null, offsetSec: 0, leadSec: -3, notes: [] };
  return p;
}

const revealed = [];
function ws(over) {
  return Object.assign({
    getActiveViewOfType: () => null,
    getMostRecentLeaf: () => null,
    getLeavesOfType: () => [],
    revealLeaf: (l) => revealed.push(l.view.file.basename)
  }, over);
}

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '  -> ' + detail : '')); }
}

// 1. Active markdown view (command palette with editor focused)
notices.length = 0;
let leafA = mdLeaf('ActiveNote');
let p = makePlugin(ws({ getActiveViewOfType: () => leafA.view }));
p.insertIntoActiveNote();
console.log('1. active view present');
check('inserted at cursor', leafA.view.inserted && leafA.view.inserted.how === 'cursor');
check('notice names the file', /ActiveNote/.test(notices[0]), notices[0]);

// 2. THE REPORTED BUG: side-panel click, no active markdown view
notices.length = 0;
let leafB = mdLeaf('RecentNote');
p = makePlugin(ws({ getActiveViewOfType: () => null, getMostRecentLeaf: () => leafB }));
p.insertIntoActiveNote();
console.log('2. side-panel click, falls back to most recent leaf');
check('did NOT show the error', !notices.some(n => /Open a note/.test(n)), notices.join(' | '));
check('inserted at cursor', leafB.view.inserted && leafB.view.inserted.how === 'cursor');
check('revealed the leaf', revealed.includes('RecentNote'));

// 3. No active, no recent, but a markdown leaf is open
notices.length = 0;
let leafC = mdLeaf('OnlyOpenNote');
p = makePlugin(ws({ getLeavesOfType: () => [leafC] }));
p.insertIntoActiveNote();
console.log('3. falls back to any open markdown leaf');
check('inserted', leafC.view.inserted !== null);

// 4. Reading view -> append, not a stale cursor near the top
notices.length = 0;
let leafD = mdLeaf('PreviewNote', 'preview');
p = makePlugin(ws({ getMostRecentLeaf: () => leafD }));
p.insertIntoActiveNote();
console.log('4. reading view appends at end');
check('used append path', leafD.view.inserted && leafD.view.inserted.how === 'append');
check('appended at last line/col', leafD.view.inserted.pos.line === 1 && leafD.view.inserted.pos.ch === 'existing body'.length,
      JSON.stringify(leafD.view.inserted && leafD.view.inserted.pos));

// 5. Genuinely nothing open -> the error is still correct
notices.length = 0;
p = makePlugin(ws());
p.insertIntoActiveNote();
console.log('5. nothing open');
check('shows the error', notices.some(n => /Open a note/.test(n)), notices.join(' | '));

// 6. getMostRecentLeaf missing from the API (older Obsidian)
notices.length = 0;
let leafF = mdLeaf('FallbackNote');
const noRecent = ws({ getLeavesOfType: () => [leafF] });
delete noRecent.getMostRecentLeaf;
p = makePlugin(noRecent);
p.insertIntoActiveNote();
console.log('6. getMostRecentLeaf absent');
check('still resolves without throwing', leafF.view.inserted !== null);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
