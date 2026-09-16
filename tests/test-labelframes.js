/* The conversion between a timecode LABEL and a frame count.
 * This only diverges from naive seconds-maths at the NTSC rates, which is
 * exactly where it used to be wrong. */
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const body = js.slice(js.indexOf('var RATES'), js.indexOf('var el = {};'));
const F = new Function('localStorage',
  body + '\nreturn { RATES, rateById, toFrames, framesToTimecode, labelSecToFrames, framesToClock };'
)({ getItem: () => null, setItem: () => {} });

let pass = 0, fail = 0;
const check = (l, c, d) => { c ? (pass++, console.log('  ok   ' + l))
                               : (fail++, console.log('  FAIL ' + l + (d ? '  -> ' + d : ''))); };
const R = F.rateById;
const hms = (h, m, s) => h * 3600 + m * 60 + s;

console.log('a time of day round-trips to the same label at every rate:');
for (const rate of F.RATES) {
  const label = hms(9, 46, 43);
  const frames = F.labelSecToFrames(label, rate);
  const back = F.framesToTimecode(frames, rate);
  check(`${rate.id.padEnd(8)} 09:46:43 -> ${back}`, back.startsWith('09:46:43'), back);
}

console.log('\nthe naive seconds conversion would have been wrong at NTSC:');
{
  const rate = R('29.97');                    // non-drop
  const label = hms(9, 46, 43);
  const correct = F.framesToTimecode(F.labelSecToFrames(label, rate), rate);
  const naive = F.framesToTimecode(F.toFrames(label, rate), rate);   // seconds x true fps
  console.log('    correct:', correct, '   naive:', naive);
  check('correct keeps the time of day', correct.startsWith('09:46:43'), correct);
  check('naive drifts (proving the fix matters)', !naive.startsWith('09:46:43'), naive);
}

console.log('\ndrop-frame inverse matches the forward renumbering:');
{
  const df = R('29.97df');
  check('00:10:00;00 -> frame 17982', F.labelSecToFrames(hms(0,10,0), df) === 17982,
        String(F.labelSecToFrames(hms(0,10,0), df)));
  check('01:00:00;00 -> frame 107892', F.labelSecToFrames(hms(1,0,0), df) === 107892,
        String(F.labelSecToFrames(hms(1,0,0), df)));
  check('00:00:00;00 -> frame 0', F.labelSecToFrames(0, df) === 0);

  // Exhaustive round-trip over the first two hours, every 7 seconds.
  let bad = null;
  for (let sec = 0; sec < 7200 && !bad; sec += 7) {
    const f = F.labelSecToFrames(sec, df);
    const lbl = F.framesToTimecode(f, df);
    const h = Math.floor(sec/3600), m = Math.floor(sec/60)%60, s = Math.floor(sec%60);
    const want = [h,m,s].map(n => (n<10?'0':'')+n).join(':');
    // A dropped label cannot be represented; those are the only allowed misses.
    const isDropped = (s === 0 && m % 10 !== 0);
    if (!lbl.startsWith(want) && !isDropped) bad = sec + ' -> ' + lbl + ' want ' + want;
  }
  check('round-trips across two hours of drop-frame', bad === null, bad);
}

console.log('\nadding elapsed time to a start timecode:');
{
  const rate = R('29.97');
  const start = F.labelSecToFrames(hms(10, 0, 0), rate);
  // One real hour later the FRAME count is 107892 further on.
  const after = start + F.toFrames(3600, rate);
  const label = F.framesToTimecode(after, rate);
  console.log('    10:00:00 + 1 real hour at 29.97 NDF =', label);
  check('non-drop visibly drifts from the wall clock over an hour',
        !label.startsWith('11:00:00'), label);

  const df = R('29.97df');
  const startDf = F.labelSecToFrames(hms(10, 0, 0), df);
  const afterDf = F.framesToTimecode(startDf + F.toFrames(3600, df), df);
  console.log('    10:00:00 + 1 real hour at 29.97 DF  =', afterDf);
  check('drop-frame stays on the wall clock', afterDf.startsWith('11:00:00'), afterDf);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
