# denting

Tell your story with music. You say what should happen, in whatever
words you have; denting turns that into written notes you can hear,
revise and take away as a real `.mid` file, plus handover notes a
professional musician can pick up and finish.

Built to the spec *Tell Your Story With Music: Customer Stories and
Product Spec* by [Christoforus Yoga Haryanto](https://github.com/cyharyanto)
([cyharyanto.com](https://www.cyharyanto.com)), used under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The
original document is in [docs/spec/](docs/spec/ATTRIBUTION.md). denting
is the product built on it; the spec's author does not endorse denting.

Status: **early draft (v0.1.0)**.

## What works today

- Import any `.mid` file; controller data it carries is preserved.
- Direct it with everyday words. Local, deterministic, no AI model and
  no cost: "this is a bit too high", "louder", "slower", "transpose up
  2", "90 bpm". A vague request gets a reasonable attempt you can steer
  by listening.
- Aim a request at one part and a stretch of beats. **Everything outside
  the aim stays exactly as it was** - enforced by the edit engine, not
  promised in prose: notes outside the aim are never handed to the
  transform, and are verified identical afterwards.
- Every change begins with your request and says what it understood and
  did. Earlier states are kept; return to any of them.
- Mark the moments that matter straight from conversation: "at 0:42
  everyone looks at the stage" lands a marker on exactly that instant;
  "90 bpm at beat 8" edits the tempo map. Both travel in the `.mid` and
  the handover notes.
- Reuse what works: "save this as fanfare" keeps the aimed stretch as a
  named fragment, "insert fanfare at beat 16" combines it back in, and
  "prompt NAME: the words" keeps phrasings that worked. "library" lists
  what you have. Aiming works in words too: "make only the drums
  louder", "transpose beat 3 up 2", "the first half, softer" (beats
  count from 1, the way people count). The product also offers material of its own: four
  original seed fragments (cadence, groove, walking bass, fanfare) ship
  in the library, written as note data for denting so the license stays
  clean.
- Think first: "note: ..." is recorded as discussion and never moves
  the music.
- Honest self-checks: after every change, denting reports checks of the
  written notes - overlaps, notes too short to hear, flat dynamics,
  pitches at instrument edges, drum keys outside the General MIDI
  guarantee, endings that may not land, identical sections. They are
  labeled as checks of the notes, never as judgments of the sound, and
  where the piece falls short the handover notes say so.
- Export the `.mid` and the handover notes (purpose, structure, timing,
  the moments that matter) at any time. The purpose also travels inside
  the `.mid` itself as a plain text event, so intent survives even when
  the notes file is all that gets passed on. Your work is yours; nothing
  leaves your device unless you export it.

## Planned, not built yet

The AI music director itself. The spec requires an AI model to do the
musical work, but which model, which platform and who pays for each
request are open questions (see [docs/decisions.md](docs/decisions.md)).
This draft wires no model and makes no paid request; a request that
needs one says so plainly. Also planned: composing from scratch and
deeper beat-fine aiming in conversation.

## Develop

```sh
node tests/run.js   # 94 unit tests
node tests/export-fixture.js /tmp/f.mid && python3 tests/interop_mido.py /tmp/f.mid   # independent read via mido, no dependencies
```

`core/` is a dependency-free ES-module library (song model, Standard
MIDI File reader/writer, aimed-edit engine, revisions, handover
document, request director). `web/` is the browser app on top of it;
`index.html` at the repo root is the app, served by GitHub Pages.

## License

denting's own code: GNU Affero General Public License v3.0 (see
LICENSE). The spec document keeps its own CC BY-SA 4.0 license; see
docs/spec/ATTRIBUTION.md.
