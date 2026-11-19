// handoff.js - the handover a professional picks up.
// The .mid file carries the notes; this document carries the intent:
// what the music is for, its structure, its timing, and the moments that
// matter. Both leave the product together.

import { GM_PROGRAMS, tickToSeconds, tickToBeat, songEndTick } from './model.js?v=0.2.4';

function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return m + ':' + s.toFixed(1).padStart(4, '0');
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
  for (const t of song.tracks) {
    const instrument = t.isDrums ? 'Drums (General MIDI, channel 10)'
      : (GM_PROGRAMS[t.program] || 'program ' + t.program);
    lines.push('- **' + (t.name || instrument) + '** - ' + instrument +
      ', ' + t.notes.length + ' notes');
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
  lines.push('## What you may change');
  lines.push('');
  lines.push('Everything. This is a starting point for a professional, not a');
  lines.push('finished recording. Instrument numbers are General MIDI hints;');
  lines.push('the final sounds are yours to choose.');
  lines.push('');
  return lines.join('\n');
}
