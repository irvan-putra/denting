// Node mirror of research/eval-local-model.html: same schema, cases, parsing.
import { pipeline } from '@huggingface/transformers';
const MODEL = process.argv[2];
const START = parseInt(process.argv[3] || '0', 10), COUNT = parseInt(process.argv[4] || '16', 10);
const SCHEMA = `You convert a music edit request into JSON only, no other text.
Schema: {"op": one of "transpose","louder","softer","faster","slower","tempo","none",
"track": "all" or a part name, "fromBeat": integer or null, "toBeat": integer or null,
"amount": integer semitones or null, "bpm": integer or null}
Use op "none" when the request is not a note/tempo edit of existing music.`;
const CASES = [
  { q: 'make the drums louder', op: 'louder', track: 'drums' },
  { q: 'softer please', op: 'softer' },
  { q: 'transpose up 2', op: 'transpose', amount: 2 },
  { q: 'make it faster', op: 'faster' },
  { q: 'set it to 90 bpm', op: 'tempo', bpm: 90 },
  { q: 'only the bass, louder', op: 'louder', track: 'bass' },
  { q: 'slow down', op: 'slower' },
  { q: 'transpose beat 3 down 1', op: 'transpose', amount: -1, fromBeat: 3 },
  { q: 'the melody is too high, bring it down', op: 'transpose', track: 'melody' },
  { q: 'make beats 4 to 8 softer', op: 'softer', fromBeat: 4, toBeat: 8 },
  { q: 'make it sound like rain on a tin roof', op: 'none' },
  { q: 'add a saxophone solo', op: 'none' },
  { q: 'compose a new chorus', op: 'none' },
  { q: 'what key is this in?', op: 'none' },
  { q: 'make it more emotional', op: 'none' },
  { q: 'change the lyrics', op: 'none' },
];
const t0 = performance.now();
const gen = await pipeline('text-generation', MODEL, { dtype: 'q4' });
const loadMs = Math.round(performance.now() - t0);
for (let i = START; i < Math.min(START + COUNT, CASES.length); i++) {
  const c = CASES[i];
  const tq = performance.now();
  const r = await gen([{ role: 'system', content: SCHEMA }, { role: 'user', content: c.q }],
    { max_new_tokens: 160, do_sample: false });
  const ms = Math.round(performance.now() - tq);
  const text = r[0].generated_text.at(-1).content.trim();
  let parsed = null;
  for (const m of text.match(/\{[^{}]*\}/g) || []) { try { parsed = JSON.parse(m); break; } catch (e) {} }
  const fields = {};
  for (const k of ['track', 'amount', 'bpm', 'fromBeat', 'toBeat'])
    if (c[k] !== undefined) fields[k] = { want: c[k], got: parsed ? parsed[k] ?? null : null, good: !!(parsed && parsed[k] === c[k]) };
  console.log('RESULT ' + JSON.stringify({ i, q: c.q, wantOp: c.op, parsed, opGood: !!(parsed && parsed.op === c.op), fields, ms, raw: text.slice(0, 400) }));
}
console.log('META ' + JSON.stringify({ model: MODEL, runtime: 'node/onnxruntime-node CPU', loadMs }));
