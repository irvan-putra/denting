// smf.js - Standard MIDI File reader/writer for denting.
// Dependency-free ES module; runs in node and the browser.
//
// Design rule (from the product spec): imported controller data must be
// preserved. Events denting does not understand are kept as raw events on
// the track and written back out unchanged.

/** Encode a variable-length quantity. */
export function vlq(value) {
  if (!Number.isInteger(value) || value < 0) throw new Error('vlq: bad value ' + value);
  const bytes = [value & 0x7f];
  value >>>= 7;
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  return bytes;
}

function u32(v) { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; }
function u16(v) { return [(v >>> 8) & 255, v & 255]; }

function textBytes(s) {
  return Array.from(new TextEncoder().encode(s));
}

/**
 * Write a Song model (see model.js) to SMF type 1 bytes (Uint8Array).
 * Track 0 carries tempo map, time signatures and markers.
 */
export function writeSmf(song) {
  const tpb = song.ticksPerBeat;
  const chunks = [];

  // Conductor track: tempo, time signature, markers.
  const cond = [];
  const push = (tick, bytes) => cond.push({ tick, bytes });
  for (const t of song.tempoMap) {
    const uspq = Math.round(60000000 / t.bpm);
    push(t.tick, [0xff, 0x51, 0x03, (uspq >> 16) & 255, (uspq >> 8) & 255, uspq & 255]);
  }
  for (const s of song.timeSignatures) {
    const dd = Math.log2(s.denominator);
    push(s.tick, [0xff, 0x58, 0x04, s.numerator, dd, 24, 8]);
  }
  for (const m of song.markers) {
    push(m.tick, [0xff, 0x06, ...vlq(textBytes(m.label).length), ...textBytes(m.label)]);
  }
  chunks.push(buildTrack(cond, tpb));

  for (const track of song.tracks) {
    const events = [];
    const ch = track.isDrums ? 9 : track.channel;
    if (track.name) {
      events.push({ tick: 0, bytes: [0xff, 0x03, ...vlq(textBytes(track.name).length), ...textBytes(track.name)] });
    }
    if (!track.isDrums && track.program != null) {
      events.push({ tick: 0, bytes: [0xc0 | ch, track.program] });
    }
    for (const n of track.notes) {
      events.push({ tick: n.tick, bytes: [0x90 | ch, n.pitch, n.velocity], order: 0 });
      events.push({ tick: n.tick + n.duration, bytes: [0x80 | ch, n.pitch, 64], order: 1 });
    }
    for (const r of track.otherEvents) {
      events.push({ tick: r.tick, bytes: r.bytes.slice(), order: 2 });
    }
    chunks.push(buildTrack(events, tpb));
  }

  const header = [
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6,
    ...u16(1), ...u16(chunks.length), ...u16(tpb),
  ];
  return new Uint8Array([...header, ...chunks.flat()]);
}

function buildTrack(events, tpb) {
  // Stable order: by tick, then explicit order, then original index.
  events.forEach((e, i) => { e.order = e.order ?? 0; e.idx = i; });
  events.sort((a, b) => a.tick - b.tick || a.order - b.order || a.idx - b.idx);
  const body = [];
  let last = 0;
  let runningStatus = null;
  for (const e of events) {
    body.push(...vlq(e.tick - last));
    last = e.tick;
    const status = e.bytes[0];
    if (status < 0xf0) {
      if (status === runningStatus) body.push(...e.bytes.slice(1));
      else { body.push(...e.bytes); runningStatus = status; }
    } else {
      body.push(...e.bytes);
      runningStatus = null;
    }
  }
  body.push(0x00, 0xff, 0x2f, 0x00);
  return [0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body];
}

class Reader {
  constructor(bytes) { this.b = bytes; this.p = 0; }
  u8() { return this.b[this.p++]; }
  u16() { return (this.u8() << 8) | this.u8(); }
  u32() { return (this.u16() << 16) | this.u16(); }
  bytes(n) { const r = Array.from(this.b.slice(this.p, this.p + n)); this.p += n; return r; }
  vlq() {
    let v = 0, c;
    do { c = this.u8(); v = (v << 7) | (c & 0x7f); } while (c & 0x80);
    return v;
  }
  expect(a) { for (const x of a) if (this.u8() !== x) throw new Error('smf: bad magic at ' + (this.p - 1)); }
}

/**
 * Parse SMF bytes (Uint8Array) into a Song model.
 * Unknown events are preserved in track.otherEvents as raw byte arrays
 * (status byte included), so writing the song back out keeps them.
 */
