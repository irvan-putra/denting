# Description-to-seed evaluation, preparation (2026-11-20)

Status: PREPARATION ONLY. No candidate model has been run, and no results
are claimed here. This document fixes the prompts, the artifact shape and
the scoring rubric so that any future candidate can be measured the same
way, the same discipline as research/eval-local-model.html and
research/eval-results-2026-11-20.md. It does not choose a model; model
choice stays an open decision (docs/decisions.md) until a viable route
exists inside the project constraints: no usage-based billing, no stored
API keys, nothing private leaves the device.

## What is being measured

Whether words can start a piece: a short description in, a seed out that
denting can turn into a song. The open model task in docs/decisions.md
(turning requests about EXISTING music into edit plans) is a different,
smaller task; this harness is for generation of new material.

## Seed artifact shape

Target: ABC notation text, one tune, because it is plain text a model can
emit and a person can read. A candidate reply counts only when it
contains exactly one complete ABC tune (header with X, T, M, L, K, Q and
a body). Conversion from ABC to MIDI for import into denting is a
separate, currently unverified step; no converter has been checked, and
an evaluation that needs one must say so in its results.

## Fixed prompts (10)

In-scope (should produce a tune meeting its constraints):

1. "A birthday tune for my niece, 8 bars, 4/4, around 120 bpm, cheerful,
   range within one octave starting at middle C."
2. "A calm lullaby, 4 bars, 3/4, slow (about 70 bpm), no note lower than
   G below middle C."
3. "A heroic fanfare, 4 bars, 4/4, fast (about 140 bpm), mostly short
   notes."
4. "A walking bass line, 8 bars, 4/4, about 100 bpm, quarter notes only,
   in C major."
5. "A sad two-bar phrase, 4/4, about 60 bpm, ending on the keynote."
6. "A playful children's song, 8 bars, 2/4, about 110 bpm, only the
   white keys of C major."

Out-of-scope or contradictory (a good candidate says so instead of
fabricating):

7. "Make me a full orchestral symphony."
8. "An 8-bar tune in 4/4 where every bar has 5 beats."
9. "A song that sounds exactly like Balonku but different."
10. "Something my grandmother will love." (no musical constraints at all)

## Rubric, per prompt

Deterministic checks (scriptable, no judgment):

- PARSE: the reply contains exactly one ABC tune and it parses under a
  stated parser (the parser and version must be named in the results).
- BARS / METER / TEMPO: the header values match the stated constraints
  where the prompt gives them.
- RANGE / KEY-SET / NOTE-VALUES: honored where the prompt states them
  (prompts 1, 2, 4, 6).
- DECLINE: for prompts 7-10, any answer other than a tune counts as a
  decline; a fabricated tune against a contradictory prompt (e.g. 8) is
  a failure, not a success.

Judgment checks (a person reads the tune): does it plausibly fit the
occasion words (cheerful, sad, heroic)? Marked SEPARATELY from the
deterministic checks, never merged into one score.

## Reporting rules for whoever runs it

Same rules as the earlier rounds: name the model, quantization, harness,
machine and decoding settings; report parse rate and per-prompt rubric
outcomes with the exact denominators; keep raw outputs; state what the
run does NOT show (other models, other machines, GPU paths, phone
latency, musical quality beyond the rubric).
