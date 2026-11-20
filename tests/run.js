// Minimal test runner: node tests/run.js
import { writeSmf, readSmf } from '../core/smf.js';
import { newSong, addTrack, tickToSeconds, GM_PROGRAMS } from '../core/model.js';
import { applyAimed, transpose, scaleVelocity, setTempo, addMarker, checkpoint, restoreRevision, snapshot } from '../core/engine.js';
import { describeRoles, handoffDocument } from '../core/handoff.js';
import { interpret, applyPlan, planBrief } from '../core/director.js';
import { listLibrary } from '../core/library.js';
import { SEEDS, seedLibrary } from '../core/seeds.js';
import { songToAbc, pitchToAbc, partToAbc, partToAbcBars, songToAbcTunes, drumToAbc } from '../core/abc.js';
import { abcToSong } from '../core/abc-import.js';
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
  const body = partToAbc(song, song.tracks[0]).join(' ');
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
{
  const song = newSong();
  song.tracks.push({ name: 'sub', program: 33, isDrums: false, notes: [
    { tick: 0, duration: 480, pitch: 36, velocity: 90 },
  ]});
  ok(songToAbc(song).includes('clef=bass'), 'low part gets bass clef');
  eq(drumToAbc(36), 'F', 'kick at standard position');
  eq(drumToAbc(42), 'g', 'hihat at standard position');
  ok(drumToAbc(60), 'unmapped drum falls back to nearest position');
}


{
  const song = newSong({ bpm: 120 });
  const notes = [];
  for (let bar = 0; bar < 20; bar++) notes.push({ tick: bar * 4 * 480, duration: 480, pitch: 60, velocity: 90 });
  song.tracks.push({ name: 'm', program: 0, isDrums: false, otherEvents: [], notes });
  const tunes = songToAbcTunes(song, 8);
  eq(tunes.length, 3, '20 bars in 8-bar chunks -> 3 tunes');
  ok(tunes[0].includes('T:') && !tunes[1].includes('T:'), 'title only on first chunk');
  eq(partToAbcBars(song, song.tracks[0]).length, 20, 'one entry per bar');
}

// --- manual assistant bridge: applyPlan / planBrief ---
{
  const song = fixture();
  const res = applyPlan(song, { op: 'transpose', amount: 2, track: 'all', fromBeat: null, toBeat: null });
  ok(res.handled, 'plan: transpose applies');
  eq(song.tracks[0].notes[0].pitch, 62, 'plan: melody shifted up 2');
  eq(song.tracks[1].notes[0].pitch, 36, 'plan: drums left alone');
}
{
  const song = fixture();
  const res = applyPlan(song, { op: 'transpose', amount: -1, track: 'melody', fromBeat: 1, toBeat: 2 });
  ok(res.handled && res.explanation.includes('melody'), 'plan: aimed transpose names the part');
  eq(song.tracks[0].notes[0].pitch, 60, 'plan: note before aim untouched');
  eq(song.tracks[0].notes[1].pitch, 61, 'plan: note inside aim shifted');
  eq(song.tracks[0].notes[3].pitch, 65, 'plan: note after aim untouched');
  eq(song.tracks[1].notes[0].velocity, 110, 'plan: other track untouched');
}
{
  const song = fixture();
  const res = applyPlan(song, { op: 'transpose', amount: 2, track: 'oboe' });
  ok(!res.handled && res.message.includes('oboe'), 'plan: unknown part refused by name');
  eq(song.tracks[0].notes[0].pitch, 60, 'plan: refused plan changes nothing');
}
{
  const song = fixture();
  ok(!applyPlan(song, { op: 'arpeggiate' }).handled, 'plan: unknown op refused');
  ok(!applyPlan(song, { op: 'transpose' }).handled, 'plan: transpose without amount refused');
  ok(!applyPlan(song, null).handled, 'plan: non-object refused');
  const resNone = applyPlan(song, { op: 'none' });
  ok(!resNone.handled && resNone.reason === 'info', 'plan: none is an honest no-op');
  eq(song.tracks[0].notes[0].pitch, 60, 'plan: refusals never move notes');
}
{
  const song = fixture();
  const res = applyPlan(song, { op: 'tempo', bpm: 90 });
  ok(res.handled && song.tempoMap[0].bpm === 90, 'plan: tempo sets bpm');
  ok(!applyPlan(song, { op: 'tempo', bpm: 9000 }).handled, 'plan: absurd bpm refused');
  const v0 = song.tracks[0].notes[0].velocity;
  applyPlan(song, { op: 'louder' });
  ok(song.tracks[0].notes[0].velocity > v0, 'plan: louder raises velocity');
}
{
  const song = fixture();
  const brief = planBrief(song, 'make the melody gentler');
  ok(brief.includes('company awards night'), 'brief: carries the purpose');
  ok(brief.includes('melody') && brief.includes('drums'), 'brief: names the parts');
  ok(brief.includes('"op"') && brief.includes('none'), 'brief: carries the schema');
  ok(brief.includes('make the melody gentler'), 'brief: carries the request');
  ok(brief.includes('Beats count from 0'), 'brief: states the beat convention');
}

