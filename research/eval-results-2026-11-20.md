# Local-model evaluation, second round (2026-11-20)

Follow-up to the 2026-11-19 SmolLM2-135M run (see docs/decisions.md). Same
16 fixed requests, same schema prompt, same strict parsing (a reply counts
only when it contains a complete JSON object whose "op" matches the
expected operation). Question: does a larger fully local model follow the
edit-plan format?

## Setup

- Harness: research/eval-local-model.html (browser, WASM) and its Node
  mirror research/eval-local-model.node.mjs (@huggingface/transformers v3,
  onnxruntime-node, native CPU). The Node mirror exists because in-browser
  WASM generation on this 2-core / 2 GB sandbox was too slow to finish a
  case inside a runnable window; quality (parse/accuracy) does not depend
  on the backend, latency does.
- Models: onnx-community ONNX mirrors on Hugging Face, q4 quantization,
  greedy decoding, max 160 new tokens. Weights are NOT in this repo;
  they were served from a local directory (research/models/,
  git-excluded) or fetched by the library.
- Machine: 2 CPU cores, 2 GB RAM, no GPU, no WebGPU. Weaker than the
  phone-first target devices; latency and load failures here do not
  predict device behavior.

## Results

### SmolLM2-360M-Instruct (q4, 386 MB), Node native CPU

- parseable JSON: 6/16
- correct operation: 3/16 - all three are "none" cases (3/6 there)
- in-vocabulary edit requests correct: 0/10
- latency: median 1.8 s, max 9.5 s per request on this box
- Typical failure: the model parrots the request or the schema text
  ("op": "none" fragments, or the request repeated) instead of emitting a
  plan; several real edit requests came back as op "none".

Reading: in this harness, 2.7x the parameters over the 135M model moved
the result from "no parseable output at all" to "some parseable output,
no correct edits". Format-following for this schema was not reached at
360M.

### Qwen2.5-0.5B-Instruct (q4, 761 MB), Node native CPU

Could not be evaluated here: the process was OOM-killed while loading
(2 GB RAM box; loading peaks above it). This is an environment limit,
not a model result. 0.5B-and-up quality for this task remains unknown.

## What this does and does not show

- It does show: sub-0.5B instruct models cannot be assumed to turn words
  into structured edit plans; both small models tested failed the format
  in this harness.
- It does not show: whether 0.5B-1.5B models follow the schema (untested,
  environment too small), anything about WebGPU paths, anything about
  phone-class devices, or anything about a different prompt/schema.
- Practical note independent of quality: q4 weights at these sizes are
  0.4-1.8 GB downloads, heavy for a phone-first web app even before
  quality is considered.

Consequence recorded in docs/decisions.md: the manual assistant
exchange (option 1) remains the only route that works today; the model
choice stays open.
