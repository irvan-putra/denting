// checks.js - "It sounds right... where it falls short, it must say so."
// These are checks of the WRITTEN NOTES, and they are reported as exactly
// that (the spec's limit: a check of the notes is described as a check of
// the notes). They never claim to judge how the music sounds.

import { tickToSeconds, tickToBeat, songEndTick, GM_DRUMS } from './model.js?v=0.4.3';

/**
 * Run all checks. Returns [{ id, severity: 'warn'|'info', text }] - empty
 * when the notes pass everything. Text says what was checked and found,
 * in plain words.
 */
export function checkNotes(song) {
  const findings = [];
  const bpm = song.tempoMap[0] ? song.tempoMap[0].bpm : 120;

  for (const t of song.tracks) {
    const label = t.name || 'a part';
    if (!t.notes.length) {
      findings.push({ id: 'empty-part', severity: 'info', text: `"${label}" has no notes.` });
      continue;
    }
    // Same-pitch overlaps: a note that starts before the previous one of
    // the same pitch ended. Players differ on how they sound these.
    const byPitch = new Map();
    let overlaps = 0;
    for (const n of t.notes) {
      const prev = byPitch.get(n.pitch);
      if (prev != null && n.tick < prev) overlaps++;
      byPitch.set(n.pitch, Math.max(prev ?? 0, n.tick + n.duration));
    }
    if (overlaps) {
      findings.push({ id: 'overlap', severity: 'warn',
        text: `"${label}": ${overlaps} note${overlaps === 1 ? '' : 's'} overlap the same pitch; some players shorten them.` });
    }
    // Notes too short to hear.
    const tooShort = t.notes.filter(n => tickToSeconds(song, n.tick + n.duration) - tickToSeconds(song, n.tick) < 0.03).length;
    if (tooShort) {
      findings.push({ id: 'tiny-notes', severity: 'warn',
        text: `"${label}": ${tooShort} note${tooShort === 1 ? '' : 's'} last under 30 ms at ${Math.round(bpm)} bpm; likely too short to hear.` });
    }
    // Flat dynamics.
    const vels = new Set(t.notes.map(n => n.velocity));
    if (t.notes.length >= 8 && vels.size === 1) {
      findings.push({ id: 'flat-dynamics', severity: 'info',
        text: `"${label}": every note has the same loudness; no dynamic shape.` });
    }
    // Pitches at the edges of what instruments play.
    const edge = t.notes.filter(n => !t.isDrums && (n.pitch < 21 || n.pitch > 108)).length;
    if (edge) {
      findings.push({ id: 'edge-pitch', severity: 'warn',
        text: `"${label}": ${edge} note${edge === 1 ? '' : 's'} outside the piano's range; check the instrument can play them.` });
    }
    // Drum keys inside the GM guarantee.
    if (t.isDrums) {
      const bad = t.notes.filter(n => !GM_DRUMS[n.pitch]).length;
      if (bad) {
        findings.push({ id: 'drum-range', severity: 'warn',
          text: `"${label}": ${bad} drum note${bad === 1 ? '' : 's'} outside the 47 guaranteed General MIDI sounds.` });
      }
    }
  }

  // Ending lands: does the final sonority include the most-used pitch class?
  const end = songEndTick(song);
  const all = song.tracks.filter(t => !t.isDrums).flatMap(t => t.notes);
  if (all.length >= 8 && end > 0) {
    const pc = new Array(12).fill(0);
    for (const n of all) pc[n.pitch % 12] += n.duration;
    const tonic = pc.indexOf(Math.max(...pc));
    const finalNotes = all.filter(n => n.tick + n.duration >= end);
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    if (finalNotes.length && !finalNotes.some(n => n.pitch % 12 === tonic)) {
      findings.push({ id: 'ending', severity: 'info',
        text: `The piece's most-heard note is ${names[tonic]}, but the ending does not land on it; the ending may not feel settled.` });
    }
  }

  // Variety: marker-delimited sections with identical material.
  if (song.markers.length >= 1 && all.length) {
    const bounds = [0, ...song.markers.map(m => m.tick), end];
    const prints = [];
    for (let i = 0; i + 1 < bounds.length; i++) {
      const sig = all.filter(n => n.tick >= bounds[i] && n.tick < bounds[i + 1])
        .map(n => `${n.tick - bounds[i]},${n.pitch}`).sort().join('|');
      if (sig) prints.push({ i, sig });
    }
    for (let a = 0; a < prints.length; a++) {
      for (let b = a + 1; b < prints.length; b++) {
        if (prints[a].sig === prints[b].sig) {
          findings.push({ id: 'sections-same', severity: 'info',
            text: `Sections ${prints[a].i + 1} and ${prints[b].i + 1} have identical notes; no variety between them.` });
        }
      }
    }
  }

  return findings;
}

export function formatFindings(findings) {
  if (!findings.length) return 'Checks of the written notes: nothing to flag.';
  return 'Checks of the written notes:\n' + findings.map(f => '- ' + f.text).join('\n');
}
