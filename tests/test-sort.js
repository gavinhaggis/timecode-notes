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
  body + '\nreturn { displayNotes, sortedNotes, markerNotes, buildMarkdown, newSession, noteSeconds, toClock, SORT_MODES };'
)(require, Base, Base);

let pass=0, fail=0;
const check=(l,c,d)=>{ c?(pass++,console.log('  ok   '+l)):(fail++,console.log('  FAIL '+l+(d?'  -> '+d:''))); };

const s = F.newSession(-3);
s.startedAt = 1000000;
const mk = (tag, text, off, nudge, untimed) => s.notes.push({
  id:'n'+off, wallClock:'', keyDownAt: s.startedAt + off*1000, committedAt:0,
  tag, text, nudgeSec: nudge || 0, untimed: !!untimed });

mk('good','A',63);            // 00:01:00
mk('bad','B',303);             // 00:05:00
mk('note','P',400, 0, true);  // untimed — taken before Start
mk('visual','C',723);          // 00:12:00
// typed last at 30 min, retimed back to 2 min
mk('note','D',1803, 120 - 1800);

const label = (n) => (n.text || '?') + '@' + (F.noteSeconds(s,n)===null ? 'untimed' : F.toClock(F.noteSeconds(s,n)));

const modes = {
  'capture-desc': ['D','C','P','B','A'],
  'capture-asc' : ['A','B','P','C','D'],
  'time-asc'    : ['A','D','B','C','P'],
  'time-desc'   : ['C','B','D','A','P'],
};
console.log('display modes:');
for (const [mode, want] of Object.entries(modes)) {
  const got = F.displayNotes(s, mode).map(n => n.text);
  console.log('  ' + mode.padEnd(13), F.displayNotes(s, mode).map(label).join('  '));
  check(mode + ' order', got.join(',') === want.join(','), got.join(','));
}

check('every mode is a named option', Object.keys(modes).every(m => m in F.SORT_MODES),
      Object.keys(F.SORT_MODES).join(','));

// An unknown / missing mode must not produce an empty or broken list.
const fallback = F.displayNotes(s, undefined).map(n => n.text);
check('undefined mode falls back to capture-desc', fallback.join(',') === 'D,C,P,B,A', fallback.join(','));

// Exports must be identical no matter what the display is doing.
console.log('\nexport independence:');
const baseline = F.buildMarkdown(s, 25);
let allSame = true;
for (const mode of Object.keys(modes)) {
  F.displayNotes(s, mode);                       // render in this mode
  if (F.buildMarkdown(s, 25) !== baseline) allSame = false;
}
check('markdown identical across all four modes', allSame);
const stamps = [...baseline.matchAll(/`(\d\d:\d\d:\d\d)`/g)].map(m=>m[1]);
console.log('  export stamps:', stamps.join('  '));
check('export chronological', stamps.every((v,i,a)=> i===0 || a[i-1] <= v), stamps.join(','));
check('underlying notes untouched', s.notes.map(n=>n.text).join(',') === 'A,B,P,C,D', s.notes.map(n=>n.text).join(','));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail?1:0);
