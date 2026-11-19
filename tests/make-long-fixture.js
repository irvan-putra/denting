// make-long-fixture.js - build a long, deliberately awkward piece for
// score/print testing: 32 bars, 4 parts, off-grid and tiny notes,
// long ties, chords, and a mid-piece tempo change.
import { newSong } from '../core/model.js';
import { writeSmf } from '../core/smf.js';
import { writeFileSync } from 'fs';

const song = newSong({ bpm: 100 });
song.purpose = 'long print-test piece';
const B = 480;
const mel = { name: 'melody', program: 0, isDrums: false, otherEvents: [], notes: [] };
for (let bar = 0; bar < 32; bar++) {
  const t = bar * 4 * B;
  // a scale run per bar; bar 5 has an off-grid 32nd note and a tiny note
  mel.notes.push({ tick: t, duration: B, pitch: 60 + (bar % 12), velocity: 90 });
  mel.notes.push({ tick: t + B, duration: B, pitch: 62 + (bar % 12), velocity: 90 });
  mel.notes.push({ tick: t + 2 * B, duration: B, pitch: 64 + (bar % 12), velocity: 90 });
  if (bar === 5) {
    mel.notes.push({ tick: t + 3 * B + 60, duration: 60, pitch: 79, velocity: 90 }); // off-grid 32nd
  } else {
    mel.notes.push({ tick: t + 3 * B, duration: B, pitch: 65 + (bar % 12), velocity: 90 });
  }
}
const pad = { name: 'pad', program: 48, isDrums: false, otherEvents: [], notes: [] };
for (let bar = 0; bar < 32; bar += 4) { // 4-bar tied chords
  for (const p of [48, 52, 55]) pad.notes.push({ tick: bar * 4 * B, duration: 4 * 4 * B, pitch: p + (bar % 3), velocity: 70 });
}
const bass = { name: 'bass', program: 33, isDrums: false, otherEvents: [], notes: [] };
for (let bar = 0; bar < 32; bar++) bass.notes.push({ tick: bar * 4 * B, duration: 2 * B, pitch: 36 + (bar % 5), velocity: 100 });
const drums = { name: 'drums', program: null, isDrums: true, otherEvents: [], notes: [] };
for (let bar = 0; bar < 32; bar++) for (let b = 0; b < 4; b++) {
  drums.notes.push({ tick: (bar * 4 + b) * B, duration: 120, pitch: 36, velocity: 110 });
  drums.notes.push({ tick: (bar * 4 + b) * B + B / 2, duration: 120, pitch: 42, velocity: 70 });
}
song.tracks.push(mel, pad, bass, drums);
song.tempoMap.push({ tick: 16 * 4 * B, bpm: 132 }); // tempo change at bar 17
song.markers.push({ tick: 16 * 4 * B, label: 'halfway lift' });
writeFileSync(process.argv[2] || 'tests/fixtures/long-piece.mid', writeSmf(song));
console.log('wrote', song.tracks.length, 'parts,', song.tracks.reduce((s, t) => s + t.notes.length, 0), 'notes');
