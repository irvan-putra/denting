// abc.js - turn the song into ABC notation for the score view.
// This is a QUANTIZED picture of the notes: everything is snapped to a
// sixteenth-note grid, one voice per part, and loudness, articulation and
// controller data are not shown. The .mid file stays the source of truth;
// the score is a reading aid, not a re-engraving.

const NAMES = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];

// ABC pitch: middle C (MIDI 60) is "C". Up an octave: lowercase, then '.
// Down: ",". Accidentals inline, so K:C is always safe.
export function pitchToAbc(midi) {
  const name = NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1; // C4 = 60 -> 4
  if (octave === 4) return name;
  if (octave >= 5) return name.toLowerCase() + "'".repeat(octave - 5);
  return name + ','.repeat(4 - octave);
}

function lenStr(units) {
  // length in 1/16 units as an ABC length suffix
  return units === 1 ? '' : String(units);
}

// Display positions for drums on the percussion clef (GM numbers to
// standard staff positions; display only - the .mid keeps the real pitches).
const DRUM_POS = { 35: 'F', 36: 'F', 41: 'G', 43: 'A', 38: 'c', 40: 'c',
  37: '^f', 42: 'g', 44: 'g', 46: 'g', 45: 'a', 47: 'b', 48: "c'", 50: "d'",
  49: "c''", 52: "c''", 55: "c''", 57: "a'", 51: "d'", 59: "d'", 39: 'd', 56: 'd' };

export function drumToAbc(midi) {
  if (DRUM_POS[midi]) return DRUM_POS[midi];
  // nearest mapped pitch, then its position
  const keys = Object.keys(DRUM_POS).map(Number);
  const near = keys.reduce((a, b) => Math.abs(b - midi) < Math.abs(a - midi) ? b : a);
  return DRUM_POS[near];
}

// Choose a clef from what the part actually plays.
export function clefFor(track) {
  if (track.isDrums) return 'perc';
  if (!track.notes.length) return 'treble';
  const avg = track.notes.reduce((s, n) => s + n.pitch, 0) / track.notes.length;
  return avg < 55 ? 'bass' : 'treble';
}

// One part's notes -> a list of ABC event strings ('|' at barlines),
// quantized to the grid. Chords become [CEG]; notes crossing a barline
// are split and tied. Two single-voice honesty rules for dense harmony:
// - chord members with unequal durations are split into tied segments
//   ("[CEG]2-[CG]6": C and G keep ringing after E stops), so no member
//   silently takes another's length;
// - a note still sounding when the next attack starts is written only up
//   to that attack (one voice cannot overlap); the .mid keeps the full
//   sustain. This keeps every later attack at its true position instead
//   of letting the overlap shift the rest of the line.
export function partToAbc(song, track) {
  const grid = Math.round(song.ticksPerBeat / 4); // one 1/16 in ticks
  const sig = song.timeSignatures[0] || { numerator: 4, denominator: 4 };
  const barUnits = sig.numerator * (16 / sig.denominator); // 1/16s per bar
  const events = [];
  const byStart = new Map();
  for (const n of track.notes) {
    const start = Math.round(n.tick / grid);
    if (!byStart.has(start)) byStart.set(start, []);
    byStart.get(start).push(n);
  }
  const starts = [...byStart.keys()].sort((a, b) => a - b);
  let cursor = 0; // in grid units
  for (let si = 0; si < starts.length; si++) {
    const start = starts[si];
    if (start > cursor) {
      // rest(s) for the gap, broken at barlines
      let gap = start - cursor;
      while (gap > 0) {
        const toBar = barUnits - (cursor % barUnits);
        const step = Math.min(gap, toBar);
        events.push('z' + lenStr(step));
        cursor += step; gap -= step;
        if (cursor % barUnits === 0) events.push('|');
      }
    }
    const chord = byStart.get(start).slice().sort((a, b) => a.pitch - b.pitch);
    const toSym = track.isDrums ? drumToAbc : pitchToAbc;
    // Written durations, capped at the next attack (second rule above).
    const nextGap = si + 1 < starts.length ? starts[si + 1] - start : Infinity;
    const durs = chord.map(n => Math.min(Math.max(1, Math.round(n.duration / grid)), nextGap));
    const total = Math.max(...durs);
    // Split the span at every member's end: each segment holds the
    // members still sounding, tied on from the previous segment.
    const bounds = [...new Set(durs)].sort((a, b) => a - b);
    const atoms = []; // { head, len } sequential segments of this chord
    let prev = 0;
    for (const b of bounds) {
      const active = chord.filter((n, i) => durs[i] >= b).map(n => toSym(n.pitch));
      const uniq = [...new Set(active)]; // drums can share a display position
      atoms.push({ head: uniq.length > 1 ? '[' + uniq.join('') + ']' : uniq[0], len: b - prev });
      prev = b;
    }
    // Split the whole span at barlines. Tied pieces carry their barlines
    // inside the join ("C4-|C4"), so every crossed bar still gets its own
    // bar entry downstream.
    const parts = []; // written note tokens in order
    const ends = [];  // absolute grid position where each token ends
    let pos = 0;
    for (const atom of atoms) {
      let left = atom.len;
      while (left > 0) {
        const toBar = barUnits - ((start + pos) % barUnits);
        const step = Math.min(left, toBar);
        parts.push(atom.head + lenStr(step));
        pos += step;
        ends.push(start + pos);
        left -= step;
      }
    }
    let text = parts[0];
    let internal = 0; // barlines already emitted between tokens
    for (let i = 1; i < parts.length; i++) {
      if (ends[i - 1] % barUnits === 0) { text += '-|'; internal++; }
      else text += '-';
      text += parts[i];
    }
    events.push(text);
    cursor = start + total;
    const crossed = Math.floor(cursor / barUnits) - Math.floor(start / barUnits);
    for (let i = internal; i < crossed; i++) events.push('|');
  }
  return events;
}

