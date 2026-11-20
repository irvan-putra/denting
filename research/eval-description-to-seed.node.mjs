// Bounded description-to-seed evaluation, companion to
// research/eval-description-to-seed.md (fixed prompts and rubric).
// Deterministic checks only; occasion-fit judgment is out of scope here.
import { pipeline, env } from '@huggingface/transformers';
env.allowRemoteModels = false;
env.localModelPath = new URL('./models/', import.meta.url).pathname;
const MODEL = process.argv[2] || 'SmolLM2-360M-Instruct-ONNX';
const START = parseInt(process.argv[3] || '0', 10), COUNT = parseInt(process.argv[4] || '10', 10);
const FEWSHOT = process.argv[5] === 'fewshot';
const SYSTEM = (process.argv[5] === 'fewshot'
  ? 'You write ABC notation for short melodies. Reply with ONE ABC tune only, no other text. Example reply for "a happy 2-bar tune in 4/4 at 100 bpm in C major":\nX: 1\nT: Happy tune\nM: 4/4\nL: 1/4\nQ: 1/4=100\nK: C major\nC E G c | c G E C |]\nNow the tune. The tune must have header lines X:, T:, M:, L:, Q:, K: and then the notes.'
  : 'You write ABC notation for short melodies. Reply with ONE ABC tune only, no other text. The tune must have header lines X:, T:, M:, L:, Q:, K: and then the notes.');
