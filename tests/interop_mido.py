# Independent-software verification: parse denting's exported .mid with
# mido, an implementation that shares no code with denting, and check
# everything the professional's handover depends on. Same-code round
# trips (tests/run.js) catch our own bugs; this catches format mistakes
# our own reader would forgive. Needs: pip install mido (dev only).
import sys, mido

mid = mido.MidiFile(sys.argv[1] if len(sys.argv) > 1 else '/tmp/denting-fixture.mid')
results = []
def check(name, cond): results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name)

check('SMF type 1', mid.type == 1)
check('ticks per beat 480', mid.ticks_per_beat == 480)
check('conductor + 2 part tracks', len(mid.tracks) == 3)
cond = mid.tracks[0]
abs_tick, marks, tempos, texts = 0, [], [], []
for m in cond:
    abs_tick += m.time
    if m.type == 'marker': marks.append((abs_tick, m.text))
    if m.type == 'set_tempo': tempos.append((abs_tick, round(60000000 / m.tempo, 2)))
    if m.type == 'text': texts.append(m.text)
check('tempos 100@0, 90@1920: %s' % tempos, tempos == [(0, 100.0), (1920, 90.0)])
check('marker at absolute 1920 with label', marks == [(1920, 'everyone looks at the stage')])
check('purpose text event present', 'purpose: company awards night' in texts)
t1, t2 = mid.tracks[1], mid.tracks[2]
check('part names', [t1.name, t2.name] == ['fanfare', 'groove'])
progs = [(m.channel, m.program) for t in (t1, t2) for m in t if m.type == 'program_change']
check('fanfare = GM 56 (Trumpet) ch 0', progs == [(0, 56)])
ons1 = [m for m in t1 if m.type == 'note_on' and m.velocity > 0]
offs1 = [m for m in t1 if m.type == 'note_off' or (m.type == 'note_on' and m.velocity == 0)]
check('fanfare 6 on / 6 off', len(ons1) == 6 and len(offs1) == 6)
drum_ons = [m for m in t2 if m.type == 'note_on' and m.velocity > 0]
check('groove 10 notes on channel 10', len(drum_ons) == 10 and all(m.channel == 9 for m in drum_ons))
check('drum keys within GM 35-81', all(35 <= m.note <= 81 for m in drum_ons))
fails = [n for n, c in results if not c]
print('%d passed, %d failed' % (len(results) - len(fails), len(fails)))
sys.exit(1 if fails else 0)
