# ABC-to-MIDI converter verification (2026-11-20)

Closes the "currently unverified step" named in `eval-description-to-seed.md`: no converter from ABC seeds into denting had been checked. This round adds a bounded importer and measures it against the project's MIDI truth.

- Converter: `core/abc-import.js` (`abcToSong`). New file, inert: not imported by the app, no UI change, no version bump.
- Harness: `research/eval-abc-to-midi.node.mjs` (node, deterministic, no model, no network).
- Raw output: `research/eval-abc-to-midi-raw-2026-11-20.txt` (8 ITEM lines, 6 SEEDCASE lines, 1 SUMMARY line).

## What the importer covers (stated bounds, not the full ABC spec)

Headers X/T/M/L/Q/K/V; single tune per text; pitches with inline accidentals and octave marks; integer length multiples of the L: unit; chords `[CEG]`; rests `z`; barlines; ties joining same-pitch notes across barlines (the shape the exporter writes). One track per `V:` voice. Unsupported constructs (fractional lengths, tuplets, repeats, slurs, grace notes, decorations, key-signature accidentals, mid-body field changes, multiple tunes) are collected in an errors list, never guessed at.

Known-lossy by design (the .mid stays the source of truth, same rule as the exporter): velocity imports as fixed 96; melodic program imports as 0; drum pitches import via a fixed representative GM mapping because the exporter writes display-only staff positions for percussion.

## Corpus and results

Corpus: the 4 denting seed fragments (chords, drums, walking bass, fanfare), `tests/fixtures/long-piece.mid`, the 3 published Balonku exports, and the 6 in-scope few-shot tunes from the description-to-seed eval raw output (model output, read from the committed JSONL).

Metrics per song: FIDELITY (reimported notes == quantized original notes, melodic tracks, pitch/tick/duration exact), MIDI BYTES round trip (imported song -> writeSmf -> readSmf, note-exact), TEXT FIXED POINT (re-exporting the imported song reproduces the exact ABC text), DRIFT (what the exporter's sixteenth-note grid itself moves, importer-independent).

| Item | Melodic notes | Fidelity | MIDI round trip | Text fixed point |
|---|---|---|---|---|
| seed: cadence (chords) | 12 | exact | exact | yes |
| seed: groove (drums only) | 0 | exact (no melodic notes) | exact | yes |
| seed: walking bass | 8 | exact | exact | yes |
| seed: fanfare | 6 | exact | exact | yes |
| fixture: long-piece | 184 | exact | exact | yes |
| Balonku-Ada-Lima | 430 | exact | exact | yes |
| Balonku-assumed-timing | 87 | exact | exact | yes |
| Balonku-Ada-Lima-Epic-Version | 306 | 302/306 mismatch | exact | no |

Model seeds (corpus D): 6/6 extracted tunes parsed with zero import errors and converted to valid MIDI (writeSmf/readSmf round trip exact). Each carries the header values the model emitted (4/4; 100 bpm except 140 for case 2 and 60 for case 4), 8 quarter notes, pitch range 60-72, ending on middle C. The integration path description-to-seed -> ABC -> song -> MIDI bytes works end to end for this artifact shape.

## The one failing item is an exporter property, not an importer bug

Balonku-Ada-Lima-Epic-Version has 38 chord members in chords whose members have unequal durations. The score carries one duration per chord event (the exporter takes the lowest member's), so the longer or shorter members are collapsed in the ABC text itself; the overlap then shifts later events when the text is read sequentially (302 of 306 notes differ on reimport). No importer can recover what the text does not carry; this is the documented "score is a reading aid, not a re-engraving" rule biting on dense harmony. The MIDI round trip of the imported song is still exact.

Drift across the whole corpus: 40 notes (39 epic, 1 long-piece) whose raw timing sits off the sixteenth grid; the score snaps them. This is exporter quantization, present with or without the importer.

## What this does NOT show

No general ABC spec coverage (the bounds above are the whole promise). No UI integration: nothing in the app calls `abcToSong` yet. No claim about model quality: corpus D proves the plumbing, not that the models write good tunes (see `eval-description-to-seed-results-2026-11-20.md` for that). Drum-track recovery is representative mapping, not the original pitches.

## Next integration gap

1. UI wiring decision (user/product owned): an imported seed should land as a NEW song or a clearly-marked revision, never overwriting existing music; the manual bridge stays untouched.
2. Exporter improvement candidate (bounded, would need its own verification and a release): split unequal-duration chords into tied single-note events so dense-harmony scores stop collapsing; today even the text fixed point fails there.
3. After wiring, the full loop description -> ABC seed -> `abcToSong` -> player becomes a smoke-test away; the eval harnesses from both rounds then cover each stage separately.
