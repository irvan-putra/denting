// Minimal test runner: node tests/run.js
import { writeSmf, readSmf } from '../core/smf.js';
import { newSong, addTrack, tickToSeconds, GM_PROGRAMS } from '../core/model.js';
import { applyAimed, transpose, scaleVelocity, setTempo, addMarker, checkpoint, restoreRevision, snapshot } from '../core/engine.js';
import { handoffDocument } from '../core/handoff.js';
import { interpret } from '../core/director.js';

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL: ' + name); }
}
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + ' (got ' + JSON.stringify(a) + ')'); }

function fixture() {
  const song = newSong({ bpm: 100, purpose: 'company awards night' });
  const mel = addTrack(song, { name: 'melody', program: 10 });
  mel.notes.push(
    { tick: 0, duration: 480, pitch: 60, velocity: 100 },
    { tick: 480, duration: 480, pitch: 62, velocity: 90 },
    { tick: 960, duration: 480, pitch: 64, velocity: 80 },
    { tick: 1920, duration: 480, pitch: 65, velocity: 70 },
  );
  const dr = addTrack(song, { name: 'drums', isDrums: true });
  dr.notes.push({ tick: 0, duration: 120, pitch: 36, velocity: 110 });
  addMarker(song, 'everyone looks at the stage', 2);
  return song;
}

// SMF round trip
{
  const song = fixture();
  const bytes = writeSmf(song);
  ok(bytes[0] === 0x4d && bytes[1] === 0x54, 'smf magic');
  const back = readSmf(bytes);
  eq(back.ticksPerBeat, 480, 'tpb round trip');
  eq(Math.round(back.tempoMap[0].bpm), 100, 'tempo round trip');
  eq(back.markers.length, 1, 'marker round trip');
  eq(back.markers[0].label, 'everyone looks at the stage', 'marker label');
  eq(back.tracks.length, 2, 'track count');
  eq(back.tracks[0].name, 'melody', 'track name');
  eq(back.tracks[0].program, 10, 'program');
  eq(back.tracks[0].notes.length, 4, 'notes survive');
  eq(back.tracks[0].notes[1], { tick: 480, duration: 480, pitch: 62, velocity: 90 }, 'note fields');
  eq(back.tracks[1].isDrums, true, 'drum flag');
  eq(back.tracks[1].channel, 9, 'drum channel');
  // write again, parse again: stable
  const bytes2 = writeSmf(back);
  const back2 = readSmf(bytes2);
  eq(snapshot(back2), snapshot(back), 'second round trip stable');
}

// unknown events preserved
{
  const song = fixture();
  song.tracks[0].otherEvents.push({ tick: 240, bytes: [0xb0, 64, 127] }); // sustain pedal on
  const back = readSmf(writeSmf(song));
  const has = back.tracks[0].otherEvents.some(e => e.bytes[0] === 0xb0 && e.bytes[1] === 64 && e.bytes[2] === 127);
  ok(has, 'controller event preserved through round trip');
}

// aimed edit: only the aimed track and beats change
{
  const song = fixture();
  const beforeMelodyOutside = JSON.stringify(song.tracks[0].notes.filter(n => n.tick >= 960));
  const beforeDrums = JSON.stringify(song.tracks[1].notes);
  const n = transpose(song, -12, { tracks: [0], fromBeat: 0, toBeat: 2 });
  eq(n, 2, 'two notes in aim');
  eq(song.tracks[0].notes[0].pitch, 48, 'note transposed');
  eq(JSON.stringify(song.tracks[0].notes.filter(n => n.tick >= 960)), beforeMelodyOutside, 'outside beats identical');
  eq(JSON.stringify(song.tracks[1].notes), beforeDrums, 'other track identical');
}

// transpose skips drums
{
  const song = fixture();
  transpose(song, 12);
  eq(song.tracks[1].notes[0].pitch, 36, 'drum pitch untouched by transpose');
}

// velocity scaling and clamping
{
  const song = fixture();
  scaleVelocity(song, 2, { tracks: [0] });
  eq(song.tracks[0].notes[0].velocity, 127, 'velocity clamped at 127');
  eq(song.tracks[0].notes[3].velocity, 127, 'velocity clamped 2');
  eq(song.tracks[1].notes[0].velocity, 110, 'unaimed track untouched');
}

// revisions: return to an earlier state
{
  const song = fixture();
  const r1 = checkpoint(song, { request: 'start', explanation: 'initial' });
  transpose(song, -12);
  checkpoint(song, { request: 'too high', explanation: 'down 12' });
  eq(song.tracks[0].notes[0].pitch, 48, 'after transpose');
  restoreRevision(song, r1.id);
  eq(song.tracks[0].notes[0].pitch, 60, 'returned to earlier revision');
}

// tempo and seconds
{
  const song = fixture();
  setTempo(song, 120);
  eq(Math.round(tickToSeconds(song, 480) * 1000), 500, 'one beat at 120bpm is 0.5s');
}

// handoff document carries intent
{
  const song = fixture();
  const doc = handoffDocument(song);
  ok(doc.includes('company awards night'), 'handoff has purpose');
  ok(doc.includes('everyone looks at the stage'), 'handoff has key moment');
  ok(doc.includes(GM_PROGRAMS[10]), 'handoff names instrument');
  ok(doc.includes('too high') === false, 'no fabricated history');
}

// director: the parent's story quote works with no AI model
{
  const song = fixture();
  const res = interpret('I feel this is a bit too high, let make it transposed down', song);
  ok(res.handled, 'vague too-high request handled locally');
  eq(song.tracks[0].notes[0].pitch, 48, 'transposed down an octave by default');
  eq(song.tracks[1].notes[0].pitch, 36, 'drums still untouched');
}
{
  const song = fixture();
  const res = interpret('make it more epic when everyone looks at the stage', song);
  ok(!res.handled && res.reason === 'needs-ai', 'unconfigured model says so honestly');
  eq(song.tracks[0].notes[0].pitch, 60, 'nothing changed on unhandled request');
}

// aim promise: a hostile transform cannot touch outside notes
{
  const song = fixture();
  let threw = false;
  try {
    applyAimed(song, { tracks: [0], fromBeat: 0, toBeat: 1 }, n => { n.pitch = -5; });
  } catch (e) { threw = true; }
  ok(threw, 'invalid transform rejected');
}


// director honors an explicit aim
{
  const song = fixture();
  const res = interpret('too high', song, { tracks: [0], fromBeat: 2, toBeat: 3 });
  ok(res.handled, 'aimed command handled');
  eq(song.tracks[0].notes[0].pitch, 60, 'beat 0-1 untouched by aimed command');
  eq(song.tracks[0].notes[2].pitch, 52, 'beat 2-3 transposed');
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

// director honors an explicit aim
{
  const song = fixture();
  const res = interpret('too high', song, { tracks: [0], fromBeat: 2, toBeat: 3 });
  ok(res.handled, 'aimed command handled');
  eq(song.tracks[0].notes[0].pitch, 60, 'beat 0-1 untouched by aimed command');
  eq(song.tracks[0].notes[2].pitch, 52, 'beat 2-3 transposed');
}
