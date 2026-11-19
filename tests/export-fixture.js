// Exports a fixture exercising everything the handover pair carries.
// Used by tests/interop_mido.py (independent-software verification).
import { writeSmf } from '../core/smf.js';
import { newSong } from '../core/model.js';
import { addMarker } from '../core/engine.js';
import { seedLibrary } from '../core/seeds.js';
import { insertFragment } from '../core/library.js';
import { writeFileSync } from 'fs';

const s = newSong({ bpm: 100, purpose: 'company awards night' });
seedLibrary(s);
insertFragment(s, 'fanfare', 0);
insertFragment(s, 'groove', 0);
addMarker(s, 'everyone looks at the stage', 4);
s.tempoMap.push({ tick: 1920, bpm: 90 });
s.tempoMap.sort((a, b) => a.tick - b.tick);
writeFileSync(process.argv[2] || '/tmp/denting-fixture.mid', Buffer.from(writeSmf(s)));
console.log('exported');