// Split one part's event list into one string per bar, so the score can
// be printed in chunks (a single tall SVG does not paginate when
// printing; separate tunes per bar-group do).
export function partToAbcBars(song, track) {
  const sig = song.timeSignatures[0] || { numerator: 4, denominator: 4 };
  const barUnits = sig.numerator * (16 / sig.denominator);
  const events = partToAbc(song, track);
  // Split every token on barlines; each segment belongs to its own bar.
  const bars = [[]];
  for (const ev of events) {
    const segments = ev.split('|');
    segments.forEach((seg, i) => {
      if (i > 0) bars.push([]);
      if (seg) bars[bars.length - 1].push(seg);
    });
  }
  // A piece ending exactly on a barline leaves a trailing empty segment;
  // drop it. A truly empty bar inside the range shows a full rest.
  if (bars.length > 1 && bars[bars.length - 1].length === 0) bars.pop();
  return bars.map(b => b.join(' ') || 'z' + barUnits);
}

function header(song, x, withTitle) {
  const sig = song.timeSignatures[0] || { numerator: 4, denominator: 4 };
  const bpm = Math.round((song.tempoMap[0] ? song.tempoMap[0].bpm : 120));
  const title = (song.purpose || 'untitled').replace(/[\n\r:]/g, ' ').slice(0, 80);
  const lines = ['X:' + x];
  if (withTitle) lines.push('T:' + title);
  lines.push('M:' + sig.numerator + '/' + sig.denominator, 'L:1/16', 'Q:1/4=' + bpm, 'K:C');
  return lines;
}

// The score as a list of ABC tunes, each covering barCount bars of every
// part. One tune for short pieces; several for long ones so printing can
// paginate between them. A note tied across a chunk boundary displays as
// two untied written notes (the .mid stays the source of truth).
export function songToAbcTunes(song, barCount = 2) {
  const sig = song.timeSignatures[0] || { numerator: 4, denominator: 4 };
  const barUnits = sig.numerator * (16 / sig.denominator);
  const perPart = song.tracks.map(t => partToAbcBars(song, t));
  const total = Math.max(1, ...perPart.map(b => b.length));
  // parts that end early still get their staff in later chunks
  for (const b of perPart) while (b.length < total) b.push('z' + barUnits);
  const tunes = [];
  for (let from = 0; from < total; from += barCount) {
    const lines = header(song, tunes.length + 1, tunes.length === 0);
    song.tracks.forEach((t, i) => {
      const id = (t.name || 'part').replace(/[^A-Za-z0-9]/g, '_');
      lines.push('V:' + id + ' name="' + (t.name || 'part').replace(/"/g, "'") + '" clef=' + clefFor(t));
      const slice = perPart[i].slice(from, from + barCount);
      if (slice.length) slice[slice.length - 1] = slice[slice.length - 1].replace(/-$/, '');
      lines.push(slice.join(' | ') + (slice.length ? ' |' : ''));
    });
    tunes.push(lines.join('\n') + '\n');
  }
  return tunes;
}

// Single-tune form (short pieces, tests, exports of the text).
export function songToAbc(song) {
  return songToAbcTunes(song, 1000000)[0];
}
