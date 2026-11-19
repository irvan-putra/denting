// denting web app: local-first direction of a piece of music.
import { readSmf, writeSmf } from '../core/smf.js?v=0.4.11';
import { newSong, tickToBeat, tickToSeconds, songEndTick, GM_PROGRAMS, GM_DRUMS } from '../core/model.js?v=0.4.11';
import { checkpoint, restoreRevision, snapshot, restore } from '../core/engine.js?v=0.4.11';
import { handoffDocument } from '../core/handoff.js?v=0.4.11';
import { interpret } from '../core/director.js?v=0.4.11';
import { listLibrary } from '../core/library.js?v=0.4.11';
import { seedLibrary } from '../core/seeds.js?v=0.4.11';
import { checkNotes } from '../core/checks.js?v=0.4.11';
import { songToAbcTunes } from '../core/abc.js?v=0.4.11';

const STORE_KEY = 'denting.song.v1';
const $ = id => document.getElementById(id);

let song = load() || seedLibrary(newSong());

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = newSong();
    restore(s, JSON.parse(raw).state || raw);
    s.revisions = JSON.parse(raw).revisions || [];
    return s;
  } catch { return null; }
}
function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify({ state: snapshot(song), revisions: song.revisions }));
}

function say(msg, cls = '') {
  const el = $('status');
  el.textContent = msg;
  el.className = cls;
}

// While the example file is being fetched, edits are paused so a request
// fired mid-load cannot be silently overwritten when the fetch lands.
let busy = false;
function setBusy(on) {
  busy = on;
  ['send', 'request', 'importBtn', 'loadExample'].forEach(id => { $(id).disabled = on; });
}

