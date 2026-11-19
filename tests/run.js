// Minimal test runner: node tests/run.js
import { writeSmf, readSmf } from '../core/smf.js';
import { newSong, addTrack, tickToSeconds, GM_PROGRAMS } from '../core/model.js';
import { applyAimed, transpose, scaleVelocity, setTempo, addMarker, checkpoint, restoreRevision, snapshot } from '../core/engine.js';
import { describeRoles, handoffDocument } from '../core/handoff.js';
import { interpret } from '../core/director.js';
import { listLibrary } from '../core/library.js';
import { SEEDS, seedLibrary } from '../core/seeds.js';
import { songToAbc, pitchToAbc, partToAbc } from '../core/abc.js';
import { checkNotes, formatFindings } from '../core/checks.js';

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


// transpose count excludes skipped drums
{
  const song = fixture();
  const n = transpose(song, -12); // no aim: all tracks
  eq(n, 4, 'only pitched notes counted, drums excluded');
}


// timed marker from conversation, exact to the instant
{
  const song = fixture();
  const res = interpret('at 0:02 everyone looks at the stage', song);
  ok(res.handled, 'clock marker handled');
  eq(song.markers[song.markers.length-1].tick, 1600, 'marker at exactly 2s at 100bpm');
  eq(song.markers[song.markers.length-1].label, 'everyone looks at the stage', 'marker label');
}
{
  const song = fixture();
  interpret('mark beat 6: the big reveal', song);
  eq(song.markers[song.markers.length-1].tick, 2880, 'beat marker');
}

// tempo change at a point
{
  const song = fixture();
  const res = interpret('90 bpm at beat 4', song);
  ok(res.handled, 'tempo-at-beat handled');
  eq(song.tempoMap.length, 2, 'tempo map grew');
  eq(song.tempoMap[1], { tick: 1920, bpm: 90 }, 'tempo entry at beat 4');
}

// library: save aimed stretch, insert elsewhere
{
  const song = fixture();
  const save = interpret('save this as fanfare', song, { tracks: [0], fromBeat: 0, toBeat: 2 });
  ok(save.handled, 'fragment saved');
  const before = song.tracks[0].notes.length;
  const ins = interpret('insert fanfare at beat 4', song);
  ok(ins.handled, 'fragment inserted');
  eq(song.tracks[0].notes.length, before + 2, 'two notes inserted');
  eq(song.tracks[0].notes.some(n => n.tick === 1920), true, 'inserted at beat 4');
}
{
  const song = fixture();
  const res = interpret('library', song);
  ok(!res.handled && res.message.includes('empty'), 'empty library says so');
  interpret('save this as riff', song, { tracks: [0], fromBeat: 0, toBeat: 1 });
  const res2 = interpret('library', song);
  ok(res2.message.includes('riff'), 'library lists fragment');
}

// prompt library
{
  const song = fixture();
  const res = interpret('prompt more epic: make it more epic when everyone looks at the stage', song);
  ok(res.handled, 'prompt saved');
  ok(listLibrary(song).some(x => x.includes('more epic')), 'prompt in library');
}

// discussion never moves the music
{
  const song = fixture();
  const before = snapshot(song);
  const res = interpret('note: maybe the drums should drop out before the reveal', song);
  ok(res.discussion, 'note treated as discussion');
  eq(snapshot(song), before, 'discussion changed nothing');
}


// seeds: original material ships with the product and inserts cleanly
{
  const song = newSong();
  seedLibrary(song);
  const names = listLibrary(song).join(' ');
  ok(names.includes('cadence') && names.includes('groove') && names.includes('fanfare'), 'seeds listed');
  ok(SEEDS.every(f => f.origin === 'denting'), 'all seeds original to denting');
  const res = interpret('insert cadence at beat 0', song);
  ok(res.handled, 'seed inserted');
  eq(song.tracks.length, 1, 'seed created its part');
  eq(song.tracks[0].notes.length, 12, 'cadence notes present');
  const res2 = interpret('insert groove at beat 8', song);
  ok(res2.handled, 'drum seed inserted');
  eq(song.tracks[1].isDrums, true, 'groove part is drums');
  eq(song.tracks[1].channel, 9, 'groove on channel 10');
  // tick scaling: a 240-tpb song gets half-size ticks from 480-tpb seeds
  const half = newSong({ ticksPerBeat: 240 });
  seedLibrary(half);
  interpret('insert fanfare at beat 0', half);
  eq(half.tracks[0].notes[1].tick, 120, 'seed ticks scaled to song resolution');
}


// the handover pair round-trips: markers and tempo changes survive the .mid
{
  const song = fixture();
  interpret('90 bpm at beat 4', song);
  const back = readSmf(writeSmf(song));
  eq(back.tempoMap.length, 2, 'tempo change survives export');
  eq(back.markers.length, 1, 'marker survives export');
  const doc = handoffDocument(back);
  ok(doc.includes('90'), 'handover names the changed tempo');
  ok(doc.includes('beat 4'), 'handover places the tempo change');
  ok(doc.includes('everyone looks at the stage'), 'handover carries the moment');
  ok(doc.includes('awards night'), 'handover carries the purpose');
}


