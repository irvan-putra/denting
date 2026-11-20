// eval-abc-to-midi.node.mjs - verify core/abc-import.js (ABC -> song -> MIDI)
// against denting's own exporter (core/abc.js) and MIDI truth (core/smf.js).
//
// Corpus:
//   A: the 4 denting seed fragments (core/seeds.js), incl. chords and drums
//   B: tests/fixtures/long-piece.mid
//   C: files/balonku/*.mid (3 published exports)
//   D: the 6 in-scope few-shot tunes from the description-to-seed eval raw
//
// Two metrics per song item (A-C):
//   FIDELITY: reimported notes == quantized original notes (must be exact;
//     melodic tracks only - drum staves are display-only by design, see
//     abc-import.js header, and are reported separately)
//   DRIFT: quantized original vs raw original (informational: what the
//     sixteenth-note score grid itself moves, independent of the importer)
// Plus MIDI BYTES round trip: imported song -> writeSmf -> readSmf, compared
// note-for-note against the imported song.

import { readFileSync, readdirSync } from 'node:fs';
import { newSong, addTrack } from '../core/model.js';
import { readSmf, writeSmf } from '../core/smf.js';
import { songToAbc } from '../core/abc.js';
import { abcToSong } from '../core/abc-import.js';
import { SEEDS } from '../core/seeds.js';

const gridOf = song => Math.round(song.ticksPerBeat / 4);

function snap(song) {
  // the quantized picture the exporter draws: melodic tracks only
  const g = gridOf(song);
  const out = [];
  for (const t of song.tracks) {
    if (t.isDrums) continue;
    for (const n of t.notes) {
      out.push({
        tick: Math.round(n.tick / g) * g,
        duration: Math.max(1, Math.round(n.duration / g)) * g,
        pitch: n.pitch,
      });
    }
  }
  return out.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
}

function melodicNotes(song) {
  const out = [];
  for (const t of song.tracks) {
    if (t.isDrums) continue;
    for (const n of t.notes) out.push({ tick: n.tick, duration: n.duration, pitch: n.pitch });
  }
  return out.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
}

function rawNotes(song) {
  const out = [];
  for (const t of song.tracks) {
    if (t.isDrums) continue;
    for (const n of t.notes) out.push({ tick: n.tick, duration: n.duration, pitch: n.pitch });
  }
  return out;
}

function sameNotes(a, b) {
  let mismatches = 0;
  const n = Math.max(a.length, b.length);
  let first = '';
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    if (!x || !y || x.tick !== y.tick || x.duration !== y.duration || x.pitch !== y.pitch) {
      mismatches++;
      if (!first) first = !x || !y ? `count ${a.length} vs ${b.length}` : `note ${i}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`;
    }
  }
  return { same: mismatches === 0, why: first, mismatches };
}

function drumNoteCount(song) {
  return song.tracks.filter(t => t.isDrums).reduce((s, t) => s + t.notes.length, 0);
}

const results = [];

function checkSong(name, song) {
  const abc = songToAbc(song);
  const imp = abcToSong(abc);
  const errors = imp.errors;
  const fid = sameNotes(snap(song), melodicNotes(imp.song));
  // drift: raw vs snapped, counted per note index of the sorted snapped list
  const raw = rawNotes(song).sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
  const snapped = snap(song);
  let drifted = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].tick !== snapped[i].tick || raw[i].duration !== snapped[i].duration) drifted++;
  }
  // MIDI bytes round trip of the imported song
  const back = readSmf(writeSmf(imp.song));
  const midi = sameNotes(melodicNotes(imp.song), melodicNotes(back));
  // text fixed point: re-exporting the imported song must reproduce the
  // exact ABC text, even where the exporter itself was lossy
  const abc2 = songToAbc(imp.song);
  // chord-member duration collapse: chord events in the original whose
  // members have unequal durations (the score carries one duration per
  // chord event; affected notes are counted, not hidden)
  let collapsed = 0;
  for (const t of song.tracks) {
    if (t.isDrums) continue;
    const byStart = new Map();
    for (const n of t.notes) {
      if (!byStart.has(n.tick)) byStart.set(n.tick, []);
      byStart.get(n.tick).push(n);
    }
    for (const chord of byStart.values()) {
      if (chord.length < 2) continue;
      const durs = new Set(chord.map(n => n.duration));
      if (durs.size > 1) collapsed += chord.length - 1;
    }
  }
  const r = {
    name,
    tracks: song.tracks.length,
    melodicNotes: snapped.length,
    drumNotes: drumNoteCount(song),
    fidelity: fid.same, fidelityWhy: fid.why || '', fidelityMismatches: fid.mismatches,
    chordDurationCollapsed: collapsed,
    textFixedPoint: abc2 === abc,
    driftedNotes: drifted,
    midiRoundTrip: midi.same, midiWhy: midi.why || '',
    importErrors: errors,
  };
  results.push(r);
  console.log('ITEM ' + JSON.stringify(r));
}

