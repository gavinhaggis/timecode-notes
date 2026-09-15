const Module = require('module');
const origResolve = Module._resolveFilename;
class Base { constructor() {} }
const stub = { Plugin: Base, ItemView: Base, Notice: Base, MarkdownView: Base,
               PluginSettingTab: Base, Setting: Base };
Module._resolveFilename = function (r, ...rest) {
  return r === 'obsidian' ? 'obsidian-stub' : origResolve.call(this, r, ...rest);
};
require.cache['obsidian-stub'] = { id:'obsidian-stub', filename:'obsidian-stub', loaded:true, exports: stub };

const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'obsidian', 'timecode-notes', 'main.js'),'utf8');
const body = src.replace(/^'use strict';/m,'').replace(/const \{ Plugin[^;]+;/,'')
  .replace(/module\.exports = class[\s\S]*$/,'');
const F = new Function('require','ItemView','PluginSettingTab',
  body + '\nreturn { displayNotes, newSession, DEFAULT_SETTINGS, SORT_MODES };'
)(require, Base, Base);

let pass=0, fail=0;
const check=(l,c,d)=>{ c?(pass++,console.log('  ok   '+l)):(fail++,console.log('  FAIL '+l+(d?'  -> '+d:''))); };

const s = F.newSession(-3);
s.startedAt = 1000000;
['A','B','C'].forEach((t,i) => s.notes.push({
  id:'n'+i, wallClock:'', keyDownAt: s.startedAt + (i+1)*60000,
  committedAt:0, tag:'good', text:t, nudgeSec:0 }));
// A typed first, C typed last.

check('DEFAULT_SETTINGS.sortMode is capture-desc', F.DEFAULT_SETTINGS.sortMode === 'capture-desc',
      F.DEFAULT_SETTINGS.sortMode);
check('"capture-desc" is labelled "Latest first"', F.SORT_MODES['capture-desc'] === 'Latest first',
      F.SORT_MODES['capture-desc']);
check('"Latest first" is the first option listed', Object.keys(F.SORT_MODES)[0] === 'capture-desc',
      Object.keys(F.SORT_MODES)[0]);

const withDefault = F.displayNotes(s, F.DEFAULT_SETTINGS.sortMode).map(n=>n.text);
console.log('  default order ->', withDefault.join(', '));
check('default puts the most recent at the top', withDefault[0] === 'C', withDefault.join(','));

// A user upgrading from before this setting existed has no sortMode saved.
const upgraded = Object.assign({}, F.DEFAULT_SETTINGS, { fps: 25, leadSec: -3, exportFolder: '' });
check('upgrade from old settings still defaults to capture-desc',
      upgraded.sortMode === 'capture-desc', upgraded.sortMode);

// And a corrupt/unknown value must not fall through to something odd.
['', null, undefined, 'garbage'].forEach(v => {
  const got = F.displayNotes(s, v).map(n=>n.text).join(',');
  check('mode ' + JSON.stringify(v) + ' falls back to latest-first', got === 'C,B,A', got);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail?1:0);
