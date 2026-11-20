// score-chords.cjs - pixel + DOM verification for the unequal-duration
// chord fix (v0.4.19): load the dense-harmony Epic export and the clean
// Balonku example, render the real score, save screenshots, assert the
// ABC text carries tied segments and no error box appears.
const {chromium} = require('/usr/share/code/resources/app/node_modules/playwright-core');
const {spawn} = require('child_process');
const BASE = process.argv[2];
const SHOTS = process.argv[3] || '/tmp/score-chords';
const delay = ms => new Promise(r => setTimeout(r, ms));
let server = null;
(async () => {
  if (BASE.includes('127.0.0.1')) {
    server = spawn('python3', ['-m', 'http.server', '8140', '--bind', '127.0.0.1'], {cwd: process.env.HOME + '/denting', stdio: 'ignore'});
    await delay(900);
  }
  const b = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true});
  const p = await (await b.newContext({viewport: {width: 900, height: 1200}})).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept()); // replacing the loaded piece asks a confirm()
  const results = []; const ok = (n, c, x = '') => results.push((c ? 'PASS' : 'FAIL') + ' ' + n + (x ? ' :: ' + x : ''));

  await p.goto(BASE + '/?fresh=chords' + Date.now(), {waitUntil: 'networkidle'});
  ok('version is 0.4.19', (await p.locator('body').textContent()).includes('v0.4.19'));

  // dense harmony: Yoga's Epic export, uploaded through the real control
  await p.locator('#import').setInputFiles(process.env.HOME + '/denting/files/balonku/Balonku-Ada-Lima-Epic-Version.mid');
  await p.waitForFunction(() => document.querySelectorAll('#score svg').length > 0, null, {timeout: 20000});
  const svgCount = await p.locator('#score svg').count();
  ok('epic score rendered', svgCount > 0, svgCount + ' svg groups');
  ok('no score error box', !(await p.locator('#score').textContent()).includes('could not be drawn'));
  const text = await p.locator('#score').textContent();
  // abcjs keeps the ABC source in the rendered output title attr? No: check via DOM-free route below
  const abc = await p.evaluate(async () => {
    const {readSmf} = await import('./core/smf.js');
    const {songToAbc} = await import('./core/abc.js');
    const bytes = new Uint8Array(await (await fetch('files/balonku/Balonku-Ada-Lima-Epic-Version.mid')).arrayBuffer());
    return songToAbc(readSmf(bytes));
  });
  ok('epic abc carries tied chord segments', /\[[A-Ga-g,_^=']+\]\d*-\|?\[?[A-Ga-g,_^=']+\]?\d*/.test(abc), (abc.match(/\[[^\]]+\]\d*-\|?[^\s|]*/g) || []).slice(0, 3).join(' '));
  await p.locator('#scoreCard').screenshot({path: SHOTS + '-epic-top.png'});
  await p.locator('#score > div').nth(2).screenshot({path: SHOTS + '-epic-group3.png'});

  // regression: the clean Balonku example still renders identically shaped
  await p.locator('#loadExample').click();
  await p.waitForFunction(() => document.querySelector('#status').textContent.includes('Loaded Balonku example'), null, {timeout: 20000});
  await p.waitForFunction(() => document.querySelectorAll('#score svg').length > 0, null, {timeout: 20000});
  ok('example score rendered', (await p.locator('#score svg').count()) > 0);
  await p.locator('#scoreCard').screenshot({path: SHOTS + '-example.png'});

  ok('no page errors', errs.length === 0, errs.join('|'));
  console.log(results.join('\n'));
  await b.close(); if (server) server.kill();
  process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})().catch(e => {console.error('HARNESS FAIL', e); if (server) server.kill(); process.exit(2);});
