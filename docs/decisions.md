# Decisions and open questions

The spec leaves the platform and the AI model open and lists four
questions to settle before designing. Where denting stands:

## Settled for the current draft

- **Platform: a local-first static web app.** It runs on a phone or a
  laptop browser with no install, a `.mid` file leaves by an ordinary
  download and comes in by an ordinary file pick, and the owner can pass
  the whole product on by sharing the link or forking the repo. Storage
  is the browser's local storage: work stays on the device and nothing
  is sent anywhere. Browser storage can be cleared; exporting the `.mid`
  plus handover notes is the durable route, and sync across devices is
  an open question below.
- **A change applies completely or not at all.** The edit engine
  partitions notes into inside-aim and outside-aim, transforms only the
  inside, and verifies the outside is identical afterwards. A failed
  check throws and the song is restored to its pre-edit state. The
  product never trusts the model to respect an aim; it enforces the aim
  around the model.
- **Every change begins with a request, and says what it did.**
  Revisions are recorded in the person's own words, and any earlier
  state can be restored.
- **The model gets no hidden memory.** Each direction is carried out
  against the current song plus what the person has stated (purpose,
  library). Nothing depends on a vendor remembering earlier requests.
- **License: AGPL-3.0** for denting's own code. The spec keeps its own
  CC BY-SA 4.0 license and attribution (see docs/spec/ATTRIBUTION.md).

## Open questions (need a decision before they are built)

### The AI music director

No model is wired up and no paid request is possible today; the
director handles the deterministic local vocabulary and says so
honestly when a request needs a model. The project constraints on any option: no usage-based billing and no
pay-per-request top-ups, and no credential or password forms - the
product must never collect a persistent API key in chat or in a
homebuilt paste-key form. This section is research, not an approved
implementation; model choice remains an open decision.

What the grounding showed (2026-11-19):

- **Gemini API free tier conflicts with the spec's privacy promise.**
  Google's terms state that for Unpaid Services (which include the
  unpaid Gemini API quota) submitted content and responses are used to
  improve Google products, human reviewers may read them, and users
  are told not to submit sensitive, confidential or personal
  information (<https://ai.google.dev/gemini-api/docs/terms>). Private
  composition work is exactly what must not go through that pipe. The
  data-protective terms apply only to Paid Services, which require an
  active Cloud billing account - outside the no-usage-billing
  constraint. (The protective terms also apply to free-tier use from
  the EEA/UK/Switzerland, a regional exception that cannot be relied
  on generally.) So a
  bring-your-own-key Gemini route fails two constraints at once:
  private-work handling on the free tier, and billing on the paid
  tier. It is recorded here and set aside, not recommended.
- **No official OAuth-style authorization route was found** for the
  Gemini API that would avoid both a stored key and a billing account;
  the consumer API is key-based and the Cloud routes assume billing.
  If an official authorization flow appears later, it can be
  reconsidered.

Options that remain inside the constraints:

1. **Manual external-assistant exchange (works today, zero
   integration).** The person pastes denting's state into an assistant
   they already subscribe to and pastes the edit plan back. Costs
   nothing new, sends only what the person chooses to paste, and
   matches the recipe route Nada pioneered. Clunky, but honest and
   available now.
2. **Keyless on-device model (WebGPU, e.g. WebLLM -
   <https://github.com/mlc-ai/web-llm>).** No key, no quota, no cost,
   nothing leaves the device. Quality was the open question, so a
   first synthetic evaluation was run (2026-11-19, harness in
   research/eval-local-model.html, runnable by anyone):

   - Model: SmolLM2-135M-Instruct (ONNX q4, WASM/CPU) via
     transformers.js in a plain browser page. 16 fixed requests: 10
     inside the local edit vocabulary (should yield a structured
     plan), 6 outside it (should yield "none").
   - Result: in this harness, with this model and configuration, 0 of
     16 responses parsed as a valid plan, so no accuracy on either the
     in-vocabulary or the out-of-vocabulary ("none") cases could be
     measured at all. Inspected raw output wrote conversational prose
     around truncated or schema-breaking JSON (e.g. an "op" value
     outside the allowed set) instead of following the format.
   - Runtime: across these 16 requests on one server-class CPU,
     median about 28 seconds each (range 3-32 s); model load about
     2.4 s warm. WebGPU was unavailable in the test browser, so the
     GPU path could not be measured, and no phone-class device was
     measured.
   - Reading: this result is about one small model, one
     quantization, one harness and one machine. It does not show
     whether larger on-device models or a WebGPU path could follow
     the format; both remain untested. It does show that turning
     words into structured edit plans cannot be assumed from model
     size alone, and that any candidate needs this kind of harness
     run against it before it is considered.

Either way, the engine's aim-enforcement already wraps any future
model, so a model can never touch music outside the aim.

### YuE assessed for this project (2026-11-19)

The public YuE2 project
(<https://github.com/multimodal-art-projection/YuE>) was suggested as
a possible fit. Assessment from its source and README, plus one
hosted-demo trial by another worker:

- **Different task.** YuE2 generates a whole song (lyrics/style to an
  ABC score to 48 kHz stereo audio) and supports regenerating from an
  edited score. This project's open model need is an editing director
  that turns a request about EXISTING music into a structured,
  aim-checked edit plan. YuE2 does not read or edit MIDI and does not
  produce edit plans.
- **No MIDI in or out.** Output is audio plus an ABC score; the
  hosted demo exposed audio only. An ABC-to-MIDI conversion would be
  needed even to seed a draft here, and no converter has been
  verified.
- **Runtime not yet testable here.** The README recommends a 24 GB
  NVIDIA GPU (Linux, Python 3.12), with only experimental
  lower-memory paths. The test environment has no GPU, so a full
  local run was not possible and the pipeline stays unverified. A
  short audio clip was generated on the public demo without an
  account, but that path yields audio, not editable notation.
- **Separate licence terms.** Code is Apache-2.0; the model weights
  carry their own terms (CC BY-NC 4.0 with added custom permissions).
  Those weight terms would govern any use of the weights and would
  need their own review before any reuse.

Verdict: not integrated, and currently unverified - no feasible full
local test exists in this environment. Kept on record rather than
discarded; the score-editing direction could be revisited if a
testable runtime appears.
