// Stub the obsidian module so main.js can be loaded outside the app.
const Module = require('module');
const origResolve = Module._resolveFilename;
class Fake { constructor() {} }
const stub = {
  Plugin: Fake, ItemView: Fake, Notice: Fake, MarkdownView: Fake,
  PluginSettingTab: Fake, Setting: Fake
};
Module._resolveFilename = function (request, ...rest) {
  if (request === 'obsidian') return 'obsidian-stub';
  return origResolve.call(this, request, ...rest);
};
require.cache['obsidian-stub'] = { id: 'obsidian-stub', filename: 'obsidian-stub', loaded: true, exports: stub };

const PluginClass = require(require('path').join(__dirname, '..', 'obsidian', 'timecode-notes', 'main.js'));
console.log('loaded plugin class:', typeof PluginClass === 'function' ? 'ok' : 'FAIL');

// Rebuild the same fixture the web app was verified with, by reaching into
// the module's own source for the pure helpers.
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'obsidian', 'timecode-notes', 'main.js'), 'utf8');
const body = src
  .replace(/^'use strict';/m, '')
  .replace(/const \{ Plugin[^;]+;/, '')
  .replace(/module\.exports = class[\s\S]*$/, '');
const sandbox = new Function(
  'require', 'ItemView', 'PluginSettingTab',
  body + '\nreturn { toTimecode, toClock, toFrames, dateStamp, newSession, noteSeconds, markerNotes, buildMarkdown, buildFcpXml, TAGS, rateById };'
);
const F = sandbox(require, Fake, Fake);
const R = (id) => F.rateById(id);

// ---- timecode assertions ----
const cases = [
  [0, '00:00:00:00'], [7, '00:00:07:00'], [62, '00:01:02:00'],
  [597, '00:09:57:00'], [3722.4, '01:02:02:10'], [3997, '01:06:37:00']
];
let pass = 0;
for (const [sec, want] of cases) {
  const got = F.toTimecode(sec, R('25'));
  if (got !== want) console.log(`FAIL toTimecode(${sec}) = ${got}, want ${want}`);
  else pass++;
}
console.log(`timecode: ${pass}/${cases.length} pass`);

// 24fps sanity — frame remainder must follow the rate
console.log('24fps 3722.5s ->', F.toTimecode(3722.5, R('24')), '(expect 01:02:02:12)');
console.log('30fps 10.5s   ->', F.toTimecode(10.5, R('30')), '(expect 00:00:10:15)');

// ---- session + export ----
const s = F.newSession(-3);
s.title = '2026-09-15';
s.startedAt = 1000000;
const mk = (tag, text, off) => s.notes.push({
  id: 'n' + off, wallClock: new Date(s.startedAt + off * 1000).toISOString(),
  keyDownAt: s.startedAt + off * 1000, committedAt: 0, tag, text, nudgeSec: 0
});
mk('plain', 'good energy, use this one', 10);
mk('good', '', 65);
mk('good', 'lovely wide here', 200);
mk('ng', 'boom in shot', 600);
mk('prod', 'relight back wall tomorrow', 700);
mk('question', 'does this cut with the interview', 3725.4);

console.log('\nmarkers:', F.markerNotes(s).length, '(expect 5 — prod excluded)');
console.log('\n--- markdown ---\n' + F.buildMarkdown(s, R('25')));
const xml = F.buildFcpXml(s, R('25'));
console.log('--- xml <in> frames ---');
console.log(xml.match(/<in>\d+<\/in>/g).join(' '), '(expect 175 1550 4925 14925 93060)');
console.log('has take field:', /Take/.test(xml) || /take/.test(JSON.stringify(s.notes)));
console.log('well-formed-ish:', xml.startsWith('<?xml') && xml.trim().endsWith('</xmeml>'));
