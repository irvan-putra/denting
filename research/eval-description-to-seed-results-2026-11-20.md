# Description-to-seed evaluation results (2026-11-20)

Companion to `eval-description-to-seed.md` (rubric and prompts) and `eval-description-to-seed.node.mjs` (harness). Raw per-case RESULT lines: `eval-description-to-seed-raw-2026-11-20.jsonl` (20 lines: 10 zero-shot, 10 few-shot).

## Setup

- Model: SmolLM2-360M-Instruct, ONNX q4 quantization (`research/models/SmolLM2-360M-Instruct-ONNX`, 374 MB, not committed).
- Runtime: `@huggingface/transformers` 3.x + `onnxruntime-node` 1.21.0, CPU device.
- Machine: 2-core / 2 GB RAM sandbox.
- Decoding: greedy, max 288 new tokens.
- 10 fixed prompts: 6 in-scope composition requests with explicit constraints (meter, tempo, bars, range/key), 4 decline-expected prompts (impossible, contradictory, copycat-request, taste-based).
- Two conditions: zero-shot (instruction only) and one-shot (instruction plus one worked 2-bar, 4/4, 100 bpm C-major example).

## Results

### Zero-shot

| Set | Outcome |
|---|---|
| In-scope (6 prompts) | 0/6 produced any parseable ABC tune |
| Decline-expected (4 prompts) | 4/4 pass the strict check ("no tune block emitted"), but see caveat |

Zero-shot raw output is degenerate: the model parrots prompt fragments into fake header-like lines, repeats a header letter dozens of times, or emits long comma/number lists. It never reaches a note body.

Caveat on the zero-shot decline score: the 4/4 is an artifact of the model producing nothing coherent at all. The raw outputs are scaffolding and repetition, not reasoned refusals. A refusal that happens because the model cannot write a tune is not evidence of judgment.

### One-shot (one worked example)

| Set | Outcome |
|---|---|
| In-scope: parseable ABC tune | 6/6 |
| In-scope: full rubric pass | 1/6 (case 4: sad 2-bar phrase ending on the keynote) |
| Decline-expected | 0/4 |

Dominant failure: constraint copying from the example. Every in-scope response reproduces the example's exact 2-bar melody (`C E G c | c G E C |]`). Headers are sometimes adjusted to the prompt (case 2 set tempo 140, case 4 set tempo 60 and correctly used 2 bars), but requested meters (3/4, 2/4), tempos (70, 120), and bar counts (4, 8) are otherwise overridden by the example's 4/4, 100 bpm, 2 bars.

The example also taught always-emit-a-tune: all 4 decline-expected prompts (symphony, contradictory meter, Balonku copycat, grandmother) got a fabricated tune instead of a refusal.

## Finding

At 360M on CPU, prompt engineering trades one failure for another:

- Zero-shot: no format at all (0/6 tunes), declines meaningless.
- One-shot: format solved (6/6 tunes), but constraints copied from the example (1/6 correct) and refusal behavior eliminated (0/4 declines).

Format adherence and judgment do not come from the prompt at this scale. A single fixed example cannot express "follow these constraints" and "refuse these requests" at once.

## Scope caveats

- One model, one quantization, one harness, one small machine, greedy decoding. This says nothing about what larger on-device models (e.g. 1.5B+ class) would do on real phone hardware with more RAM.
- The 2 GB sandbox blocked the next-larger local candidate in the earlier edit-plan eval (Qwen2.5-0.5B OOM, see `eval-results-2026-11-20.md`); that is a sandbox limit, not a phone limit.
- These prompts test description-to-seed (new composition from words). The earlier edit-plan eval (same date) covered constraint-based editing of an existing tune. Both are parts of the words-to-composition goal; neither is the whole feature.
- The ABC-to-MIDI conversion path (seed ABC into Denting's player) is designed but not yet verified end-to-end.

## Next executable steps (no spend, no new accounts)

1. Verify the ABC-to-MIDI converter against the project's MIDI truth: deterministic code, no model needed. This unblocks wiring any future seed source into the player.
2. Re-run this harness with a larger on-device model (1.5B-3B class, q4) on hardware with enough RAM (a phone, or a larger sandbox). The harness, prompts, and rubric are fixed, so results compare directly.
3. Prompt-variant runs on the 360M (different example tunes, explicit "you may refuse" line) to map how much of the trade-off is prompt shape vs model capacity. Cheap, same harness.
4. If a hosted model route is ever wanted: that requires provider billing approval, which has not been granted and is out of scope for this research line.