export function readSmf(bytes) {
  const r = new Reader(bytes);
  r.expect([0x4d, 0x54, 0x68, 0x64]);
  const hlen = r.u32();
  const format = r.u16();
  const ntracks = r.u16();
  const division = r.u16();
  if (division & 0x8000) throw new Error('smf: SMPTE time division is not supported');
  if (hlen > 6) r.bytes(hlen - 6);
  const song = {
    ticksPerBeat: division,
    tempoMap: [], timeSignatures: [], markers: [],
    tracks: [], revisions: [], purpose: '', libraryRefs: [],
  };
  const conductor = { tempoMap: [], timeSignatures: [], markers: [] };

  for (let ti = 0; ti < ntracks; ti++) {
    r.expect([0x4d, 0x54, 0x72, 0x6b]);
    const len = r.u32();
    const end = r.p + len;
    const track = { name: '', program: null, channel: 0, isDrums: false, notes: [], otherEvents: [] };
    const openNotes = new Map(); // key channel<<8|pitch -> [{tick, velocity}]
    let tick = 0, status = null;
    while (r.p < end) {
      tick += r.vlq();
      let b0 = r.u8();
      if (b0 < 0x80) { r.p--; b0 = status; }
      else if (b0 < 0xf0) status = b0;
      if (b0 === 0xff) {
        const type = r.u8();
        const n = r.vlq();
        const data = r.bytes(n);
        if (type === 0x2f) { r.p = end; break; }
        if (type === 0x51 && n === 3) {
          const uspq = (data[0] << 16) | (data[1] << 8) | data[2];
          conductor.tempoMap.push({ tick, bpm: 60000000 / uspq });
        } else if (type === 0x58 && n >= 2) {
          conductor.timeSignatures.push({ tick, numerator: data[0], denominator: 2 ** data[1] });
        } else if (type === 0x06) {
          conductor.markers.push({ tick, label: new TextDecoder().decode(new Uint8Array(data)) });
        } else if (type === 0x03) {
          track.name = new TextDecoder().decode(new Uint8Array(data));
        } else {
          track.otherEvents.push({ tick, bytes: [0xff, type, ...vlq(n), ...data] });
        }
      } else if (b0 === 0xf0 || b0 === 0xf7) {
        const n = r.vlq();
        const data = r.bytes(n);
        track.otherEvents.push({ tick, bytes: [b0, ...vlq(n), ...data] });
      } else {
        const kind = b0 & 0xf0, ch = b0 & 0x0f;
        if (kind === 0x90) {
          const pitch = r.u8(), vel = r.u8();
          const key = (ch << 8) | pitch;
          if (vel > 0) {
            if (!openNotes.has(key)) openNotes.set(key, []);
            openNotes.get(key).push({ tick, velocity: vel });
          } else {
            const list = openNotes.get(key);
            if (list && list.length) {
              const on = list.shift();
              track.notes.push({ tick: on.tick, duration: Math.max(1, tick - on.tick), pitch, velocity: on.velocity });
            }
          }
          if (ch === 9) track.isDrums = true; else track.channel = ch;
        } else if (kind === 0x80) {
          const pitch = r.u8(); r.u8();
          const key = (ch << 8) | pitch;
          const list = openNotes.get(key);
          if (list && list.length) {
            const on = list.shift();
            track.notes.push({ tick: on.tick, duration: Math.max(1, tick - on.tick), pitch, velocity: on.velocity });
          }
        } else if (kind === 0xc0) {
          const prog = r.u8();
          if (ch !== 9 && track.program == null) { track.program = prog; track.channel = ch; }
          else track.otherEvents.push({ tick, bytes: [b0, prog] });
          if (ch === 9) track.isDrums = true;
        } else if (kind === 0xd0) {
          track.otherEvents.push({ tick, bytes: [b0, r.u8()] });
        } else {
          track.otherEvents.push({ tick, bytes: [b0, r.u8(), r.u8()] });
        }
      }
    }
    r.p = end;
    // Close hanging notes (note-on without off) with a 1-tick duration.
    for (const [key, list] of openNotes) {
      for (const on of list) {
        track.notes.push({ tick: on.tick, duration: 1, pitch: key & 255, velocity: on.velocity });
      }
    }
    track.notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
    if (track.isDrums) track.channel = 9;
    if (ti === 0 && !track.notes.length && !track.name && !track.otherEvents.length) {
      // pure conductor track
      continue;
    }
    song.tracks.push(track);
  }
  if (!song.tempoMap.length) song.tempoMap = conductor.tempoMap;
  else song.tempoMap.push(...conductor.tempoMap);
  song.timeSignatures = conductor.timeSignatures;
  song.markers = conductor.markers;
  if (!song.tempoMap.length) song.tempoMap = [{ tick: 0, bpm: 120 }];
  if (!song.timeSignatures.length) song.timeSignatures = [{ tick: 0, numerator: 4, denominator: 4 }];
  return song;
}
