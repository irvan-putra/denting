// seeds.js - material the product offers of its own.
// These fragments are original to denting: generic musical scaffolds
// (a cadence, a drum groove, a walking bass, a fanfare) written as note
// data for this project. No copied material, so the repo license covers
// them. The spec warns that shipped material must have clean terms;
// original-only is how denting keeps that promise.

function n(tick, duration, pitch, velocity = 96) { return { tick, duration, pitch, velocity }; }

// All fragments assume 480 ticks per beat; insertFragment scales ticks
// when a song uses a different resolution.
export const SEED_TICKS_PER_BEAT = 480;

const beat = 480;

export const SEEDS = [
  {
    kind: 'fragment', name: 'cadence', origin: 'denting',
    notes: [
      // I - IV - V - I in C, one chord per beat, right-hand style triads.
      n(0, beat, 48), n(0, beat, 52), n(0, beat, 55),
      n(beat, beat, 48), n(beat, beat, 53), n(beat, beat, 57),
      n(2 * beat, beat, 50), n(2 * beat, beat, 55), n(2 * beat, beat, 59),
      n(3 * beat, 2 * beat, 48, 104), n(3 * beat, 2 * beat, 52, 104), n(3 * beat, 2 * beat, 55, 104),
    ].map(x => ({ ...x, program: 0, isDrums: false, part: 'cadence' })),
  },
  {
    kind: 'fragment', name: 'groove', origin: 'denting',
    notes: (() => {
      const out = [];
      for (let b = 0; b < 4; b++) {
        out.push(n(b * beat, 120, 36, 110));            // kick on the beat
        out.push(n(b * beat + beat / 2, 120, 42, 70));  // closed hihat on the and
        if (b % 2 === 1) out.push(n(b * beat, 120, 38, 100)); // snare on 2 and 4
      }
      return out;
    })().map(x => ({ ...x, program: null, isDrums: true, part: 'groove' })),
  },
  {
    kind: 'fragment', name: 'walking bass', origin: 'denting',
    notes: [36, 40, 43, 45, 48, 45, 43, 40].map((p, i) => n(i * beat, beat, p, 88))
      .map(x => ({ ...x, program: 32, isDrums: false, part: 'walking bass' })),
  },
  {
    kind: 'fragment', name: 'fanfare', origin: 'denting',
    notes: [
      n(0, beat / 2, 60, 112), n(beat / 2, beat / 2, 64, 112),
      n(beat, beat / 2, 67, 112), n(1.5 * beat, beat, 72, 120),
      n(2.5 * beat, beat / 2, 67, 104), n(3 * beat, 2 * beat, 72, 120),
    ].map(x => ({ ...x, program: 56, isDrums: false, part: 'fanfare' })),
  },
];

export function seedLibrary(song) {
  song.libraryRefs = (song.libraryRefs || []).filter(f => f.origin !== 'denting');
  for (const s of SEEDS) song.libraryRefs.push({ ...s, savedAt: null });
  return song;
}
