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
  body + '\nreturn { parseTimecode, toClock, newSession, noteSeconds, markerNotes, buildMarkdown, rateById };'
)(require, Base, Base);
const R = (id) => F.rateById(id);

let pass=0, fail=0;
const check=(l,c,d)=>{ c?(pass++,console.log('  ok   '+l)):(fail++,console.log('  FAIL '+l+(d?'  -> '+d:''))); };

console.log('parseTimecode:');
const cases = [
  ['22:00', 1320], ['00:22:00', 1320], ['1:02:03', 3723], ['01:02:03', 3723],
  ['905', 905], ['0', 0], ['90:00', 5400], ['00:00:10:12', 10.48],
  ['', null], ['nonsense', null], ['12:ab', null], ['1:2:3:4:5', null], [null, null],
  ['  22:00  ', 1320],
];
for (const [input, want] of cases) {
  const got = F.parseTimecode(input, R('25'));
  check(JSON.stringify(input) + ' -> ' + want, got === want || (want !== null && Math.abs(got - want) < 1e-9), String(got));
}

console.log('\nretime keeps exports chronological:');
const s = F.newSession(-3);
s.startedAt = 1000000;
const mk = (tag, text, off) => s.notes.push({
  id:'n'+off, wallClock:'', keyDownAt: s.startedAt + off*1000, committedAt:0, tag, text, nudgeSec:0 });
mk('good','early',60);
mk('bad','middle',600);
mk('note','realised late, belongs at 22 min',1847);

// Reproduce what the view's retime() does to the last note.
const note = s.notes[2];
const target = 22*60;
note.nudgeSec = target - ((note.keyDownAt - s.startedAt)/1000 + s.offsetSec + s.leadSec);

check('retimed note resolves to exactly 22:00', F.noteSeconds(s, note) === 1320, String(F.noteSeconds(s, note)));

const stamps = F.markerNotes(s).map(r => F.toClock(r.sec));
console.log('  export order:', stamps.join('  '));
check('export still ascending', stamps.every((v,i,a)=> i===0 || a[i-1] <= v), stamps.join(','));
check('retimed note sorted into place', stamps[stamps.length-1] === '00:22:00', stamps.join(','));

// A later global offset must still move the retimed note with everything else.
s.offsetSec = 30;
check('retimed note follows the global offset', F.noteSeconds(s, note) === 1350, String(F.noteSeconds(s, note)));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail?1:0);
