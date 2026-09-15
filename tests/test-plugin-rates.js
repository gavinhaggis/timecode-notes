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
  body + '\nreturn { RATES, rateById, toTimecode, toFrames, framesToTimecode, parseTimecode, newSession, buildFcpXml, buildMarkdown, DEFAULT_SETTINGS };'
)(require, Base, Base);

let pass=0, fail=0;
const check=(l,c,d)=>{ c?(pass++,console.log('  ok   '+l)):(fail++,console.log('  FAIL '+l+(d?'  -> '+d:''))); };
const R = F.rateById;

console.log('plugin rate engine matches the web app:');
check('25 1h',        F.toTimecode(3600, R('25')) === '01:00:00:00', F.toTimecode(3600, R('25')));
check('29.97 1h frames', F.toFrames(3600, R('29.97')) === 107892, String(F.toFrames(3600, R('29.97'))));
check('DF frame 1800', F.framesToTimecode(1800, R('29.97df')) === '00:01:00;02', F.framesToTimecode(1800, R('29.97df')));
check('DF frame 17982',F.framesToTimecode(17982, R('29.97df')) === '00:10:00;00', F.framesToTimecode(17982, R('29.97df')));
check('59.94 DF 3600', F.framesToTimecode(3600, R('59.94df')) === '00:01:00;04', F.framesToTimecode(3600, R('59.94df')));
check('default rate is 25', F.DEFAULT_SETTINGS.rateId === '25', F.DEFAULT_SETTINGS.rateId);
check('unknown id -> 25', R('nope').id === '25', R('nope').id);

console.log('\nparseTimecode uses the rate for frames:');
check('"00:00:10:12" @25 = 10.48', Math.abs(F.parseTimecode('00:00:10:12', R('25')) - 10.48) < 1e-9,
      String(F.parseTimecode('00:00:10:12', R('25'))));
check('"22:00" = 1320 regardless of rate', F.parseTimecode('22:00', R('29.97df')) === 1320,
      String(F.parseTimecode('22:00', R('29.97df'))));

console.log('\nXML carries the right rate metadata:');
const s = F.newSession(-3);
s.startedAt = 1000;
s.notes.push({ id:'a', wallClock:'', keyDownAt: 1000 + 3600000, committedAt:0, tag:'good', text:'x', nudgeSec:3 });
const xml2997 = F.buildFcpXml(s, R('29.97df'));
check('ntsc TRUE for 29.97', xml2997.includes('<ntsc>TRUE</ntsc>'));
check('timebase 30 for 29.97', xml2997.includes('<timebase>30</timebase>'));
check('displayformat DF', xml2997.includes('<displayformat>DF</displayformat>'));
check('marker frame = 107892', xml2997.includes('<in>107892</in>'),
      (xml2997.match(/<in>\d+<\/in>/)||[])[0]);

const xml25 = F.buildFcpXml(s, R('25'));
check('ntsc FALSE for 25', xml25.includes('<ntsc>FALSE</ntsc>'));
check('displayformat NDF for 25', xml25.includes('<displayformat>NDF</displayformat>'));
check('marker frame = 90000 at 25', xml25.includes('<in>90000</in>'),
      (xml25.match(/<in>\d+<\/in>/)||[])[0]);

console.log('\nmarkdown carries frame-accurate timecode:');
const md = F.buildMarkdown(s, R('29.97df'));
check('markdown shows DF stamp', /`01:00:00;00`/.test(md), md.split('\n').find(l=>l.startsWith('- `')));
check('markdown names the rate', md.includes('29.97 drop-frame'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail?1:0);
