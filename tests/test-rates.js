// Pull the rate engine straight out of the single-file app.
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'),'utf8');
const js = html.slice(html.indexOf('<script>')+8, html.lastIndexOf('</script>'));
// Take the self-contained region from the rate table up to the first DOM use.
const body = js.slice(js.indexOf('var RATES'), js.indexOf('var el = {};'));
const F = new Function('localStorage',
  body + '\nreturn { RATES, rateById, toTimecode, toFrames, framesToTimecode };')({ getItem: () => null, setItem: () => {} });

let pass=0, fail=0;
const check=(l,c,d)=>{ c?(pass++,console.log('  ok   '+l)):(fail++,console.log('  FAIL '+l+(d?'  -> '+d:''))); };

const R = (id) => F.rateById(id);

console.log('non-drop rates:');
check('25fps 1h',      F.toTimecode(3600, R('25')) === '01:00:00:00', F.toTimecode(3600, R('25')));
check('25fps 3722.4s', F.toTimecode(3722.4, R('25')) === '01:02:02:10', F.toTimecode(3722.4, R('25')));
check('24fps 1h',      F.toTimecode(3600, R('24')) === '01:00:00:00', F.toTimecode(3600, R('24')));
check('60fps 10.5s',   F.toTimecode(10.5, R('60')) === '00:00:10:30', F.toTimecode(10.5, R('60')));

console.log('\nNTSC frame counts (1000/1001):');
// 1 hour of real time at 23.976 is 86313.6 frames, not 86400.
check('23.976 1h frames = 86314', F.toFrames(3600, R('23.976')) === 86314, String(F.toFrames(3600, R('23.976'))));
check('29.97 1h frames  = 107892', F.toFrames(3600, R('29.97')) === 107892, String(F.toFrames(3600, R('29.97'))));
check('29.97 10min      = 17982',  F.toFrames(600,  R('29.97')) === 17982,  String(F.toFrames(600, R('29.97'))));

console.log('\ndrop-frame labels (reference values):');
const df = R('29.97df');
const dfAt = (frames) => F.framesToTimecode(frames, df);
// The defining property: the frame that WOULD be 00:01:00;00 (frame 1800) is
// labelled ;02 instead, because labels ;00 and ;01 are skipped at each minute.
check('frame 0      -> 00:00:00;00', dfAt(0) === '00:00:00;00', dfAt(0));
check('frame 1800   -> 00:01:00;02', dfAt(1800) === '00:01:00;02', dfAt(1800));
check('frame 1798   -> 00:00:59;28', dfAt(1798) === '00:00:59;28', dfAt(1798));
check('no label is skipped on minute 10', dfAt(17982) === '00:10:00;00', dfAt(17982));
check('frame 17982  -> 00:10:00;00', dfAt(17982) === '00:10:00;00', dfAt(17982));
check('frame 107892 -> 01:00:00;00', dfAt(107892) === '01:00:00;00', dfAt(107892));
check('uses a semicolon', dfAt(1798).includes(';'));

// Drop-frame tracks wall clock; non-drop drifts. That is the whole point.
const oneHourFrames = F.toFrames(3600, R('29.97'));
console.log('\n  1h real time at 29.97:');
console.log('    drop-frame     ', F.framesToTimecode(oneHourFrames, R('29.97df')));
console.log('    non-drop       ', F.framesToTimecode(oneHourFrames, R('29.97')));
check('DF reads 01:00:00;00 after 1h', F.framesToTimecode(oneHourFrames, R('29.97df')) === '01:00:00;00');
check('NDF has drifted (not 01:00:00)', !F.framesToTimecode(oneHourFrames, R('29.97')).startsWith('01:00:00'),
      F.framesToTimecode(oneHourFrames, R('29.97')));

const df60 = R('59.94df');
check('59.94 DF drops 4/min: frame 3600 -> 00:01:00;04',
      F.framesToTimecode(3600, df60) === '00:01:00;04', F.framesToTimecode(3600, df60));

console.log('\nrate lookup:');
check('unknown id falls back to 25', F.rateById('nope').id === '25', F.rateById('nope').id);
check('all 9 rates present', F.RATES.length === 9, String(F.RATES.length));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail?1:0);
