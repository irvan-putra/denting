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

- **Who pays for each AI-model request, and is the person asked first?**
  No model is wired up and no paid request is possible in this draft.
  Options: the person's own existing subscription or key (asked each
  time it would cost), or a local model. Until this is settled, the
  director handles only the deterministic local commands and says so
  honestly when a request needs the model.
- **Where is a person's work kept, and does it follow them to another
  device?** Today: this device's browser only. Any sync (Drive backup,
  DeltaChat sync, public-data relays) is a separate decision.
- **Richer handover formats** (DAWproject, MusicXML) and **MIDI 2.0
  clip files**: noted by the spec as later promises; the song model
  already holds more than a `.mid` file so this stays possible.
