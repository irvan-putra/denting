// engine.js - aimed edits, with the product's core promise enforced by
// construction: whatever a person left alone stays exactly as it was.
//
// Every edit names its aim (which tracks, which stretch of beats). The
// engine partitions the notes into inside-aim and outside-aim, transforms
// only the inside ones, and then verifies the outside ones are identical
// to their pre-edit state. A failed verification throws and leaves the
// song unchanged: a change applies completely or not at all.

export function aimAll() { return { tracks: 'all', fromBeat: null, toBeat: null }; }

export function normalizeAim(song, aim = {}) {
  const tracks = aim.tracks === 'all' || aim.tracks == null
    ? song.tracks.map((_, i) => i)
    : aim.tracks;
  const fromTick = aim.fromBeat == null ? 0 : Math.round(aim.fromBeat * song.ticksPerBeat);
  const toTick = aim.toBeat == null ? Infinity : Math.round(aim.toBeat * song.ticksPerBeat);
  for (const i of tracks) if (!song.tracks[i]) throw new Error('aim: no track ' + i);
  if (toTick < fromTick) throw new Error('aim: toBeat before fromBeat');
  return { tracks, fromTick, toTick };
}

function inAim(note, norm) {
  return note.tick >= norm.fromTick && note.tick < norm.toTick;
}

/** Canonical string for a set of notes; used by the immutability check. */
function canon(notes) {
  return notes
    .map(n => [n.tick, n.duration, n.pitch, n.velocity].join(','))
    .sort()
    .join('|');
}

/**
 * Apply fn(note, track) to every note inside the aim. fn may mutate the
 * note it is given. Notes outside the aim are never passed to fn, and are
 * verified untouched afterwards. Returns the number of notes changed.
 */
export function applyAimed(song, aim, fn) {
  const norm = normalizeAim(song, aim);
  const outside = [];
  for (let i = 0; i < song.tracks.length; i++) {
    if (norm.tracks.includes(i)) continue;
    outside.push(canon(song.tracks[i].notes));
  }
  const insideOutside = [];
  for (const i of norm.tracks) {
    insideOutside.push(canon(song.tracks[i].notes.filter(n => !inAim(n, norm))));
  }
  let touched = 0;
  for (const i of norm.tracks) {
    const track = song.tracks[i];
    for (const n of track.notes) {
      if (inAim(n, norm)) { fn(n, track); touched++; }
    }
    // A transform may not produce impossible notes.
    for (const n of track.notes) {
      if (!Number.isInteger(n.pitch) || n.pitch < 0 || n.pitch > 127) throw new Error('edit produced pitch out of range');
      if (!Number.isInteger(n.velocity) || n.velocity < 1 || n.velocity > 127) throw new Error('edit produced velocity out of range');
      if (!Number.isInteger(n.duration) || n.duration < 1) throw new Error('edit produced bad duration');
      if (!Number.isInteger(n.tick) || n.tick < 0) throw new Error('edit produced bad tick');
    }
  }
  // Verify: everything outside the aim must be exactly as it was.
  let oi = 0;
  for (let i = 0; i < song.tracks.length; i++) {
    if (norm.tracks.includes(i)) continue;
    if (canon(song.tracks[i].notes) !== outside[oi++]) {
      throw new Error('aim promise broken: untouched track changed');
    }
  }
  let ii = 0;
  for (const i of norm.tracks) {
    if (canon(song.tracks[i].notes.filter(n => !inAim(n, norm))) !== insideOutside[ii++]) {
      throw new Error('aim promise broken: notes outside the aimed beats changed');
    }
  }
  return touched;
}

// --- Built-in musical operations (deterministic, no AI model needed) ---

export function transpose(song, semitones, aim) {
  if (!Number.isInteger(semitones) || semitones < -48 || semitones > 48) throw new Error('transpose: bad interval');
  return applyAimed(song, aim, (n, track) => {
    if (track.isDrums) return; // drum pitches are sounds, not notes
    n.pitch = Math.min(127, Math.max(0, n.pitch + semitones));
  });
}

export function scaleVelocity(song, factor, aim) {
  if (!(factor > 0 && factor <= 4)) throw new Error('velocity: bad factor');
  return applyAimed(song, aim, n => {
    n.velocity = Math.min(127, Math.max(1, Math.round(n.velocity * factor)));
  });
}

export function shiftBeats(song, beats, aim) {
  const norm = normalizeAim(song, aim);
  const ticks = Math.round(beats * song.ticksPerBeat);
  return applyAimed(song, aim, n => {
    n.tick += ticks;
    if (n.tick < 0) n.tick = 0;
  });
}

/** Set one tempo for the whole song (tempo-map edits come later). */
export function setTempo(song, bpm) {
  if (!(bpm >= 10 && bpm <= 600)) throw new Error('tempo: out of range 10-600');
  song.tempoMap = [{ tick: 0, bpm }];
}

export function addMarker(song, label, beat) {
  const tick = Math.round(beat * song.ticksPerBeat);
  song.markers.push({ tick, label });
  song.markers.sort((a, b) => a.tick - b.tick);
}

// --- Revisions: keep any earlier state, return to it ("you decide by ear") ---

export function snapshot(song) {
  return JSON.stringify({
    ticksPerBeat: song.ticksPerBeat,
    tempoMap: song.tempoMap, timeSignatures: song.timeSignatures,
    markers: song.markers, tracks: song.tracks, purpose: song.purpose,
  });
}

export function restore(song, snap) {
  const s = JSON.parse(snap);
  song.ticksPerBeat = s.ticksPerBeat;
  song.tempoMap = s.tempoMap; song.timeSignatures = s.timeSignatures;
  song.markers = s.markers; song.tracks = s.tracks; song.purpose = s.purpose;
}

/**
 * Record a revision. request/explanation use the person's own words, so a
 * later look at the history says what happened in the vocabulary used.
 */
export function checkpoint(song, { request = '', explanation = '', source = 'edit' } = {}) {
  const rev = {
    id: (song.revisions.length ? song.revisions[song.revisions.length - 1].id + 1 : 1),
    at: new Date().toISOString(),
    request, explanation, source,
    state: snapshot(song),
  };
  song.revisions.push(rev);
  return rev;
}

export function restoreRevision(song, id) {
  const rev = song.revisions.find(r => r.id === id);
  if (!rev) throw new Error('no revision ' + id);
  // Keep the ability to go forward again: current state becomes a revision.
  restore(song, rev.state);
  return rev;
}
