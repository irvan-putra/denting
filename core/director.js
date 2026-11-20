// director.js - turning a person's words into an aimed edit.
//
// Two routes:
// 1. Local commands: a small set of everyday requests ("too high",
//    "louder", "slower") handled deterministically, with no AI model and
//    no cost. Vague is fine: the product makes a reasonable attempt and
//    says what it did, so the person can steer by listening.
// 2. An AI model for everything else. The model and platform are an open
//    question from the product spec; nothing here picks one, and no paid
//    request is wired up. When no model is configured, the director says
//    so plainly instead of pretending.

import { transpose, scaleVelocity, setTempo, normalizeAim, addMarker } from './engine.js?v=0.4.19';
import { secondsToTick, GM_PROGRAMS as GM_PROGRAMS_REF, songEndTick as songEndTickRef } from './model.js?v=0.4.19';
import { saveFragment, insertFragment, savePrompt, listLibrary } from './library.js?v=0.4.19';

function parseClock(text) {
  const m = text.match(/(\d+):(\d\d)/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}

function m1(sec) { return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }

// Aiming in words: "only the drums", "beat 3", "beats 2 to 4", "the
// first half". Beat numbers count from 1, the way people count.
// Returns null when the words carry no aim, so the caller's aim stands.
export function parseAimFromText(text, song) {
  const aim = {};
  let any = false;
  for (let i = 0; i < song.tracks.length; i++) {
    const name = (song.tracks[i].name || '').toLowerCase();
    if (name && (text.includes('only the ' + name) || text.includes('just the ' + name) ||
                 text.includes('the ' + name + ' part'))) {
      aim.tracks = [i]; any = true; break;
    }
  }
  if (!aim.tracks && /(?:only|just)\s+the\s+drums?\b/.test(text)) {
    const idx = song.tracks.findIndex(t => t.isDrums);
    if (idx >= 0) { aim.tracks = [idx]; any = true; }
  }
  const range = text.match(/beats?\s+(\d+(?:\.\d+)?)\s*(?:to|through|-)\s*(\d+(?:\.\d+)?)/);
  if (range) {
    aim.fromBeat = parseFloat(range[1]) - 1;
    aim.toBeat = parseFloat(range[2]) - 1 + 1; // "beats 2 to 4" covers beats 2,3,4
    any = true;
  } else {
    const single = text.match(/\bbeat\s+(\d+(?:\.\d+)?)\b/);
    if (single && !/bpm|mark|insert|at beat/.test(text)) {
      const b = parseFloat(single[1]) - 1;
      aim.fromBeat = b; aim.toBeat = b + 1; any = true;
    }
    const half = text.match(/\b(first|second|last)\s+half\b/);
    if (half) {
      let end = 0;
      for (const t of song.tracks) for (const n of t.notes) end = Math.max(end, n.tick + n.duration);
      const halfBeat = end / song.ticksPerBeat / 2;
      if (/first/.test(half[1])) { aim.fromBeat = 0; aim.toBeat = halfBeat; }
      else { aim.fromBeat = halfBeat; aim.toBeat = null; }
      any = true;
    }
  }
  return any ? aim : null;
}

function describeAim(song, aim) {
  if (!aim) return '';
  const parts = [];
  if (aim.tracks && aim.tracks !== 'all') parts.push(aim.tracks.map(i => song.tracks[i] ? (song.tracks[i].name || 'track ' + (i + 1)) : '?').join(', '));
  if (aim.fromBeat != null || aim.toBeat != null) parts.push('beats ' + ((aim.fromBeat ?? 0) + 1) + (aim.toBeat != null ? ' to ' + aim.toBeat : ' on'));
  return parts.length ? ' Aimed at: ' + parts.join(', ') + '.' : '';
}

export function interpret(request, song, aim) {
  const text = request.trim().toLowerCase();
  if (!text) return { handled: false, reason: 'empty' };
  const wordAim = parseAimFromText(text, song);
  const effectiveAim = wordAim || aim;
  const aimNote = describeAim(song, wordAim);

  const num = (re, dflt) => {
    const m = text.match(re);
    return m ? parseInt(m[1], 10) : dflt;
  };

  // A moment that matters: "at 0:42 everyone looks at the stage",
  // "mark beat 8: the big reveal". Sudden means an instant: a marker
  // lands on exactly that tick.
  {
    const sec = parseClock(text);
    const at = text.match(/\bat\b/);
    const beatMark = text.match(/mark\s+beat\s+(\d+(?:\.\d+)?)[:\s]+(.+)/);
    if (sec != null && at) {
      const label = text.replace(/\bat\s+\d+:\d\d/, '').replace(/^(mark|moment|note)\s*/, '').trim() || 'moment';
      const tick = secondsToTick(song, sec);
      song.markers.push({ tick, label });
      song.markers.sort((a, b) => a.tick - b.tick);
      return { handled: true, explanation: 'Marked "' + label + '" at ' + m1(sec) + ' (beat ' + (tick / song.ticksPerBeat).toFixed(1) + '). It travels in the .mid and the handover notes.' };
    }
    if (beatMark) {
      addMarker(song, beatMark[2].trim(), parseFloat(beatMark[1]));
      return { handled: true, explanation: 'Marked "' + beatMark[2].trim() + '" at beat ' + beatMark[1] + '.' };
    }
  }

  // Tempo at a point: "90 bpm at beat 8" / "at beat 8, 90 bpm".
  {
    const m = text.match(/(\d+)\s*bpm\s+(?:from|at)\s+beat\s+(\d+(?:\.\d+)?)/) ||
              text.match(/at\s+beat\s+(\d+(?:\.\d+)?)[,\s]+(\d+)\s*bpm/);
    if (m) {
      const bpm = parseInt(m[1], 10), beat = parseFloat(m[2]);
      const tick = Math.round(beat * song.ticksPerBeat);
      song.tempoMap = song.tempoMap.filter(t => t.tick !== tick);
      song.tempoMap.push({ tick, bpm });
      song.tempoMap.sort((a, b) => a.tick - b.tick);
      return { handled: true, explanation: 'Tempo changes to ' + bpm + ' bpm at beat ' + beat + '. The handover notes carry the tempo map; some software asks before importing it.' };
    }
  }

  // Library: "save this as fanfare", "insert fanfare at beat 16", "library".
  {
    let m = text.match(/save\s+(?:this|that|it)\s+as\s+(.+)/);
    if (m) {
      const name = m[1].trim();
      const frag = saveFragment(song, effectiveAim, name, normalizeAim(song, effectiveAim));
      return { handled: true, explanation: 'Saved ' + frag.notes.length + ' notes as fragment "' + name + '". Insert it anywhere with: insert ' + name + ' at beat N.' };
    }
    m = text.match(/insert\s+(.+?)\s+at\s+beat\s+(\d+(?:\.\d+)?)/);
    if (m) {
      const added = insertFragment(song, m[1].trim(), parseFloat(m[2]));
      return { handled: true, explanation: 'Inserted "' + m[1].trim() + '" at beat ' + m[2] + ' (' + added + ' notes added).' };
    }
    m = text.match(/remember\s+(?:this\s+)?(?:prompt|phrasing)\s+as\s+(.+)/);
    if (m) {
      return { handled: false, reason: 'unclear', message: 'Remember which phrasing? Send it as: prompt NAME: the words to keep.' };
    }
    m = text.match(/^prompt\s+(.+?):\s*(.+)/);
    if (m) {
      savePrompt(song, m[1].trim(), m[2].trim());
      return { handled: true, explanation: 'Saved prompt "' + m[1].trim() + '".' };
    }
    if (/^(library|what.?s in the library|list library)$/.test(text)) {
      const items = listLibrary(song);
      return { handled: false, reason: 'info', message: items.length ? 'Library: ' + items.join('; ') : 'The library is empty. Save the aimed music with: save this as NAME.' };
    }
  }

  // Thinking out loud: "note: ..." is discussion, never an edit.
  {
    const m = text.match(/^(?:note|idea|thought)\s*:\s*(.+)/);
    if (m) {
      return { discussion: true, message: m[1].trim() };
    }
  }

  if (/\btranspos|too high|too low|higher|\blower\b/.test(text)) {
    // The interval is the number next to the direction word, never a
    // beat number elsewhere in the sentence.
    let semis = null;
    const dir = text.match(/(up|down|higher|lower|by)\s*(\d+)\s*(?:semitones?|half[ -]?steps?|steps?|tones?)?/);
    if (dir) {
      semis = parseInt(dir[2], 10);
      if (/down|lower/.test(dir[1])) semis = -semis;
    } else if (/too high|\blower\b|\bdown\b/.test(text)) semis = -12;
    else if (/too low|\bhigher\b|\bup\b/.test(text)) semis = 12;
    if (/octave/.test(text)) {
      const o = text.match(/(\d+)\s*octaves?/);
      semis = Math.sign(semis || 1) * 12 * (o ? parseInt(o[1], 10) : 1);
    }
    if (semis == null || !semis) return { handled: false, reason: 'unclear', message: 'Transpose by how much? One answer, then I do it.' };
    const n = transpose(song, semis, effectiveAim);
    return {
      handled: true,
      explanation: 'Transposed ' + n + ' notes ' + (semis > 0 ? 'up' : 'down') + ' ' + Math.abs(semis) + ' semitone' + (Math.abs(semis) === 1 ? '' : 's') + '. Drums left as they are.' + aimNote,
    };
  }
  if (/\blouder|softer|quiet|volume\b/.test(text)) {
    const up = /louder/.test(text);
    const factor = up ? 1.25 : 0.8;
    const n = scaleVelocity(song, factor, effectiveAim);
    return { handled: true, explanation: 'Made ' + n + ' notes ' + (up ? 'louder' : 'softer') + ' (velocity x' + factor + ').' + aimNote };
  }
  if (/\bfaster|slower|tempo|bpm\b/.test(text)) {
    const cur = song.tempoMap[0] ? song.tempoMap[0].bpm : 120;
    let bpm;
    const m = text.match(/(\d+)\s*bpm/);
    if (m) bpm = parseInt(m[1], 10);
    else bpm = Math.round(cur * (/faster/.test(text) ? 1.1 : 0.9));
    setTempo(song, bpm);
    return { handled: true, explanation: 'Tempo set to ' + bpm + ' bpm (was ' + Math.round(cur) + ').' };
  }
  return {
    handled: false,
    reason: 'needs-ai',
    message: 'That needs the AI music director, which is not configured yet. ' +
      'Local commands I can do now: transpose up/down, louder/softer, faster/slower. ' +
      'The model choice is an open decision (see docs/decisions.md).',
  };
}

// --- Manual assistant bridge ---
// No model is built in. The person can copy a brief of the piece to an
// assistant they already use and paste back a plan. A plan uses exactly
// the operations the typed commands have, no more, and goes through the
// same engine and aim enforcement. The schema below is the one the
// evaluation harness uses, so a future wired-in model speaks it too.

export const PLAN_SCHEMA = 'You convert a music edit request into JSON only, no other text.\n' +
  'Schema: {"op": one of "transpose","louder","softer","faster","slower","tempo","none",\n' +
  '"track": "all" or a part name, "fromBeat": integer or null, "toBeat": integer or null,\n' +
  '"amount": integer semitones or null, "bpm": integer or null}\n' +
  'Use op "none" when the request is not a note/tempo edit of existing music.\n' +
  'Beats count from 0. Only the listed operations exist; nothing else will be applied.';

export function planBrief(song, requestText) {
  const lines = [];
  lines.push('You are helping edit a piece of music in denting, a local MIDI editor.');
  lines.push('Reply with ONE JSON object only, no other text.');
  lines.push('');
  lines.push('The piece:');
  lines.push('- purpose: ' + (song.purpose || '(not stated)'));
  if (song.tracks.length) {
    lines.push('- parts: ' + song.tracks.map(t =>
      (t.name || '(untitled)') + ' (' + (t.isDrums ? 'drums' : (GM_PROGRAMS_REF[t.program] || 'instrument')) + ', ' + t.notes.length + ' notes)').join('; '));
    lines.push('- length: about ' + Math.round(songEndTickRef(song) / song.ticksPerBeat) + ' beats at ' + Math.round(song.tempoMap[0].bpm) + ' bpm');
  } else {
    lines.push('- no music yet');
  }
  if (song.markers && song.markers.length) {
    lines.push('- markers: ' + song.markers.map(mk => 'beat ' + (mk.tick / song.ticksPerBeat) + ' "' + mk.label + '"').join('; '));
  }
  lines.push('');
  lines.push(PLAN_SCHEMA);
  lines.push('');
  lines.push('My request: ' + (requestText || '(describe your edit here)'));
  return lines.join('\n');
}


function planAim(song, plan) {
  const aim = { tracks: 'all', fromBeat: null, toBeat: null };
  if (plan.track != null && plan.track !== 'all') {
    const want = String(plan.track).toLowerCase();
    const idx = song.tracks.findIndex(t => (t.name || '').toLowerCase() === want);
    if (idx < 0) return { error: 'No part named "' + plan.track + '". Parts here: ' + (song.tracks.map(t => t.name || '(untitled)').join(', ') || 'none yet') + '.' };
    aim.tracks = [idx];
  }
  for (const k of ['fromBeat', 'toBeat']) {
    if (plan[k] != null) {
      if (typeof plan[k] !== 'number' || !isFinite(plan[k])) return { error: k + ' must be a number or null.' };
      aim[k] = plan[k];
    }
  }
  return { aim };
}

// Apply one checked plan. Pure engine calls: never throws on bad input,
// returns handled:false with a reason instead. Callers that preview wrap
// it in snapshot/restore.
export function applyPlan(song, plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return { handled: false, reason: 'invalid', message: 'The plan is not a JSON object.' };
  }
  const op = plan.op;
  if (op === 'none') {
    return { handled: false, reason: 'info', message: 'The plan says no edit applies (op "none"). Nothing was changed.' };
  }
  const OPS = ['transpose', 'louder', 'softer', 'faster', 'slower', 'tempo'];
  if (!OPS.includes(op)) {
    return { handled: false, reason: 'invalid', message: 'Unknown op "' + op + '". Only ' + OPS.join(', ') + ' and none exist.' };
  }
  const { aim, error } = planAim(song, plan);
  if (error) return { handled: false, reason: 'invalid', message: error };
  // Plan beats are 0-based (the brief says so), unlike typed words.
  const aimParts = [];
  if (aim.tracks !== 'all') aimParts.push(aim.tracks.map(i => song.tracks[i] ? (song.tracks[i].name || 'track ' + (i + 1)) : '?').join(', '));
  if (aim.fromBeat != null || aim.toBeat != null) aimParts.push('beats ' + (aim.fromBeat ?? 0) + (aim.toBeat != null ? ' to ' + aim.toBeat : ' on'));
  const aimNote = aimParts.length ? ' Aimed at: ' + aimParts.join(', ') + '.' : '';
  if (op === 'transpose') {
    const semis = plan.amount;
    if (typeof semis !== 'number' || !Number.isInteger(semis) || semis === 0 || Math.abs(semis) > 48) {
      return { handled: false, reason: 'invalid', message: 'transpose needs "amount": a nonzero whole number of semitones (48 at most).' };
    }
    const n = transpose(song, semis, aim);
    return { handled: true, explanation: 'Transposed ' + n + ' notes ' + (semis > 0 ? 'up' : 'down') + ' ' + Math.abs(semis) + ' semitone' + (Math.abs(semis) === 1 ? '' : 's') + '. Drums left as they are.' + aimNote };
  }
  if (op === 'louder' || op === 'softer') {
    const up = op === 'louder';
    const factor = up ? 1.25 : 0.8;
    const n = scaleVelocity(song, factor, aim);
    return { handled: true, explanation: 'Made ' + n + ' notes ' + op + ' (velocity x' + factor + ').' + aimNote };
  }
  const cur = song.tempoMap[0] ? song.tempoMap[0].bpm : 120;
  if (op === 'faster' || op === 'slower') {
    const bpm = Math.round(cur * (op === 'faster' ? 1.1 : 0.9));
    setTempo(song, bpm);
    return { handled: true, explanation: 'Tempo set to ' + bpm + ' bpm (was ' + Math.round(cur) + ').' };
  }
  // tempo
  const bpm = plan.bpm;
  if (typeof bpm !== 'number' || !Number.isInteger(bpm) || bpm < 20 || bpm > 400) {
    return { handled: false, reason: 'invalid', message: 'tempo needs "bpm": a whole number between 20 and 400.' };
  }
  setTempo(song, bpm);
  return { handled: true, explanation: 'Tempo set to ' + bpm + ' bpm (was ' + Math.round(cur) + ').' };
}
