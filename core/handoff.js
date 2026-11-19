// handoff.js - the handover a professional picks up.
// The .mid file carries the notes; this document carries the intent:
// what the music is for, its structure, its timing, and the moments that
// matter. Both leave the product together.

import { GM_PROGRAMS, tickToSeconds, tickToBeat, songEndTick } from './model.js?v=0.4.11';
import { checkNotes } from './checks.js?v=0.4.11';

function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return m + ':' + s.toFixed(1).padStart(4, '0');
}

// Describe what each part seems to be doing, derived only from the
// written notes: register, density and whether it plays one note at a
// time. These are observations for the professional, not labels the
// maker had to choose.
export function describeRoles(song) {
  const roles = new Map();
  const end = songEndTick(song);
  const beats = Math.max(1, tickToBeat(song, end));
  const stats = song.tracks.map(t => {
    const notes = t.notes || [];
    const sorted = notes.slice().sort((a, b) => a.tick - b.tick);
    let oneAtATime = true;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].tick < sorted[i - 1].tick + sorted[i - 1].duration) { oneAtATime = false; break; }
    }
    const avg = notes.length ? notes.reduce((s, n) => s + n.pitch, 0) / notes.length : 0;
    return { t, notes, avg, density: notes.length / beats, oneAtATime };
  });
  const melodic = stats.filter(x => !x.t.isDrums);
  const highestAvg = melodic.length ? Math.max(...melodic.map(x => x.avg)) : 0;
  for (const x of stats) {
    const parts = [];
    if (x.t.isDrums) {
      parts.push('Holds the rhythm.');
    } else {
      if (x.avg <= 50 && x.oneAtATime) parts.push('Low and steady; the foundation the other parts stand on.');
      else if (x.avg === highestAvg && melodic.length > 1) parts.push('Carries the highest line; likely where the main tune sits.');
      if (!x.oneAtATime) parts.push('Plays several notes at once (chords), so it fills the harmony.');
      if (x.density < 0.5) parts.push('Plays sparsely; leaves space.');
      if (!parts.length) parts.push('Sits in the middle; supports the other parts.');
    }
    roles.set(x.t, parts.join(' '));
  }
  return roles;
}

export function handoffDocument(song) {
  const lines = [];
  lines.push('# Handover notes');
  lines.push('');
  lines.push('Made with denting. The accompanying .mid file carries the notes;');
  lines.push('this document carries what the music is for. Both are yours.');
  lines.push('');
  lines.push('## Purpose');
  lines.push('');
  lines.push(song.purpose ? song.purpose : '(the maker did not record a purpose)');
  lines.push('');
  lines.push('## Timing');
  lines.push('');
  const end = songEndTick(song);
  lines.push('- Length: about ' + fmtTime(tickToSeconds(song, end)) +
    ' (' + tickToBeat(song, end).toFixed(1) + ' beats)');
  for (const t of song.tempoMap) {
    lines.push('- Tempo ' + Math.round(t.bpm * 100) / 100 + ' bpm from beat ' + tickToBeat(song, t.tick));
  }
  for (const s of song.timeSignatures) {
    lines.push('- Time signature ' + s.numerator + '/' + s.denominator + ' from beat ' + tickToBeat(song, s.tick));
  }
  lines.push('');
  lines.push('## Parts');
  lines.push('');
  lines.push('Each part is meant to do one job:');
  lines.push('');
  const roles = describeRoles(song);
  for (const t of song.tracks) {
    const instrument = t.isDrums ? 'Drums (General MIDI, channel 10)'
      : (GM_PROGRAMS[t.program] || 'program ' + t.program);
    lines.push('- **' + (t.name || instrument) + '** - ' + instrument +
      ', ' + t.notes.length + ' notes. ' + (roles.get(t) || ''));
  }
  lines.push('');
  lines.push('## Moments that matter');
  lines.push('');
  if (song.markers.length) {
    for (const m of song.markers) {
      lines.push('- beat ' + tickToBeat(song, m.tick) + ' (' + fmtTime(tickToSeconds(song, m.tick)) + '): ' + m.label);
    }
  } else {
    lines.push('(no moments marked)');
  }
  lines.push('');
  lines.push('## How it got here');
  lines.push('');
  const reqs = song.revisions.filter(r => r.request);
  if (reqs.length) {
    for (const r of reqs) {
      lines.push('- "' + r.request + '"' + (r.explanation ? ' -> ' + r.explanation : ''));
    }
  } else {
    lines.push('(no recorded requests)');
  }
  lines.push('');
  const findings = checkNotes(song);
  lines.push('## Checks of the written notes');
  lines.push('');
  lines.push('These inspect the notes, not the sound; take them as pointers.');
  lines.push('');
  if (findings.length) for (const f of findings) lines.push('- ' + f.text);
  else lines.push('- Nothing to flag.');
  lines.push('');
  lines.push('## What you may change');
  lines.push('');
  lines.push('Everything. This is a starting point for a professional, not a');
  lines.push('finished recording. Instrument numbers are General MIDI hints;');
  lines.push('the final sounds are yours to choose.');
  lines.push('');
  return lines.join('\n');
}