{
  const song = fixture();
  const r1 = interpret('make it slower', song);
  ok(r1.handled && song.tempoMap[0].bpm === 90, 'slower sets tempo (not trapped by transpose)');
  const song2 = fixture();
  const r2 = interpret('slower', song2);
  ok(r2.handled && song2.tempoMap[0].bpm === 90, 'bare "slower" sets tempo');
  const song3 = fixture();
  const r3 = interpret('make it faster', song3);
  ok(r3.handled && song3.tempoMap[0].bpm === 110, 'faster still sets tempo');
  const song4 = fixture();
  const r4 = interpret('make it lower', song4);
  ok(r4.handled || (r4.reason === 'unclear'), 'lower still routes to transpose');
}

{
  const song = fixture();
  const b1 = planBrief(song, 'make it faster');
  ok(b1.includes('My request: make it faster'), 'brief carries the typed request');
  ok(!b1.includes('(describe your edit here)'), 'brief with a request has no placeholder');
  const b2 = planBrief(song, '');
  ok(b2.includes('(describe your edit here)'), 'brief without a request keeps the placeholder');
  const song2 = fixture();
  const r = applyPlan(song2, { op: 'none', track: 'all', fromBeat: null, toBeat: null, amount: null, bpm: null });
  ok(!r.handled && r.reason === 'info', 'op none is refused as info, not applied');
}

// ABC import (core/abc-import.js): the bounded subset the exporter writes.
{
  // simple single-voice tune with headers
  const r1 = abcToSong('X: 1\nT: Sad phrase\nM: 4/4\nL: 1/4\nQ: 1/4=60\nK: C major\nC E G c | c G E C |]\n');
  eq(r1.errors, [], 'import: simple tune no errors');
  eq(r1.song.timeSignatures[0].numerator, 4, 'import: meter');
  eq(r1.song.tempoMap[0].bpm, 60, 'import: tempo');
  eq(r1.song.tracks.length, 1, 'import: one track');
  eq(r1.song.tracks[0].notes.length, 8, 'import: 8 notes');
  eq(r1.song.tracks[0].notes[0], { tick: 0, duration: 480, pitch: 60, velocity: 96 }, 'import: first note');
  eq(r1.song.tracks[0].notes[7].pitch, 60, 'import: last note ends on tonic');

  // round trip through denting's own exporter, chords and ties included
  const song = fixture();
  const abc = songToAbc(song);
  const r2 = abcToSong(abc);
  eq(r2.errors, [], 'import: own export no errors');
  const melOut = song.tracks.filter(t => !t.isDrums).flatMap(t => t.notes)
    .map(n => ({ tick: n.tick, duration: n.duration, pitch: n.pitch }))
    .sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
  const melIn = r2.song.tracks.filter(t => !t.isDrums).flatMap(t => t.notes)
    .map(n => ({ tick: n.tick, duration: n.duration, pitch: n.pitch }))
    .sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
  eq(melIn, melOut, 'import: melodic round trip exact');
  const back = readSmf(writeSmf(r2.song));
  eq(back.tracks.filter(t => !t.isDrums).flatMap(t => t.notes).length, melOut.length, 'import: MIDI bytes round trip');

  // tie across a barline joins durations
  const long = newSong({ bpm: 120 });
  const lt = addTrack(long, { name: 'p' });
  lt.notes.push({ tick: 1440, duration: 960, pitch: 62, velocity: 96 }); // crosses the barline at 1920
  const r3 = abcToSong(songToAbc(long));
  eq(r3.errors, [], 'import: tied note no errors');
  eq(r3.song.tracks[0].notes.map(n => ({ tick: n.tick, duration: n.duration, pitch: n.pitch })),
    [{ tick: 1440, duration: 960, pitch: 62 }], 'import: tie joins durations');

  // unsupported constructs are errors, never guesses
  const r4 = abcToSong('X:1\nM:4/4\nL:1/4\nK:C\nC/2 E\n');
  ok(r4.errors.length > 0, 'import: fractional length is an error');
}

