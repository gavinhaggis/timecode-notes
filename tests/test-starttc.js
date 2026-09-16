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
  body + '\nreturn { absSec, timeOfDaySec, toTimecode, toFrames, framesToTimecode, rateById, newSession, buildMarkdown, buildFcpXml, markerNotes };'
)(require, Base, Base);
const R = (id) => F.rateById(id);

let pass=0, fail=0;
const check=(l,c,d)=>{ c?(pass++,console.log('  ok   '+l)):(fail++,console.log('  FAIL '+l+(d?'  -> '+d:''))); };

console.log('timecode wraps at 24h rather than running past it:');
check('23:00 + 2h = 01:00:00:00', F.toTimecode(25*3600, R('25')) === '01:00:00:00', F.toTimecode(25*3600, R('25')));
check('exactly 24h = 00:00:00:00', F.toTimecode(24*3600, R('25')) === '00:00:00:00', F.toTimecode(24*3600, R('25')));

console.log('\ntime of day:');
const anchor = new Date(2026, 8, 16, 14, 32, 7, 0).getTime();
check('local reads 14:32:07', F.timeOfDaySec(anchor, false) === 14*3600+32*60+7, String(F.timeOfDaySec(anchor,false)));
const utcSec = F.timeOfDaySec(anchor, true);
check('UTC differs from local by a whole number of minutes',
      Math.abs(((F.timeOfDaySec(anchor,false) - utcSec) % 3600)) % 60 === 0, String(utcSec));

console.log('\nstart timecode shifts the right things:');
const s = F.newSession(-3);
s.startedAt = 1000;
s.startTcSec = 14*3600 + 32*60 + 7;     // 14:32:07
s.notes.push({ id:'a', wallClock:'', keyDownAt: 1000 + 63000, committedAt:0, tag:'good', text:'x', nudgeSec:0 });

check('absSec offsets by the start TC', F.absSec(s, 60) === s.startTcSec + 60);

const rate = R('25');
const md = F.buildMarkdown(s, rate);
check('markdown stamp is on the camera clock', md.includes('`14:33:07:00`'),
      md.split('\n').find(l => l.startsWith('- `')));

const xml = F.buildFcpXml(s, rate);
check('sequence start string = 14:32:07:00', xml.includes('<string>14:32:07:00</string>'),
      (xml.match(/<string>[^<]*<\/string>/)||[])[0]);
check('sequence start frame = 1308175', xml.includes('<frame>1308175</frame>'),
      (xml.match(/<frame>\d+<\/frame>/)||[])[0]);
check('marker <in> stays RELATIVE to the sequence (1500)', xml.includes('<in>1500</in>'),
      (xml.match(/<in>\d+<\/in>/)||[])[0]);

// Changing start TC must not move markers relative to each other.
const before = (F.buildFcpXml(s, rate).match(/<in>\d+<\/in>/g)||[]).join();
s.startTcSec = 0;
const after = (F.buildFcpXml(s, rate).match(/<in>\d+<\/in>/g)||[]).join();
check('marker frames unchanged when start TC changes', before === after, before + ' vs ' + after);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail?1:0);
