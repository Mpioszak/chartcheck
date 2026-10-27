// The made-up sample calls: each one's planted mistakes are caught, and
// nothing else is flagged.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_CALLS, randomSampleIndex } from '../src/sample.js';
import { checkNarrative } from '../src/checker.js';
import { findGaps } from '../src/gaps.js';
import { validateFact } from '../src/schema.js';

const sample = (title) => SAMPLE_CALLS.find((c) => c.title === title);
const errors = (c) => checkNarrative(c.facts, c.narrative).errors.map((e) => e.message);
const gaps = (c) => findGaps(c.facts).map((g) => `${g.severity}: ${g.message}`);

// The narrative errors and gap finder results each sample is written to show.
const PLANTED = {
  'Chest pain': {
    errors: [
      'The drug "ondansetron" isn\'t in the entered facts.',
      '"128/76" is given as BP, but the entered BP is 136/88 (f16).',
    ],
    gaps: ["warning: You gave aspirin 324 mg PO at 14:18 but didn't record how the patient responded."],
  },
  'Diabetic with low blood sugar': {
    errors: ['"121" is given as blood glucose, but the entered blood glucose is 112 (f16).'],
    gaps: ['error: The response to dextrose (07:58) is timed before the drug was given (08:00).'],
  },
  'Asthma attack': {
    errors: ['"2.5 mcg" is given for albuterol, but the entered dose is 2.5 mg (f12).'],
    gaps: ["error: You transported the patient but didn't say why an ambulance was medically necessary. This is the sentence the insurer looks for."],
  },
  'Opioid overdose': {
    errors: ['"4 mg" is given for naloxone, but the entered dose is 2 mg (f13).'],
    gaps: ['error: Times are out of order: Departed scene (02:13) is before Patient contact (02:14).'],
  },
  'Fall with hip injury': {
    errors: ['"97%" is given as SpO2, but no SpO2 was entered.'],
    gaps: [
      "warning: No vitals were taken after fentanyl (09:26), so reassessment isn't documented.",
      'warning: Only one set of vitals was recorded for a transported patient.',
    ],
  },
  'Possible stroke': {
    errors: ['16:02 is given for On scene, but the entered time is 16:04 (f5).'],
    gaps: [
      'warning: The chief complaint (15:10) is timed before patient contact (16:05). Check the time.',
      'warning: f7 is timed 15:10, before the call was dispatched (15:56). Check the time, or say in the narrative that it happened before EMS arrived.',
    ],
  },
};

test('there are six sample calls, each with planted mistakes listed here', () => {
  assert.equal(SAMPLE_CALLS.length, 6);
  assert.deepEqual(SAMPLE_CALLS.map((c) => c.title).sort(), Object.keys(PLANTED).sort());
});

for (const [title, planted] of Object.entries(PLANTED)) {
  test(`${title}: the checker and gap finder catch exactly the planted mistakes`, () => {
    const c = sample(title);
    assert.deepEqual(errors(c), planted.errors);
    assert.deepEqual(gaps(c), planted.gaps);
  });

  test(`${title}: facts have unique ids, a chief complaint, and no field problems`, () => {
    const c = sample(title);
    assert.equal(new Set(c.facts.map((f) => f.id)).size, c.facts.length);
    assert.ok(c.facts.some((f) => f.kind === 'complaint'));
    for (const f of c.facts) assert.deepEqual(validateFact(f), [], f.id);
  });
}

test('randomSampleIndex never picks the current sample', () => {
  for (let current = 0; current < SAMPLE_CALLS.length; current++) {
    for (const r of [0, 0.3, 0.6, 0.999]) {
      const i = randomSampleIndex(current, () => r);
      assert.notEqual(i, current);
      assert.ok(i >= 0 && i < SAMPLE_CALLS.length);
    }
  }
});

test('randomSampleIndex can pick any sample when none is loaded', () => {
  const picked = new Set();
  for (let k = 0; k < SAMPLE_CALLS.length; k++) picked.add(randomSampleIndex(-1, () => k / SAMPLE_CALLS.length));
  assert.equal(picked.size, SAMPLE_CALLS.length);
});

// Yellow marks aren't planted mistakes; they show where the narrative words a
// free-text fact differently. Pinned for one sample so a change in how words
// are compared shows up here.
test('Chest pain: sentences that leave out fact words are marked', () => {
  const c = sample('Chest pain');
  const marked = checkNarrative(c.facts, c.narrative).sentences
    .filter((s) => s.missing.length)
    .map((s) => s.missing.map((m) => `${m.id}: ${m.words.join(' ')}`).join('; '));
  assert.deepEqual(marked, [
    'f22: crushing substernal radiating left arm',
    'f7: onset',
    'f21: private would delay definitive care',
  ]);
});
