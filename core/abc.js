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

// One part's notes -> an ABC body string, quantized to the grid.
// Chords become [CEG]; notes crossing a barline are split and tied.
export function partToAbc(song, track) {
  const grid = Math.round(song.ticksPerBeat / 4); // one 1/16 in ticks
  const sig = song.timeSignatures[0] || { numerator: 4, denominator: 4 };
  const barUnits = sig.numerator * (16 / sig.denominator); // 1/16s per bar
  const events = [];
  const byStart = new Map();
  for (const n of track.notes) {
    const start = Math.round(n.tick / grid);
    const dur = Math.max(1, Math.round(n.duration / grid));
    if (!byStart.has(start)) byStart.set(start, []);
    byStart.get(start).push(n);
  }
  const starts = [...byStart.keys()].sort((a, b) => a - b);
  let cursor = 0; // in grid units
  for (const start of starts) {
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
    let dur = Math.max(1, Math.round(chord[0].duration / grid));
    // split at barlines, tie the pieces
    const pieces = [];
    let placed = 0;
    while (placed < dur) {
      const toBar = barUnits - ((start + placed) % barUnits);
      const step = Math.min(dur - placed, toBar);
      pieces.push(step);
      placed += step;
    }
    const head = chord.length > 1
      ? '[' + chord.map(n => pitchToAbc(n.pitch)).join('') + ']'
      : pitchToAbc(chord[0].pitch);
    events.push(pieces.map(p => head + lenStr(p)).join('-'));
    cursor = start + dur;
    if (cursor % barUnits === 0) events.push('|');
  }
  return events.join(' ');
}

export function songToAbc(song) {
  const sig = song.timeSignatures[0] || { numerator: 4, denominator: 4 };
  const bpm = Math.round((song.tempoMap[0] ? song.tempoMap[0].bpm : 120));
  const title = (song.purpose || 'untitled').replace(/[\n\r:]/g, ' ').slice(0, 80);
  const lines = ['X:1', 'T:' + title, 'M:' + sig.numerator + '/' + sig.denominator,
    'L:1/16', 'Q:1/4=' + bpm, 'K:C'];
  for (const t of song.tracks) {
    const id = (t.name || 'part').replace(/[^A-Za-z0-9]/g, '_');
    lines.push('V:' + id + ' name="' + (t.name || 'part').replace(/"/g, "'") + '"' + (t.isDrums ? ' clef=perc' : ''));
    lines.push(partToAbc(song, t));
  }
  return lines.join('\n') + '\n';
}