// Unequal-duration chords (core/abc.js): split into tied segments, capped
// at the next attack, so dense harmony round-trips through the importer.
{
  // chord members C:8, E:2, G:4 units (tpb 480, grid 120 ticks)
  const song = newSong({ bpm: 120 });
  const t = addTrack(song, { name: 'p' });
  t.notes.push(
    { tick: 0, duration: 960, pitch: 60, velocity: 96 }, // C, 8 units
    { tick: 0, duration: 240, pitch: 64, velocity: 96 }, // E, 2 units
    { tick: 0, duration: 480, pitch: 67, velocity: 96 }, // G, 4 units
  );
  eq(partToAbc(song, t), ['[CEG]2-[CG]2-C4'], 'chords: unequal members split into tied segments');
  const r = abcToSong(songToAbc(song));
  eq(r.errors, [], 'chords: split reimport no errors');
  eq(r.song.tracks[0].notes.map(n => ({ tick: n.tick, duration: n.duration, pitch: n.pitch }))
      .sort((a, b) => a.pitch - b.pitch),
    [{ tick: 0, duration: 960, pitch: 60 }, { tick: 0, duration: 240, pitch: 64 }, { tick: 0, duration: 480, pitch: 67 }],
    'chords: unequal members round trip exact');
  eq(songToAbc(r.song), songToAbc(song), 'chords: text fixed point');

  // equal-duration members keep the plain [CEG]len form
  const flat = newSong({ bpm: 120 });
  const ft = addTrack(flat, { name: 'p' });
  ft.notes.push(
    { tick: 0, duration: 480, pitch: 60, velocity: 96 },
    { tick: 0, duration: 480, pitch: 64, velocity: 96 },
    { tick: 0, duration: 480, pitch: 67, velocity: 96 },
  );
  eq(partToAbc(flat, ft), ['[CEG]4'], 'chords: equal members unchanged');

  // a note still sounding at the next attack is written up to that
  // attack (one voice cannot overlap); the attack keeps its true slot
  const over = newSong({ bpm: 120 });
  const ot = addTrack(over, { name: 'p' });
  ot.notes.push(
    { tick: 0, duration: 960, pitch: 60, velocity: 96 },   // held 8 units
    { tick: 480, duration: 480, pitch: 64, velocity: 96 }, // attack at unit 4
  );
  eq(partToAbc(over, ot), ['C4', 'E4'], 'overlap: held note capped at next attack, attack unshifted');
  const ro = abcToSong(songToAbc(over));
  eq(ro.song.tracks[0].notes.map(n => ({ tick: n.tick, duration: n.duration, pitch: n.pitch }))
      .sort((a, b) => a.tick - b.tick),
    [{ tick: 0, duration: 480, pitch: 60 }, { tick: 480, duration: 480, pitch: 64 }],
    'overlap: reimport keeps both attacks at their true ticks');

  // unequal chord crossing a barline: ties and barlines combine
  const cross = newSong({ bpm: 120 });
  const ct = addTrack(cross, { name: 'p' });
  ct.notes.push(
    { tick: 1440, duration: 960, pitch: 60, velocity: 96 }, // unit 12, 8 units: crosses bar 16
    { tick: 1440, duration: 480, pitch: 64, velocity: 96 }, // unit 12, 4 units
  );
  eq(partToAbc(cross, ct), ['z12', '[CE]4-|C4'], 'chords: unequal members tied across a barline');
  const rc = abcToSong(songToAbc(cross));
  eq(rc.errors, [], 'chords: barline-crossing reimport no errors');
  eq(rc.song.tracks[0].notes.map(n => ({ tick: n.tick, duration: n.duration, pitch: n.pitch }))
      .sort((a, b) => a.pitch - b.pitch),
    [{ tick: 1440, duration: 960, pitch: 60 }, { tick: 1440, duration: 480, pitch: 64 }],
    'chords: barline-crossing unequal members round trip exact');

  // chunking (two-bar tunes) still splits the split chords cleanly
  const bars = partToAbcBars(cross, ct);
  eq(bars.length, 2, 'chords: crossing chord spans two bars');
  eq(songToAbcTunes(cross).length >= 1, true, 'chords: tunes render');
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