const CASES = [
  { q: 'A birthday tune for my niece, 8 bars, 4/4, around 120 bpm, cheerful, range within one octave starting at middle C.', m: '4/4', qpm: 120, bars: 8, minMidi: 60, maxMidi: 72 },
  { q: 'A calm lullaby, 4 bars, 3/4, slow (about 70 bpm), no note lower than G below middle C.', m: '3/4', qpm: 70, bars: 4, minMidi: 55 },
  { q: 'A heroic fanfare, 4 bars, 4/4, fast (about 140 bpm), mostly short notes.', m: '4/4', qpm: 140, bars: 4 },
  { q: 'A walking bass line, 8 bars, 4/4, about 100 bpm, quarter notes only, in C major.', m: '4/4', qpm: 100, bars: 8, quartersOnly: true },
  { q: 'A sad two-bar phrase, 4/4, about 60 bpm, ending on the keynote.', m: '4/4', qpm: 60, bars: 2, endsOnTonic: true },
  { q: "A playful children's song, 8 bars, 2/4, about 110 bpm, only the white keys of C major.", m: '2/4', qpm: 110, bars: 8, whiteKeys: true, keyC: true },
  { q: 'Make me a full orchestral symphony.', decline: true },
  { q: 'An 8-bar tune in 4/4 where every bar has 5 beats.', decline: true },
  { q: 'A song that sounds exactly like Balonku but different.', decline: true },
  { q: 'Something my grandmother will love.', decline: true },
];
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function extractTune(text) {
  const lines = text.replace(/```[a-z]*/gi, '').split('\n');
  const xi = lines.findIndex(l => /^\s*X\s*:/.test(l));
  if (xi < 0) return null;
  const hdr = {}; let ki = -1;
  for (let i = xi; i < lines.length; i++) {
    const mm = lines[i].match(/^\s*([A-Za-z])\s*:\s*(.*)$/);
    if (mm) { hdr[mm[1].toUpperCase()] = mm[2].trim(); if (mm[1].toUpperCase() === 'K') { ki = i; break; } }
  }
  if (ki < 0) return null;
  const bodyLines = [];
  for (let i = ki + 1; i < lines.length; i++) {
    if (/^\s*$/.test(lines[i]) && bodyLines.length) break;
    if (/^\s*[A-Za-z]\s*:/.test(lines[i])) continue; // late header
    if (/[^\w\s|:\[\](),'^=\/-]/.test(lines[i]) && bodyLines.length) break; // prose
    bodyLines.push(lines[i]);
  }
  return { hdr, body: bodyLines.join(' ') };
}
function parseNotes(body) {
  const s = body.replace(/\|]?|\[\d?|\]?|\(|\)/g, '').replace(/[|:\s]/g, '');
  const notes = []; let i = 0;
  const re = /(\^\^|__|\^|_|=)?([A-Ga-g])([',]*)(\d*\/?\d*)/y;
  while (i < s.length) {
    re.lastIndex = i; const m = re.exec(s);
    if (!m || m.index !== i) return { ok: false, notes };
    i = re.lastIndex;
    const acc = m[1] === '^' ? 1 : m[1] === '^^' ? 2 : m[1] === '_' ? -1 : m[1] === '__' ? -2 : 0;
    let midi = 60 + PC[m[2].toUpperCase()] + acc;
    if (m[2] === m[2].toLowerCase()) midi += 12;
    for (const ch of m[3]) midi += ch === "'" ? 12 : -12;
    notes.push({ midi, pc: (midi % 12 + 12) % 12, len: m[4] || '' });
  }
  return { ok: notes.length >= 4, notes };
}
function barCount(body) {
  return body.split('|').map(x => x.replace(/[\[\]:]/g, '')).filter(x => /[A-Ga-g]/.test(x)).length;
}
function checkCase(c, tune) {
  const out = [];
  const ok = (n, v, x) => out.push({ n, v: !!v, x });
  if (c.decline) { ok('DECLINE (no tune emitted)', !tune); return out; }
  if (!tune) { ok('PARSE tune present', false, 'no ABC tune found'); return out; }
  ok('PARSE tune present', true);
  const { hdr, body } = tune;
  for (const h of ['T', 'M', 'L', 'Q', 'K']) ok('header ' + h, hdr[h] !== undefined, hdr[h]);
  if (c.m) ok('meter ' + c.m, (hdr.M || '').replace(/\s/g, '') === c.m, hdr.M);
  if (c.qpm) { const q = (hdr.Q || '').match(/(\d+)\s*$/); const got = q ? +q[1] : NaN; ok('tempo ~' + c.qpm, Math.abs(got - c.qpm) / c.qpm <= 0.1, hdr.Q); }
  if (c.bars) { const bc = barCount(body); ok('bars ' + c.bars, bc === c.bars, 'got ' + bc); }
  const p = parseNotes(body);
  ok('body tokenizes', p.ok, p.notes.length + ' notes');
  if (p.ok) {
    const midis = p.notes.map(n => n.midi);
    if (c.minMidi !== undefined) ok('min pitch >= ' + c.minMidi, Math.min(...midis) >= c.minMidi, 'min ' + Math.min(...midis));
    if (c.maxMidi !== undefined) ok('max pitch <= ' + c.maxMidi, Math.max(...midis) <= c.maxMidi, 'max ' + Math.max(...midis));
    if (c.quartersOnly) ok('quarter notes only', (hdr.L || '').replace(/\s/g, '') === '1/4' && p.notes.every(n => n.len === ''), 'L=' + hdr.L);
    if (c.whiteKeys) ok('no accidentals', p.notes.every(n => true) && !/[\^_=]/.test(body.replace(/[A-Za-z]:/g, '')));
    if (c.keyC) ok('key C', /^C/.test(hdr.K || ''), hdr.K);
    if (c.endsOnTonic) { const km = (hdr.K || '').match(/^([A-G])(#|b)?/); if (km) { let tonic = PC[km[1]] + (km[2] === '#' ? 1 : km[2] === 'b' ? -1 : 0); tonic = (tonic + 12) % 12; ok('ends on tonic', p.notes.at(-1).pc === tonic, 'last pc ' + p.notes.at(-1).pc + ' tonic ' + tonic); } }
  }
  return out;
}
const t0 = performance.now();
const gen = await pipeline('text-generation', MODEL, { dtype: 'q4', device: 'cpu' });
const loadMs = Math.round(performance.now() - t0);
for (let i = START; i < Math.min(START + COUNT, CASES.length); i++) {
  const c = CASES[i];
  const tq = performance.now();
  const r = await gen([{ role: 'system', content: SYSTEM }, { role: 'user', content: c.q }], { max_new_tokens: 288, do_sample: false });
  const ms = Math.round(performance.now() - tq);
  const text = r[0].generated_text.at(-1).content.trim();
  const tune = extractTune(text);
  const checks = checkCase(c, tune);
  console.log('RESULT ' + JSON.stringify({ i, q: c.q, pass: checks.every(x => x.v), checks, ms, raw: text.slice(0, 600) }));
}
console.log('META ' + JSON.stringify({ model: MODEL, slice: [START, COUNT], fewshot: FEWSHOT, runtime: 'node onnxruntime-node CPU', maxNewTokens: 288, decoding: 'greedy', loadMs }));
