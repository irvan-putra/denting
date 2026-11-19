// library.js - what works can be reused.
// A fragment is a stretch of music saved under a name; a saved prompt is
// a phrasing that worked. Both can be found again and combined. The
// library travels with the song's snapshot so it persists like the music.

/** Save the aimed notes as a named fragment (ticks made relative). */
export function saveFragment(song, aim, name, norm) {
  if (!name) throw new Error('save: a fragment needs a name');
  const fromTick = norm.fromTick, toTick = norm.toTick === Infinity ? null : norm.toTick;
  const notes = [];
  for (const i of norm.tracks) {
    const t = song.tracks[i];
    for (const n of t.notes) {
      if (n.tick >= fromTick && (toTick == null || n.tick < toTick)) {
        notes.push({
          tick: n.tick - fromTick, duration: n.duration,
          pitch: n.pitch, velocity: n.velocity,
          isDrums: t.isDrums, program: t.program, part: t.name || null,
        });
      }
    }
  }
  if (!notes.length) throw new Error('save: nothing inside the aim to save');
  const frag = { kind: 'fragment', name, notes, savedAt: new Date().toISOString() };
  song.libraryRefs = song.libraryRefs.filter(f => !(f.kind === 'fragment' && f.name === name));
  song.libraryRefs.push(frag);
  return frag;
}

/** Insert a named fragment at a beat. Returns the number of notes added. */
export function insertFragment(song, name, atBeat, trackName) {
  const frag = (song.libraryRefs || []).find(f => f.kind === 'fragment' && f.name === name);
  if (!frag) throw new Error('no fragment named "' + name + '"');
  const base = Math.round(atBeat * song.ticksPerBeat);
  const seedTpb = frag.ticksPerBeat || 480;
  const scale = song.ticksPerBeat / seedTpb;
  // Group by source part: reuse a track with the same name+instrument when
  // it exists, otherwise create one.
  const byPart = new Map();
  for (const n of frag.notes) {
    const key = (n.part || '') + '|' + (n.isDrums ? 'drums' : n.program);
    if (!byPart.has(key)) byPart.set(key, { meta: n, notes: [] });
    byPart.get(key).notes.push(n);
  }
  let added = 0;
  for (const { meta, notes } of byPart.values()) {
    let track = song.tracks.find(t =>
      (trackName ? t.name === trackName : (t.name || '') === (meta.part || '')) &&
      t.isDrums === !!meta.isDrums && (meta.isDrums || t.program === meta.program));
    if (!track) {
      const used = new Set(song.tracks.map(t => t.channel));
      let channel = meta.isDrums ? 9 : 0;
      while (!meta.isDrums && (used.has(channel) || channel === 9)) channel++;
      if (channel > 15) throw new Error('no free MIDI channel');
      track = { name: trackName || meta.part || name, program: meta.isDrums ? null : meta.program,
                channel, isDrums: !!meta.isDrums, notes: [], otherEvents: [] };
      song.tracks.push(track);
    }
    for (const n of notes) {
      track.notes.push({ tick: base + Math.round(n.tick * scale), duration: Math.max(1, Math.round(n.duration * scale)), pitch: n.pitch, velocity: n.velocity });
      added++;
    }
    track.notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
  }
  return added;
}

export function savePrompt(song, name, text) {
  if (!name || !text) throw new Error('a saved prompt needs a name and text');
  song.libraryRefs = (song.libraryRefs || []).filter(p => !(p.kind === 'prompt' && p.name === name));
  song.libraryRefs.push({ kind: 'prompt', name, text, savedAt: new Date().toISOString() });
}

export function listLibrary(song) {
  return (song.libraryRefs || []).map(f =>
    f.kind === 'fragment' ? 'fragment "' + f.name + '" (' + f.notes.length + ' notes)'
                          : 'prompt "' + f.name + '": ' + f.text);
}
