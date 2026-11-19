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

import { transpose, scaleVelocity, setTempo } from './engine.js';

export function interpret(request, song, aim) {
  const text = request.trim().toLowerCase();
  if (!text) return { handled: false, reason: 'empty' };

  const num = (re, dflt) => {
    const m = text.match(re);
    return m ? parseInt(m[1], 10) : dflt;
  };

  if (/\btranspos|too high|too low|higher|lower\b/.test(text)) {
    let semis;
    if (/too high|lower|down/.test(text)) semis = -num(/(\d+)\s*(semi|half)?\s*(step|tone)?/, 12);
    else if (/too low|higher|\bup\b/.test(text)) semis = num(/(\d+)\s*(semi|half)?\s*(step|tone)?/, 12);
    else semis = num(/(-?\d+)\s*(semi|half)?\s*(step|tone)?/, 0);
    if (/octave/.test(text)) semis = Math.sign(semis || 1) * 12 * Math.max(1, Math.abs(num(/(\d+)\s*octave/, 1)));
    if (!semis) return { handled: false, reason: 'unclear', message: 'Transpose by how much? One answer, then I do it.' };
    const n = transpose(song, semis, aim);
    return {
      handled: true,
      explanation: 'Transposed ' + n + ' notes ' + (semis > 0 ? 'up' : 'down') + ' ' + Math.abs(semis) + ' semitone' + (Math.abs(semis) === 1 ? '' : 's') + '. Drums left as they are.',
    };
  }
  if (/\blouder|softer|quiet|volume\b/.test(text)) {
    const up = /louder/.test(text);
    const factor = up ? 1.25 : 0.8;
    const n = scaleVelocity(song, factor, aim);
    return { handled: true, explanation: 'Made ' + n + ' notes ' + (up ? 'louder' : 'softer') + ' (velocity x' + factor + ').' };
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
