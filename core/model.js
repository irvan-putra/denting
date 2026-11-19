// model.js - denting's picture of a piece of music.
// Deliberately holds more than a MIDI file can (see docs/decisions.md):
// session purpose, key moments, revision history and library references
// live here, and export writes what MIDI can carry.

export function newSong(opts = {}) {
  return {
    ticksPerBeat: opts.ticksPerBeat || 480,
    tempoMap: [{ tick: 0, bpm: opts.bpm || 120 }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    markers: [],
    tracks: [],
    revisions: [],
    purpose: opts.purpose || '',
    libraryRefs: [],
  };
}

export function addTrack(song, { name = '', program = 0, isDrums = false } = {}) {
  const used = new Set(song.tracks.map(t => t.channel));
  let channel = 0;
  if (isDrums) channel = 9;
  else { while (used.has(channel) || channel === 9) channel++; if (channel > 15) throw new Error('no free MIDI channel'); }
  const track = { name, program: isDrums ? null : program, channel, isDrums, notes: [], otherEvents: [] };
  song.tracks.push(track);
  return track;
}

export function beatToTick(song, beat) { return Math.round(beat * song.ticksPerBeat); }
export function tickToBeat(song, tick) { return tick / song.ticksPerBeat; }

/** Seconds at a tick, walking the tempo map. */
export function tickToSeconds(song, tick) {
  let seconds = 0, lastTick = 0, bpm = 120;
  const map = [...song.tempoMap].sort((a, b) => a.tick - b.tick);
  for (const t of map) {
    if (t.tick >= tick) break;
    seconds += ((t.tick - lastTick) / song.ticksPerBeat) * (60 / bpm);
    lastTick = t.tick; bpm = t.bpm;
  }
  seconds += ((tick - lastTick) / song.ticksPerBeat) * (60 / bpm);
  return seconds;
}

export function songEndTick(song) {
  let end = 0;
  for (const t of song.tracks) for (const n of t.notes) end = Math.max(end, n.tick + n.duration);
  for (const m of song.markers) end = Math.max(end, m.tick);
  return end;
}

/** General MIDI instrument names, programs 0-127. */
export const GM_PROGRAMS = [
  'Acoustic Grand Piano','Bright Acoustic Piano','Electric Grand Piano','Honky-tonk Piano','Electric Piano 1','Electric Piano 2','Harpsichord','Clavi',
  'Celesta','Glockenspiel','Music Box','Vibraphone','Marimba','Xylophone','Tubular Bells','Dulcimer',
  'Drawbar Organ','Percussive Organ','Rock Organ','Church Organ','Reed Organ','Accordion','Harmonica','Tango Accordion',
  'Acoustic Guitar (nylon)','Acoustic Guitar (steel)','Electric Guitar (jazz)','Electric Guitar (clean)','Electric Guitar (muted)','Overdriven Guitar','Distortion Guitar','Guitar Harmonics',
  'Acoustic Bass','Electric Bass (finger)','Electric Bass (pick)','Fretless Bass','Slap Bass 1','Slap Bass 2','Synth Bass 1','Synth Bass 2',
  'Violin','Viola','Cello','Contrabass','Tremolo Strings','Pizzicato Strings','Orchestral Harp','Timpani',
  'String Ensemble 1','String Ensemble 2','Synth Strings 1','Synth Strings 2','Choir Aahs','Voice Oohs','Synth Voice','Orchestra Hit',
  'Trumpet','Trombone','Tuba','Muted Trumpet','French Horn','Brass Section','Synth Brass 1','Synth Brass 2',
  'Soprano Sax','Alto Sax','Tenor Sax','Baritone Sax','Oboe','English Horn','Bassoon','Clarinet',
  'Piccolo','Flute','Recorder','Pan Flute','Blown Bottle','Shakuhachi','Whistle','Ocarina',
  'Lead 1 (square)','Lead 2 (sawtooth)','Lead 3 (calliope)','Lead 4 (chiff)','Lead 5 (charang)','Lead 6 (voice)','Lead 7 (fifths)','Lead 8 (bass + lead)',
  'Pad 1 (new age)','Pad 2 (warm)','Pad 3 (polysynth)','Pad 4 (choir)','Pad 5 (bowed)','Pad 6 (metallic)','Pad 7 (halo)','Pad 8 (sweep)',
  'FX 1 (rain)','FX 2 (soundtrack)','FX 3 (crystal)','FX 4 (atmosphere)','FX 5 (brightness)','FX 6 (goblins)','FX 7 (echoes)','FX 8 (sci-fi)',
  'Sitar','Banjo','Shamisen','Koto','Kalimba','Bagpipe','Fiddle','Shanai',
  'Tinkle Bell','Agogo','Steel Drums','Woodblock','Taiko Drum','Melodic Tom','Synth Drum','Reverse Cymbal',
  'Guitar Fret Noise','Breath Noise','Seashore','Bird Tweet','Telephone Ring','Helicopter','Applause','Gunshot',
];

/** Tick at a number of seconds, walking the tempo map (inverse of tickToSeconds). */
export function secondsToTick(song, seconds) {
  const map = [...song.tempoMap].sort((a, b) => a.tick - b.tick);
  let sec = 0, lastTick = 0, bpm = 120;
  for (const t of map) {
    const segSec = ((t.tick - lastTick) / song.ticksPerBeat) * (60 / bpm);
    if (sec + segSec >= seconds) {
      return Math.round(lastTick + (seconds - sec) * (bpm / 60) * song.ticksPerBeat);
    }
    sec += segSec; lastTick = t.tick; bpm = t.bpm;
  }
  return Math.round(lastTick + (seconds - sec) * (bpm / 60) * song.ticksPerBeat);
}

/** General MIDI drum sound names, keys 35-81. */
export const GM_DRUMS = {
  35:'Acoustic Bass Drum',36:'Bass Drum 1',37:'Side Stick',38:'Acoustic Snare',39:'Hand Clap',40:'Electric Snare',
  41:'Low Floor Tom',42:'Closed Hi-Hat',43:'High Floor Tom',44:'Pedal Hi-Hat',45:'Low Tom',46:'Open Hi-Hat',
  47:'Low-Mid Tom',48:'Hi-Mid Tom',49:'Crash Cymbal 1',50:'High Tom',51:'Ride Cymbal 1',52:'Chinese Cymbal',
  53:'Ride Bell',54:'Tambourine',55:'Splash Cymbal',56:'Cowbell',57:'Crash Cymbal 2',58:'Vibraslap',
  59:'Ride Cymbal 2',60:'Hi Bongo',61:'Low Bongo',62:'Mute Hi Conga',63:'Open Hi Conga',64:'Low Conga',
  65:'High Timbale',66:'Low Timbale',67:'High Agogo',68:'Low Agogo',69:'Cabasa',70:'Maracas',
  71:'Short Whistle',72:'Long Whistle',73:'Short Guiro',74:'Long Guiro',75:'Claves',76:'Hi Wood Block',
  77:'Low Wood Block',78:'Mute Cuica',79:'Open Cuica',80:'Mute Triangle',81:'Open Triangle',
};
