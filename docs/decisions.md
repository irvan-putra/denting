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
honestly when a request needs a model. The constraint on any option
(recorded from the owner's standing rule): no usage-based billing and
no top-ups; subscriptions already held or genuinely free routes only.
Feasible options within that constraint, grounded 2026-11-19:

1. **Bring-your-own Gemini API key, free tier.** The Gemini API has a
   Free usage tier that requires no billing account (paid tiers start
   only after setting up billing in AI Studio:
   <https://ai.google.dev/gemini-api/docs/rate-limits>). Each person
   using denting would create their own key in AI Studio and paste it;
   denting asks before every request that spends their quota, per the
   spec's money limit. The key never leaves their browser. Caveat to
   state to the user: free-tier content terms (Google may use free-tier
   content to improve products) need checking before composing
   private work through it.
2. **On-device model in the browser (WebGPU).** WebLLM
   (<https://github.com/mlc-ai/web-llm>) runs small open models fully
   in the browser: no key, no quota, no cost, nothing leaves the
   device. Caveat: a model small enough for a phone browser is much
   weaker at musical instruction-following; quality would need an
   honest evaluation against the spec's persona stories before this is
   more than an experiment.
3. **An external assistant the person already uses, by hand.** The
   recipe-style route Nada pioneered: the person pastes denting's
   state into a chatbot they already subscribe to and pastes the edit
   plan back. Zero integration, zero cost, works today; clunky.

Recommendation to the owner (his decision, not made): option 1 as the
first real director, option 2 as the privacy-preserving fallback to
evaluate. Either way the engine's aim-enforcement already wraps the
model, so a model can never touch music outside the aim.
- **Where is a person's work kept, and does it follow them to another
  device?** Today: this device's browser only. Any sync (Drive backup,
  DeltaChat sync, public-data relays) is a separate decision.
- **Richer handover formats** (DAWproject, MusicXML) and **MIDI 2.0
  clip files**: noted by the spec as later promises; the song model
  already holds more than a `.mid` file so this stays possible.
