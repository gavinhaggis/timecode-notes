/* Runs every test file and reports a single pass/fail.
 *   node tests/run.js
 * No dependencies — each test loads the app source directly and stubs the
 * bits of the browser and the Obsidian API that it needs. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname).filter((f) => /^test-.*\.js$/.test(f)).sort();
let failed = 0;

for (const file of files) {
  process.stdout.write(file.padEnd(24));
  try {
    execFileSync(process.execPath, [path.join(__dirname, file)], { stdio: 'pipe' });
    console.log('pass');
  } catch (err) {
    failed += 1;
    console.log('FAIL');
    console.log(String(err.stdout || '').split('\n').filter((l) => /FAIL/.test(l)).join('\n'));
  }
}

console.log(`\n${files.length - failed}/${files.length} files passed`);
process.exit(failed ? 1 : 0);
