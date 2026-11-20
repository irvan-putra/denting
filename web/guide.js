// denting first-song guide: a short walk over the real controls.
// Every step asks for something the app already does; the guide watches
// the app's own status/action events and advances when the step's action
// really happened. It never pretends a capability exists.

const STEPS = [
  {
    title: 'welcome',
    target: '#guideBtn',
    text: 'denting is a workshop for one piece of music: it runs locally in your browser, and nothing leaves your device unless you export it. This guide walks a real first song in about two minutes.',
    why: 'Each step asks you to do one real thing; the guide moves on when it sees you did it.',
  },
  {
    title: 'say what it is for',
    target: '#purpose',
    text: 'In "what is this music for?", write the occasion in your own words. denting remembers it for every later request.',
    why: 'A request like "make it grander" only makes sense against a purpose.',
    advanceOn: { status: 'Purpose remembered' },
  },
  {
    title: 'start from the example',
    target: '#loadExample',
    text: 'Press "Load Balonku example". It loads the public Balonku melody (supplied pitches, assumed rhythm) so there is real music to work on.',
    why: 'You can also import any .mid of your own later.',
    advanceOn: { status: 'Loaded Balonku example' },
  },
  {
    title: 'hear it',
    target: '#play',
    text: 'Press Play. The preview is a plain synth; the exported .mid carries the real instrument numbers. Drag the timeline under the buttons to jump to any spot instead of replaying from the start.',
    why: 'Directing music you have not heard is guessing.',
    advanceOn: { action: 'play' },
  },
  {
    title: 'say it your way',
    target: '#request',
    text: 'Leave the two beats boxes empty so no spot is aimed, type "make it faster" and press Direct. Press Play before and after: the whole piece clearly speeds up.',
    why: 'A request with no aim touches the whole piece; tempo is the easiest change to hear.',
    advanceOn: { event: 'saved' },
  },
  {
    title: 'aim at one moment',
    target: '#aimFrom',
    text: 'Set the aim to beats 65 - 69, ask to "insert fanfare at beat 65", and Direct. Only the aimed beats change.',
    why: 'Aiming is how you change the quiet spot without touching the rest.',
    advanceOn: { event: 'saved' },
  },
  {
    title: 'check it holds together',
    target: '#checks',
    text: 'Read the "does it hold together?" panel. It flags mechanical issues, like every note having the same loudness.',
    why: 'It is a checklist, not a judge of taste.',
  },
  {
    title: 'bring an assistant in, by hand',
    target: '#askAssistant',
    text: 'Type your request in the request box first, then press "Copy brief for an assistant". Paste the brief to an assistant you already use, paste its JSON plan into the box here, press "Check plan" and read the preview, then "Apply plan". If the plan says "none", the assistant never got your request; send the edit in words and paste its new plan back.',
    why: 'No AI is built into denting. A plan can only use the same edits as typed commands; composing a new piece from a description is not possible this way.',
    advanceOn: { action: 'plan-applied' },
  },
  {
    title: 'take it with you',
    target: '#export',
    text: 'Three ways out: "Export .mid" for the music file, "Export handover notes" for a text summary, and "Print sheet notes" for the score (save as PDF from your browser\'s print dialog). The score is drawn below the player.',
    why: 'The .mid is the source of truth; the score is a reading picture, quantized and without loudness.',
    advanceOn: { action: 'export-mid' },
  },
  {
    title: 'that is the whole loop',
    target: '#revisions',
    text: 'Purpose, listen, direct, aim, check, export. The revision log under "earlier states" lets you return to any earlier state.',
    why: 'What denting cannot do yet: hold a conversation, or compose a new piece from a description. Those stay on the planned list until they are real.',
  },
];

export function startGuide() {
  const panel = document.getElementById('guidePanel');
  if (!panel || panel.dataset.active === '1') return;
  panel.dataset.active = '1';
  panel.style.display = '';
  let i = 0;

  const titleEl = panel.querySelector('.guide-title');
  const textEl = panel.querySelector('.guide-text');
  const whyEl = panel.querySelector('.guide-why');
  const backBtn = panel.querySelector('.guide-back');
  const nextBtn = panel.querySelector('.guide-next');
  const stopBtn = panel.querySelector('.guide-stop');
  const posEl = panel.querySelector('.guide-pos');

  function stop() {
    panel.dataset.active = '0';
    panel.style.display = 'none';
    window.removeEventListener('denting:status', onStatus);
    window.removeEventListener('denting:action', onAction);
    window.removeEventListener('denting:saved', onSaved);
  }

  function show() {
    const s = STEPS[i];
    document.querySelectorAll('.guide-scroll-target').forEach(el => el.classList.remove('guide-scroll-target'));
    if (s.target) {
      const el = document.querySelector(s.target);
      if (el) {
        el.classList.add('guide-scroll-target');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    titleEl.textContent = s.title;
    textEl.textContent = s.text;
    whyEl.textContent = s.why;
    posEl.textContent = (i + 1) + ' of ' + STEPS.length;
    backBtn.disabled = i === 0;
    nextBtn.textContent = i === STEPS.length - 1 ? 'finish' : (s.advanceOn ? 'skip' : 'next');
  }

  function next() {
    if (i >= STEPS.length - 1) { stop(); return; }
    i++;
    show();
  }

  function matches(advanceOn, kind, detail) {
    if (!advanceOn) return false;
    if (advanceOn.status && kind === 'status') return detail.msg.includes(advanceOn.status);
    if (advanceOn.action && kind === 'action') return detail === advanceOn.action;
    if (advanceOn.event && kind === 'event') return detail === advanceOn.event;
    return false;
  }

  function onStatus(e) { if (matches(STEPS[i].advanceOn, 'status', e.detail)) next(); }
  function onAction(e) { if (matches(STEPS[i].advanceOn, 'action', e.detail)) next(); }
  function onSaved() { if (matches(STEPS[i].advanceOn, 'event', 'saved')) next(); }

  backBtn.onclick = () => { if (i > 0) { i--; show(); } };
  nextBtn.onclick = next;
  stopBtn.onclick = stop;
  window.addEventListener('denting:status', onStatus);
  window.addEventListener('denting:action', onAction);
  window.addEventListener('denting:saved', onSaved);
  show();
}
