// interop_tonejs.mjs - second independent receiver check.
// Parses an export with @tonejs/midi, an implementation that shares no
// code with our writer or with the Python mido check, and asserts the
// load-bearing structure an importing program would rely on.
// Usage: node tests/export-fixture.js /tmp/x.mid && node tests/interop_tonejs.mjs /tmp/x.mid
import pkg from '@tonejs/midi';
import { readFileSync } from 'fs';
const { Midi } = pkg;

const path = process.argv[2];
if (!path) { console.error('usage: node tests/interop_tonejs.mjs FILE.mid'); process.exit(2); }
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };

const m = new Midi(readFileSync(path));
ok(m.header.ppq === 480, 'ppq is 480, got ' + m.header.ppq);
ok(m.header.tempos.length === 2, 'two tempo points, got ' + m.header.tempos.length);
ok(Math.abs(m.header.tempos[0].bpm - 100) < 0.01 && m.header.tempos[0].ticks === 0, 'tempo 100 at tick 0');
ok(Math.abs(m.header.tempos[1].bpm - 90) < 0.01 && m.header.tempos[1].ticks === 1920, 'tempo 90 at tick 1920 (beat 4)');
const ts = m.header.timeSignatures[0];
ok(ts && ts.timeSignature[0] === 4 && ts.timeSignature[1] === 4, 'time signature 4/4');
const meta = m.header.meta || [];
ok(meta.some(x => x.type === 'text' && x.text.startsWith('purpose: ')), 'purpose text meta event present');
const marker = meta.find(x => x.type === 'marker');
ok(marker && marker.text === 'everyone looks at the stage' && marker.ticks === 1920, 'marker text at tick 1920');
ok(m.tracks.length === 2, 'two tracks, got ' + m.tracks.length);
const fan = m.tracks.find(t => t.name === 'fanfare'), gro = m.tracks.find(t => t.name === 'groove');
ok(!!fan && !!gro, 'track names fanfare and groove');
ok(gro && gro.channel === 9, 'drums on channel 9 (GM channel 10)');
ok(fan && fan.notes.length === 6 && fan.notes[0].ticks === 0 && fan.notes[0].durationTicks === 240, 'fanfare first note C at 0, half-beat');
ok(gro && gro.notes.length === 10 && gro.notes.every(n => n.ticks % 240 === 0), 'groove notes on the grid');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