function render() {
  $('purpose').value = song.purpose || $('purpose').getAttribute('value') || '';
  // overview
  const ov = $('overview');
  if (!song.tracks.length) {
    ov.innerHTML = '<p class="note">No music yet. Import a .mid to start from an existing file, or direct one into being (AI director: planned).</p>';
  } else {
    const end = songEndTick(song);
    let html = '<table><tr><th>part</th><th>instrument</th><th>notes</th></tr>';
    song.tracks.forEach((t, i) => {
      let instrument;
      if (t.isDrums) {
        const sounds = [...new Set(t.notes.map(n => GM_DRUMS[n.pitch]).filter(Boolean))];
        instrument = 'Drums' + (sounds.length ? ' (' + sounds.slice(0, 4).join(', ') + (sounds.length > 4 ? ', ...' : '') + ')' : '');
      } else {
        instrument = escapeHtml(GM_PROGRAMS[t.program] || '?');
      }
      html += '<tr><td>' + escapeHtml(t.name || '(untitled)') + '</td><td>' + instrument + '</td><td>' + t.notes.length + '</td></tr>';
    });
    html += '</table><p class="note">' + tickToBeat(song, end).toFixed(1) + ' beats, about ' +
      Math.round(tickToSeconds(song, end)) + 's at ' + Math.round(song.tempoMap[0].bpm) + ' bpm.</p>';
    ov.innerHTML = html;
  }
  // aim track options
  const sel = $('aimTrack');
  const cur = sel.value;
  sel.innerHTML = '<option value="all">all</option>' +
    song.tracks.map((t, i) => '<option value="' + i + '">' + escapeHtml(t.name || 'track ' + (i + 1)) + '</option>').join('');
  sel.value = cur;
  // checks of the written notes
  const chk = $('checks');
  if (chk) {
    if (!song.tracks.length) {
      chk.innerHTML = '<p class="note">Checks of the written notes run once there is music. They inspect the notes, never the sound.</p>';
    } else {
      const findings = checkNotes(song);
      chk.innerHTML = findings.length
        ? findings.map(f => '<div class="turn">' + escapeHtml(f.text) + '</div>').join('')
        : '<p class="note">Checks of the written notes: nothing to flag.</p>';
    }
  }
  // library
  const lib = $('libraryList');
  if (lib) {
    const items = listLibrary(song);
    lib.innerHTML = items.length
      ? items.map(x => '<div class="turn">' + escapeHtml(x) + '</div>').join('')
      : '<p class="note">Nothing saved yet. Aim at a stretch and say: save this as NAME. Keep a phrasing with: prompt NAME: the words.</p>';
  }
  // score (reading picture; quantized, no loudness)
  const sc = $('score');
  if (sc && window.ABCJS) {
    sc.innerHTML = '';
    try {
      for (const tune of songToAbcTunes(song)) {
        const d = document.createElement('div');
        sc.appendChild(d);
        window.ABCJS.renderAbc(d, tune, { staffwidth: 680, responsive: 'resize', add_classes: true });
        // Include long staff labels and outlying ledger lines in the viewport.
        const svg = d.querySelector('svg');
        if (svg) {
          const box = svg.getBBox();
          const width = Math.max(710, box.x + box.width + 15);
          const height = Math.max(1, box.y + box.height + 15);
          svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
          const wrap = svg.parentElement;
          wrap.style.paddingBottom = `${height / width * 100}%`;
          wrap.style.maxWidth = '100%';
        }
      }
    }
    catch (e) { sc.innerHTML = '<p class="note">The score picture could not be drawn for these notes.</p>'; }
  }
  // revisions
  const rev = $('revisions');
  if (!song.revisions.length) {
    rev.innerHTML = '<p class="note">Every change begins with your request; you can return to any earlier state.</p>';
  } else {
    rev.innerHTML = song.revisions.map(r =>
      '<div class="turn"><span class="req">' + escapeHtml(r.request || r.source) + '</span>' +
      (r.explanation ? '<br>' + escapeHtml(r.explanation) : '') +
      ' <button data-rev="' + r.id + '">return here</button></div>').reverse().join('');
    rev.querySelectorAll('button[data-rev]').forEach(b => b.onclick = () => {
      checkpoint(song, { request: '(state before returning)', source: 'auto' });
      restoreRevision(song, parseInt(b.dataset.rev, 10));
      save(); const pb = $('printBtn');
if (pb) pb.onclick = () => window.print();
render();
      say('Returned to that earlier state. The state you left is kept above.', 'ok');
    });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function currentAim() {
  const t = $('aimTrack').value;
  const from = $('aimFrom').value.trim();
  const to = $('aimTo').value.trim();
  return {
    tracks: t === 'all' ? 'all' : [parseInt(t, 10)],
    fromBeat: from === '' ? null : parseFloat(from),
    toBeat: to === '' ? null : parseFloat(to),
  };
}

$('purpose').onchange = () => {
  song.purpose = $('purpose').value.trim();
  save();
  say('Purpose remembered. Every later request counts as for this, until you say otherwise.', 'ok');
};

$('send').onclick = () => {
  if (busy) { say('Still loading the example; that request was not sent. Try again when loading finishes.', 'err'); return; }
  const text = $('request').value.trim();
  if (!text) return;
  const before = snapshot(song);
  let res;
  try {
    res = interpret(text, song, currentAim());
  } catch (e) {
    restore(song, before);
    say('That change failed and nothing was changed: ' + e.message, 'err');
    return;
  }
  const log = $('log');
  const div = document.createElement('div');
  div.className = 'turn';
  div.innerHTML = '<span class="req">' + escapeHtml(text) + '</span><br>' +
    escapeHtml(res.explanation || res.message || '(nothing done)');
  log.prepend(div);
  $('request').value = '';
  if (res.discussion) {
    // Thinking out loud: recorded in the conversation, music untouched.
    say('Noted, music unchanged. Agree on it first, then ask for the change.', 'ok');
  } else if (res.handled) {
    checkpoint(song, { request: text, explanation: res.explanation });
    save(); render();
    say(res.explanation, 'ok');
  } else {
    restore(song, before); // a failed attempt never moves the music
    say(res.message || 'Not something I can do yet.', res.reason === 'info' ? 'ok' : 'err');
  }
};
$('request').addEventListener('keydown', e => { if (e.key === 'Enter') $('send').click(); });

$('importBtn').onclick = () => $('import').click();
$('loadExample').onclick = async () => {
  if (busy) return;
  if (song.tracks.length && !confirm('Replace the current unsaved piece with the public Balonku example?')) return;
  setBusy(true);
  say('Loading the Balonku example... editing is paused until it finishes.');
  try {
    const res = await fetch('files/balonku/Balonku-assumed-timing.mid');
    if (!res.ok) throw new Error('download failed: ' + res.status);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const loaded = readSmf(bytes);
    loaded.libraryRefs = (song.libraryRefs || []).slice();
    if (!loaded.libraryRefs.length) seedLibrary(loaded);
    loaded.revisions = [];
    song = loaded;
    checkpoint(song, { request: 'load Balonku example', explanation: 'Loaded the public Balonku assumed-timing melody.', source: 'import' });
    save(); render();
    say('Loaded Balonku example: ' + song.tracks.length + ' parts, 87 notes, 56.5 seconds at the assumed 120 bpm.', 'ok');
  } catch (e) {
    say('Could not load the example: ' + e.message + '. Your previous state is unchanged.', 'err');
  } finally {
    setBusy(false);
  }
};
$('import').onchange = async () => {
  const f = $('import').files[0];
  if (!f) return;
  try {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const keptLibrary = (song.libraryRefs || []).slice();
    song = readSmf(bytes);
    song.libraryRefs = keptLibrary;
    if (!song.libraryRefs.length) seedLibrary(song);
    song.revisions = [];
    checkpoint(song, { request: 'import ' + f.name, explanation: 'Started from ' + f.name + '.', source: 'import' });
    save(); render();
    say('Imported ' + f.name + ': ' + song.tracks.length + ' parts. Controller data is preserved.', 'ok');
  } catch (e) {
    say('Could not read ' + f.name + ': ' + e.message, 'err');
  }
};

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

$('export').onclick = () => {
  if (!song.tracks.length) { say('Nothing to export yet.', 'err'); return; }
  download('denting.mid', new Blob([writeSmf(song)], { type: 'audio/midi' }));
  say('Exported denting.mid. Open it in any music software.', 'ok');
};

$('exportHandoff').onclick = () => {
  download('denting-handover.md', new Blob([handoffDocument(song)], { type: 'text/markdown' }));
  say('Exported the handover notes: purpose, structure, timing and the moments that matter.', 'ok');
};

// --- simple local playback preview ---
let audio = null, nodes = [];
$('play').onclick = () => {
  if (!song.tracks.length) { say('Nothing to play yet.', 'err'); return; }
  $('stop').onclick();
  audio = audio || new (window.AudioContext || window.webkitAudioContext)();
  const t0 = audio.currentTime + 0.1;
  for (const track of song.tracks) {
    for (const n of track.notes) {
      const start = t0 + tickToSeconds(song, n.tick);
      const dur = Math.max(0.05, tickToSeconds(song, n.tick + n.duration) - tickToSeconds(song, n.tick));
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = track.isDrums ? 'square' : (track.program < 8 ? 'triangle' : track.program < 32 ? 'sawtooth' : 'sine');
      osc.frequency.value = 440 * Math.pow(2, (n.pitch - 69) / 12);
      gain.gain.setValueAtTime((n.velocity / 127) * 0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain).connect(audio.destination);
      osc.start(start); osc.stop(start + dur + 0.05);
      nodes.push(osc);
    }
  }
  say('Playing a plain-synth preview. The .mid carries the real instrument numbers.', 'ok');
};
$('stop').onclick = () => {
  for (const n of nodes) { try { n.stop(); } catch {} }
  nodes = [];
};

render();
say(song.tracks.length ? 'Your piece from last time is still here.' : 'Ready. This draft never sends your work anywhere.', 'ok');
