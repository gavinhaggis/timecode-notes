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
const body = src.replace(/^'use strict';/m,'')
  .replace(/const \{ Plugin[^;]+;/,'')
  .replace(/module\.exports = class[\s\S]*$/,'');
const F = new Function('require','ItemView','PluginSettingTab',
  body + '\nreturn { newSession, sortedNotes, markerNotes, buildMarkdown, buildFcpXml, noteSeconds, rateById };'
)(require, Base, Base);
const R = (id) => F.rateById(id);

const s = F.newSession(-3);
s.title = 'Order test';
s.startedAt = 1000000;
const mk = (tag, text, off) => s.notes.push({
  id: 'n'+off, wallClock:new Date(s.startedAt+off*1000).toISOString(),
  keyDownAt: s.startedAt + off*1000, committedAt:0, tag, text, nudgeSec:0 });

mk('good','first thing',10);
mk('ng','second thing',65);
mk('prod','a production note',200);
mk('broll','third thing',400);
mk('question','last thing',900);

let pass=0, fail=0;
const check=(l,c,d)=>{ c?(pass++,console.log('  ok   '+l)):(fail++,console.log('  FAIL '+l+(d?'  -> '+d:''))); };

// Snapshot the underlying store before any display work.
const idsBefore = s.notes.map(n => n.id).join(',');

// Simulate exactly what the view does for display.
const display = F.sortedNotes(s).reverse();
console.log('display order (what the panel shows):');
display.forEach(n => console.log('   ', n.text || '(' + n.tag + ')'));

check('newest is at the top', display[0].text === 'last thing', display[0].text);
check('oldest is at the bottom', display[display.length-1].text === 'first thing', display[display.length-1].text);
check('underlying s.notes NOT mutated', s.notes.map(n=>n.id).join(',') === idsBefore);

// Exports must still run oldest -> newest.
const md = F.buildMarkdown(s, R('25'));
const stamps = [...md.matchAll(/`(\d\d:\d\d:\d\d[:;]\d\d)`/g)].map(m => m[1]);
console.log('\nmarkdown stamps:', stamps.join('  '));
const ascending = stamps.every((v,i,a) => i===0 || a[i-1] <= v);
check('markdown is chronological', ascending, stamps.join(','));
check('markdown starts with the earliest', stamps[0] === '00:00:07:00', stamps[0]);

const xml = F.buildFcpXml(s, R('25'));
const frames = [...xml.matchAll(/<in>(\d+)<\/in>/g)].map(m => +m[1]);
console.log('xml frames    :', frames.join('  '));
check('xml frames ascending', frames.every((v,i,a)=> i===0 || a[i-1] <= v), frames.join(','));

// And do it again, to catch order that only breaks on a second render.
const display2 = F.sortedNotes(s).reverse();
check('second render is stable', display2[0].text === 'last thing', display2[0].text);
const md2 = F.buildMarkdown(s, R('25'));
check('export unchanged after two renders', md2 === md);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail?1:0);
