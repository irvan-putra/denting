# Browser verification harness

End-to-end checks that run the real site in headless Chrome and assert
observable behavior, not internal state. They complement `tests/run.js`
(Node unit tests), which cannot see missing UI wiring, stale module
graphs, or viewport problems.

## Requirements

- Chrome or Chromium at `/usr/bin/google-chrome`
- Playwright's driver library, e.g. the copy bundled with VS Code
  (`/usr/share/code/resources/app/node_modules/playwright-core`)
- For local runs, nothing else: each script starts its own
  `python3 -m http.server` against the repo root when the base URL
  points at 127.0.0.1.

## Suites

Run any suite against a local checkout or the deployed site:

    node tests/browser/guide-flow.cjs http://127.0.0.1:8127 /tmp/guide
    node tests/browser/guide-viewport.cjs http://127.0.0.1:8128
    node tests/browser/player-timeline.cjs http://127.0.0.1:8129
    node tests/browser/assistant-bridge.cjs http://127.0.0.1:8130
    node tests/browser/fresh-aim.cjs http://127.0.0.1:8131
    node tests/browser/player-timeline.cjs https://vanipy.com/denting

- `guide-flow.cjs` (14 assertions): the whole guided first-song flow,
  including bridge plan check/apply and a real .mid export download.
- `guide-viewport.cjs` (42 assertions): every guide step scrolls its
  target control into view, desktop and mobile, and the panel never
  covers the target.
- `player-timeline.cjs` (12 assertions): seek slider position in
  beats/seconds, play-from-seek scheduling, playhead advance and
  freeze on stop, and measured audible-parameter response: scheduled
  gain values scale with velocity edits and start times compress with
  tempo edits, captured through an instrumented `AudioContext`.
- `assistant-bridge.cjs` (10 assertions): the brief refuses to copy
  without a typed request, carries the request when given one, calls
  out an op-"none" plan as changing nothing, and applies a real plan.
- `fresh-aim.cjs` (5 assertions): a fresh load has empty aim boxes, the
  example load keeps them empty, a whole-piece edit touches every note,
  and an explicitly typed aim still scopes the edit.
- `score-chords.cjs` (6 assertions): the dense-harmony Epic export
  renders its score with no error box and its ABC text carries the tied
  chord segments of v0.4.19; the clean example still renders; saves
  score screenshots for visual inspection.

## Reading the measurements

The playback assertions patch `AudioContext` before the first Play and
record the `gain.setValueAtTime` values and `oscillator.start` times
the app schedules. This proves what the player asks the audio layer to
do - which notes, when, how loud - against the edited song state. It
does not capture speaker output and does not prove how audible a change
is on any particular device.

Velocity is stored as a MIDI integer, so a x0.8 edit rounds: a note at
velocity 88 schedules gain 70/127 x 0.15 after softening, not 70.4/127.
The assertions compare against the integer-rounded expectation.
