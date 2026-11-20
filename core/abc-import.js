// abc-import.js - parse the ABC subset denting itself emits back into a song.
// Bounded on purpose: this covers the notation written by core/abc.js
// (songToAbc / songToAbcTunes) plus the simple single-voice tunes used in
// research/eval-description-to-seed.md. It is NOT a general ABC parser:
// no key-signature accidentals (accidentals must be inline, as the
// exporter writes them), no tuplets, repeats, grace notes, decorations,
// multiple tunes per text, or inline field changes. Unsupported constructs
// are collected in errors, never guessed at.
//
// What the conversion CANNOT carry (the .mid stays the source of truth):
// - velocity / loudness: imported notes get a fixed velocity of 96
// - program / instrument: imported melodic tracks get program 0
// - drum pitches: the exporter maps GM drum numbers to staff positions for
//   READING (display only, see abc.js DRUM_POS). Import maps each position
//   back to one fixed representative GM number (POS_TO_GM below). That is a
//   documented, lossy convention, not a recovery of the original pitches.
// - timing finer than the sixteenth-note grid the exporter quantizes to.

import { newSong, addTrack } from './model.js?v=0.4.19';

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DEFAULT_VELOCITY = 96;

// Reverse of the exporter's display positions, to representative GM drums.
const POS_TO_GM = {
  'F': 36, 'G': 41, 'A': 43, '^f': 37, 'c': 38, 'g': 42, 'a': 45,
  'b': 47, "c'": 48, "d'": 50, "c''": 49, 'd': 39,
};