// checks of the written notes
{
  const song = fixture();
  let f = checkNotes(song);
  ok(f.length === 0, 'clean fixture flags nothing (got: ' + f.map(x=>x.id).join(',') + ')');
  // overlap
  song.tracks[0].notes.push({ tick: 240, duration: 480, pitch: 60, velocity: 90 });
  f = checkNotes(song);
  ok(f.some(x => x.id === 'overlap'), 'overlap flagged');
  // flat dynamics
  const sf = fixture();
  for (let i = 0; i < 8; i++) sf.tracks[0].notes.push({ tick: 4800 + i * 480, duration: 480, pitch: 60 + (i % 4), velocity: 90 });
  for (const n of sf.tracks[0].notes) n.velocity = 90;
  f = checkNotes(sf);
  ok(f.some(x => x.id === 'flat-dynamics'), 'flat dynamics flagged');
  ok(!f.some(x => x.id === 'drum-range'), 'empty drum part not range-flagged');
  // edge pitch
  const s2 = fixture();
  s2.tracks[0].notes.push({ tick: 0, duration: 480, pitch: 10, velocity: 90 });
  ok(checkNotes(s2).some(x => x.id === 'edge-pitch'), 'edge pitch flagged');
  // drum range
  const s3 = fixture();
  s3.tracks[1].notes.push({ tick: 0, duration: 120, pitch: 20, velocity: 90 });
  ok(checkNotes(s3).some(x => x.id === 'drum-range'), 'drum key outside GM flagged');
  // truthful wording
  ok(formatFindings(checkNotes(fixture())).startsWith('Checks of the written notes'), 'reported as checks of the notes');
  // handoff carries findings
  const s4 = fixture();
  s4.tracks[0].notes.push({ tick: 240, duration: 480, pitch: 60, velocity: 90 });
  const doc = handoffDocument(s4);
  ok(doc.includes('Checks of the written notes') && doc.includes('overlap'), 'handoff says where it falls short');
}


// aiming in words
{
  const song = fixture();
  const res = interpret('make only the drums louder', song);
  ok(res.handled, 'only-the-drums handled');
  eq(song.tracks[1].notes[0].velocity, 127, 'drum velocity raised (clamped)');
  eq(song.tracks[0].notes[0].velocity, 100, 'melody untouched by word aim');
  ok(res.explanation.includes('Aimed at: drums'), 'explanation names the aim');
}
{
  const song = fixture();
  interpret('transpose beat 3 up 12', song);
  eq(song.tracks[0].notes[2].pitch, 76, 'beat 3 (third beat) transposed');
  eq(song.tracks[0].notes[0].pitch, 60, 'other beats untouched');
}
{
  const song = fixture();
  interpret('make the first half louder', song);
  eq(song.tracks[0].notes[0].velocity, 125, 'first half louder');
  eq(song.tracks[0].notes[3].velocity, 70, 'second half untouched');
}


// director honors an explicit aim
{
  const song = fixture();
  const res = interpret('too high', song, { tracks: [0], fromBeat: 2, toBeat: 3 });
  ok(res.handled, 'aimed command handled');
  eq(song.tracks[0].notes[0].pitch, 60, 'beat 0-1 untouched by aimed command');
  eq(song.tracks[0].notes[2].pitch, 52, 'beat 2-3 transposed');
}

// handover roles: derived from the notes, per part
{
  const song = fixture();
  const roles = describeRoles(song);
  const drumRole = roles.get(song.tracks[1]);
  ok(drumRole && drumRole.includes('rhythm'), 'drums hold the rhythm');
  const melRole = roles.get(song.tracks[0]);
  ok(melRole && melRole.length > 0, 'melody role described');
}
{
  const song = newSong();
  song.tracks.push({ name: 'pad', program: 48, isDrums: false, notes: [
    { tick: 0, duration: 960, pitch: 60, velocity: 80 },
    { tick: 0, duration: 960, pitch: 64, velocity: 80 },
    { tick: 0, duration: 960, pitch: 67, velocity: 80 },
  ]});
  const roles = describeRoles(song);
  ok(roles.get(song.tracks[0]).includes('chords'), 'overlapping notes described as chords');
}
{
  const song = newSong();
  song.tracks.push({ name: 'sub', program: 33, isDrums: false, notes: [
    { tick: 0, duration: 480, pitch: 36, velocity: 90 },
    { tick: 480, duration: 480, pitch: 43, velocity: 90 },
  ]});
  const roles = describeRoles(song);
  ok(roles.get(song.tracks[0]).includes('foundation'), 'low single notes described as foundation');
}

// abc score conversion
{
  eq(pitchToAbc(60), 'C', 'middle C');
  eq(pitchToAbc(72), 'c', 'C5 lowercase');
  eq(pitchToAbc(48), 'C,', 'C3 comma');
  eq(pitchToAbc(61), '^C', 'accidental inline');
  eq(pitchToAbc(84), "c'", 'C6 apostrophe');
}
{
  const song = newSong({ bpm: 100 });
  song.purpose = 'score test';
  song.tracks.push({ name: 'melody', program: 0, isDrums: false, notes: [
    { tick: 0, duration: 480, pitch: 60, velocity: 96 },
    { tick: 960, duration: 1920, pitch: 64, velocity: 96 },
    { tick: 960, duration: 1920, pitch: 67, velocity: 96 },
  ]});
  const abc = songToAbc(song);
  ok(abc.includes('Q:1/4=100'), 'tempo header');
  ok(abc.includes('M:4/4'), 'meter header');
  ok(abc.includes('T:score test'), 'title from purpose');
  const body = partToAbc(song, song.tracks[0]);
  ok(body.startsWith('C4 z4 '), 'quarter then quarter rest on grid: ' + body);
  ok(body.includes('[EG]'), 'simultaneous notes become a chord');
  ok(body.includes('-'), 'note crossing a barline is tied');
}
{
  const song = newSong();
  song.tracks.push({ name: 'drums', isDrums: true, program: null, notes: [
    { tick: 0, duration: 120, pitch: 36, velocity: 100 },
  ]});
  ok(songToAbc(song).includes('clef=perc'), 'drums use percussion clef');
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