// A: seeds
for (const seed of SEEDS) {
  const song = newSong({ bpm: 120, purpose: 'seed ' + seed.name });
  const first = seed.notes[0];
  const track = addTrack(song, { name: seed.name, program: first.isDrums ? 0 : (first.program || 0), isDrums: !!first.isDrums });
  for (const n of seed.notes) track.notes.push({ tick: n.tick, duration: n.duration, pitch: n.pitch, velocity: n.velocity });
  checkSong('seed:' + seed.name, song);
}

// B: long-piece fixture
checkSong('fixture:long-piece', readSmf(readFileSync('tests/fixtures/long-piece.mid')));

// C: balonku exports
for (const f of readdirSync('files/balonku').filter(f => f.endsWith('.mid'))) {
  checkSong('balonku:' + f, readSmf(readFileSync('files/balonku/' + f)));
}

// D: few-shot eval tunes (raw model output, read from the committed JSONL)
const rawLines = readFileSync('research/eval-description-to-seed-raw-2026-11-20.jsonl', 'utf8')
  .split('\n').filter(l => l.startsWith('RESULT '));
const fewShot = rawLines.slice(10, 20).map(l => JSON.parse(l.slice(7)));
for (const r of fewShot) {
  if (r.i > 5) continue; // in-scope only
  const m = /X:[\s\S]*?\|\]/m.exec(r.raw);
  if (!m) { console.log('SEEDCASE ' + JSON.stringify({ i: r.i, extracted: false })); continue; }
  const imp = abcToSong(m[0]);
  const notes = imp.song.tracks.flatMap(t => t.notes).sort((a, b) => a.tick - b.tick);
  const last = notes[notes.length - 1];
  const bars = (m[0].match(/\|/g) || []).length;
  console.log('SEEDCASE ' + JSON.stringify({
    i: r.i, extracted: true, errors: imp.errors,
    meter: imp.song.timeSignatures[0].numerator + '/' + imp.song.timeSignatures[0].denominator,
    bpm: imp.song.tempoMap[0].bpm,
    notes: notes.length, bars,
    minPitch: notes.length ? Math.min(...notes.map(n => n.pitch)) : null,
    maxPitch: notes.length ? Math.max(...notes.map(n => n.pitch)) : null,
    lastPitch: last ? last.pitch : null,
    midiRoundTrip: notes.length ? sameNotes(
      imp.song.tracks.flatMap(t => t.notes).map(n => ({ tick: n.tick, duration: n.duration, pitch: n.pitch })).sort((a, b) => a.tick - b.tick || a.pitch - b.pitch),
      melodicNotes(readSmf(writeSmf(imp.song)))).same : null,
  }));
}

const fails = results.filter(r => !r.fidelity || !r.midiRoundTrip || !r.textFixedPoint);
console.log('SUMMARY ' + JSON.stringify({
  items: results.length,
  fidelityExact: results.filter(r => r.fidelity).length,
  midiRoundTripExact: results.filter(r => r.midiRoundTrip).length,
  textFixedPointExact: results.filter(r => r.textFixedPoint).length,
  itemsWithImportErrors: results.filter(r => r.importErrors.length).length,
  totalDriftedNotes: results.reduce((s, r) => s + r.driftedNotes, 0),
  totalChordCollapsed: results.reduce((s, r) => s + r.chordDurationCollapsed, 0),
  failed: fails.map(r => r.name),
}));