function pitchToMidi(letters, errors, isDrums) {
  const m = /^([_^=]*)([A-Ga-g])([,']*)$/.exec(letters);
  if (!m) { errors.push('unsupported pitch: ' + letters); return null; }
  if (isDrums) {
    const gm = POS_TO_GM[m[1] + m[2] + m[3]];
    if (gm == null) { errors.push('unsupported drum position: ' + letters); return null; }
    return gm;
  }
  let pc = PC[m[2].toUpperCase()];
  for (const a of m[1]) pc += a === '^' ? 1 : a === '_' ? -1 : 0;
  let octave = m[2] === m[2].toLowerCase() ? 5 : 4;
  for (const o of m[3]) octave += o === "'" ? 1 : -1;
  const midi = 12 * (octave + 1) + pc;
  if (midi < 0 || midi > 127) { errors.push('pitch out of MIDI range: ' + letters); return null; }
  return midi;
}

// One body token: [chord] or single pitch or rest z, optional integer
// length (multiples of the L: unit only; fractions are unsupported),
// optional trailing tie '-'.
function parseToken(tok, errors, isDrums) {
  let tie = false;
  if (tok.endsWith('-')) { tie = true; tok = tok.slice(0, -1); }
  let head = tok, mult = 1;
  const lm = /(\d+)$/.exec(tok);
  if (lm) { mult = Number(lm[1]); head = tok.slice(0, -lm[1].length); }
  if (mult < 1) { errors.push('zero length in token: ' + tok); return null; }
  if (/\//.test(head)) { errors.push('fractional lengths unsupported: ' + tok); return null; }
  if (head === 'z' || head === 'Z') return { rest: true, mult, tie };
  let pitches = [];
  if (head.startsWith('[')) {
    if (!head.endsWith(']')) { errors.push('unclosed chord: ' + tok); return null; }
    const inner = head.slice(1, -1);
    const parts = inner.match(/[_^=]*[A-Ga-g][,']*/g) || [];
    if (parts.join('').length !== inner.length) { errors.push('unsupported chord contents: ' + tok); return null; }
    for (const p of parts) {
      const midi = pitchToMidi(p, errors, isDrums);
      if (midi == null) return null;
      pitches.push(midi);
    }
    if (!pitches.length) { errors.push('empty chord: ' + tok); return null; }
  } else {
    const pm = /^([_^=]*[A-Ga-g][,']*)$/.exec(head);
    if (!pm) { errors.push('unsupported token: ' + tok); return null; }
    const midi = pitchToMidi(pm[1], errors, isDrums);
    if (midi == null) return null;
    pitches.push(midi);
  }
  return { rest: false, pitches, head, mult, tie };
}

// Parse one ABC tune (the subset above) into a song.
// Returns { song, errors, stats }. Never throws on bad notation; problems
// land in errors and the affected token is skipped.
export function abcToSong(text, opts = {}) {
  const errors = [];
  const stats = { tracks: 0, notes: 0, chords: 0, ties: 0, rests: 0, bars: 0, skipped: 0 };
  const song = newSong({ ticksPerBeat: opts.ticksPerBeat || 480 });

  let unitDenom = 16; // L:1/16, the exporter's unit
  let sawBody = false;
  let track = null;
  let cursor = 0; // in L: units
  let pending = null; // tied note group awaiting its continuation
  const noteLists = new Map(); // track -> notes[]

  const flushTie = () => { pending = null; };
  const place = (parsed) => {
    if (parsed.rest) {
      if (parsed.tie) errors.push('tied rest unsupported');
      cursor += parsed.mult;
      stats.rests++;
      flushTie();
      return;
    }
    let dur = parsed.mult;
    if (pending && pending.track === track) {
      // tie continuation: extend the open notes whose pitch continues.
      // Pitches absent from the continuation simply end; pitches new in
      // the continuation start fresh. (The exporter's unequal-duration
      // chord segments rely on this per-pitch reading, e.g. [CEG]2-[CG]6.)
      const matched = pending.notes.filter(n => parsed.pitches.includes(n.pitch));
      if (matched.length) {
        matched.forEach(n => { n.duration += dur; });
        stats.ties++;
        const fresh = parsed.pitches
          .filter(p => !pending.notes.some(n => n.pitch === p))
          .map(pitch => {
            const n = { tick: 0, duration: dur, pitch, velocity: DEFAULT_VELOCITY, _u: cursor };
            noteLists.get(track).push(n);
            return n;
          });
        stats.notes += fresh.length;
        if (fresh.length && fresh.length + matched.length > 1) stats.chords++;
        pending = parsed.tie ? { head: parsed.head, notes: matched.concat(fresh), track } : null;
        cursor += dur;
        return;
      }
      errors.push('tie across different pitches (slur) unsupported: kept as separate notes');
    }
    const notes = parsed.pitches.map(pitch => {
      const n = { tick: 0, duration: dur, pitch, velocity: DEFAULT_VELOCITY, _u: cursor };
      noteLists.get(track).push(n);
      return n;
    });
    stats.notes += notes.length;
    if (notes.length > 1) stats.chords++;
    pending = parsed.tie ? { head: parsed.head, notes, track } : null;
    cursor += dur;
  };

  const lines = text.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const hm = /^([A-Za-z]):(.*)$/.exec(line);
    if (hm) {
      const field = hm[1], value = hm[2].trim();
      if (field === 'X') {
        if (sawBody) { errors.push('multiple tunes per text unsupported; only the first is parsed'); break; }
        continue;
      }
      if (field === 'T') { if (!song.purpose) song.purpose = value.slice(0, 80); continue; }
      if (field === 'M') {
        const mm = /^(\d+)\s*\/\s*(\d+)$/.exec(value);
        if (!mm) { errors.push('unsupported meter: ' + value); continue; }
        song.timeSignatures = [{ tick: 0, numerator: Number(mm[1]), denominator: Number(mm[2]) }];
        continue;
      }
      if (field === 'L') {
        const lmv = /^1\s*\/\s*(\d+)$/.exec(value);
        if (!lmv) { errors.push('unsupported unit length: ' + value); continue; }
        if (sawBody) { errors.push('L: change inside body unsupported'); continue; }
        unitDenom = Number(lmv[1]);
        continue;
      }
      if (field === 'Q') {
        const qm = /^1\/4\s*=\s*(\d+)$/.exec(value);
        if (!qm) { errors.push('unsupported tempo: ' + value); continue; }
        song.tempoMap = [{ tick: 0, bpm: Number(qm[1]) }];
        continue;
      }
      if (field === 'K') { sawBody = true; continue; } // key recorded nowhere; accidentals are inline
      if (field === 'V') {
        const nm = /name="([^"]*)"/.exec(value);
        const isDrums = /clef=perc/.test(value);
        track = addTrack(song, { name: nm ? nm[1] : value.split(/\s/)[0], program: 0, isDrums });
        noteLists.set(track, []);
        stats.tracks++;
        sawBody = true;
        pending = null;
        cursor = 0;
        continue;
      }
      if (sawBody) errors.push('inline field unsupported in body: ' + field + ':');
      continue;
    }
    // body line
    if (!sawBody) sawBody = true;
    if (!track) {
      track = addTrack(song, { name: 'melody', program: 0, isDrums: false });
      noteLists.set(track, []);
      stats.tracks++;
      cursor = 0;
    }
    for (const tok of line.split(/\s+/)) {
      if (!tok) continue;
      if (/^\|?\]?$/.test(tok) || /^\|:?$/.test(tok) || tok === ':|') {
        if (tok.includes('|')) stats.bars++;
        continue;
      }
      // barlines may be glued to notes (C4| or |C4); split them out
      const segs = tok.split('|');
      const pieces = segs.filter(s => s !== '');
      if (segs.length > 1) stats.bars += segs.length - 1;
      for (const piece of pieces) {
        // tied groups sit inside one token ("[CEG]2-[CG]2-C4"); every
        // inner segment but the last carries its tie, as does the last
        // when the piece itself ended with one ("C4-")
        const trailingTie = piece.endsWith('-');
        const linked = piece.split('-').filter(s => s !== '');
        for (let li = 0; li < linked.length; li++) {
          const part = linked[li] + (li < linked.length - 1 || trailingTie ? '-' : '');
          const parsed = parseToken(part, errors, track.isDrums);
          if (parsed) place(parsed); else stats.skipped++;
        }
      }
    }
  }

  // units -> ticks
  const unitTicks = (song.ticksPerBeat * 4) / unitDenom;
  for (const t of song.tracks) {
    t.notes = noteLists.get(t) || [];
    for (const n of t.notes) {
      n.tick = Math.round(n._u * unitTicks);
      n.duration = Math.max(1, Math.round(n.duration * unitTicks));
      delete n._u;
    }
  }
  return { song, errors, stats };
}
