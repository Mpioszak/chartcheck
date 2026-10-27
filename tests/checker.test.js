// Tests for the fact checker (src/checker.js). Each test feeds a short
// narrative against the facts below and checks what is accepted or rejected.
// Run with `npm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNarrative, splitSpans } from '../src/checker.js';
import { SAMPLE_FACTS, SAMPLE_NARRATIVE } from '../src/sample.js';

const facts = [
  { id: 'f1', kind: 'patient', age: '67', sex: 'male' },
  { id: 'f2', kind: 'vital', time: '14:15', type: 'bp', value: '158/94' },
  { id: 'f3', kind: 'med', time: '14:20', drug: 'nitroglycerin', dose: '0.4', unit: 'mg', route: 'SL' },
  { id: 'f4', kind: 'med', time: '09:05', drug: 'Narcan', dose: '4', unit: 'mg', route: 'IN' },
  { id: 'f5', kind: 'vital', time: '14:15', type: 'hr', value: '104' },
  { id: 'f6', kind: 'vital', time: '14:15', type: 'spo2', value: '93%' },
  { id: 'f7', kind: 'med', time: '14:18', drug: 'aspirin', dose: '324', unit: 'mg', route: 'PO' },
  { id: 'f8', kind: 'vital', time: '14:15', type: 'rr', value: '20' },
  { id: 'f9', kind: 'response', time: '14:25', to: 'f3', text: 'pain decreased from 8/10 to 5/10' },
];

// Shorthands: the error messages, or all the warnings joined, for a narrative.
const errors = (narrative) => checkNarrative(facts, narrative).errors.map((e) => e.message);
const warnings = (narrative) => checkNarrative(facts, narrative).warnings.map((w) => w.message).join('\n');

test('accepts a narrative where every claim matches its fact', () => {
  assert.deepEqual(errors(
    'A 67-year-old male. [f1] BP was 158/94 at 14:15. [f2] Gave nitro .4 mg SL at 14:20. [f3] '
    + 'Gave naloxone 4 mg IN at 0905. [f4] Following nitroglycerin, pain decreased from 8/10 to 5/10. [f3, f9]',
  ), []);
});

test('accepts the same reading written different ways', () => {
  assert.deepEqual(errors('BP 158 over 94. [f2] BP 158 / 94 mmHg. [f2] Pulse 104 bpm. [f5] Sats 93 percent. [f6]'), []);
  assert.deepEqual(errors('BP 158/94 HR 104 SpO2 93% RR 20 at 14:15. [f2, f5, f6, f8]'), []);
  assert.deepEqual(errors('Vitals at 14:15: BP 158/94, HR 104. [f2, f5]'), []);
});

test('rejects real readings moved to the wrong vital', () => {
  const out = errors('Vitals were BP 104/93, HR 158 and SpO2 94%. [f2, f5, f6]');
  assert.deepEqual(out, [
    '"104/93" is given as BP, but the cited BP is 158/94 (f2).',
    '"158" is given as HR, but the cited HR is 104 (f5).',
    '"94%" is given as SpO2, but the cited SpO2 is 93 (f6).',
  ]);
});

test('rejects two readings swapped between labels', () => {
  const out = errors('HR 20 and RR 104. [f5, f8]');
  assert.equal(out.length, 2);
  assert.match(out[0], /"20" is given as HR, but the cited HR is 104/);
});

test('rejects half of a blood pressure used as another reading', () => {
  assert.match(errors('BP 158/94 and pulse 158. [f2, f5]')[0], /"158" is given as HR/);
});

test('rejects a reading nobody entered', () => {
  assert.deepEqual(errors('BP was 128/76 at 14:15. [f2]'), ['"128/76" is given as BP, but the cited BP is 158/94 (f2).']);
});

test('rejects a real reading cited from the wrong fact', () => {
  assert.deepEqual(errors('A 67-year-old male, BP 158/94. [f1]'), [
    '"158/94" is given as BP, but no cited fact has a BP. It was entered in f2, which this sentence doesn\'t cite.',
  ]);
});

test('requires every cited vital to state its reading', () => {
  assert.deepEqual(errors('Blood pressure was stable. [f2]'), ["Cites f2 (BP 158/94) but doesn't state that reading."]);
});

test('rejects a dose with the wrong unit', () => {
  assert.deepEqual(errors('Gave nitroglycerin 0.4 mcg SL. [f3]'), [
    '"0.4 mcg" is given for nitroglycerin, but the cited dose is 0.4 mg (f3).',
  ]);
});

test('rejects a dose with no unit', () => {
  assert.deepEqual(errors('Gave nitroglycerin 0.4 SL. [f3]'), [
    '"0.4" is given for nitroglycerin without a unit. The cited dose is 0.4 mg (f3).',
  ]);
});

test('rejects the wrong route', () => {
  assert.deepEqual(errors('Gave nitroglycerin 0.4 mg IV. [f3]'), [
    '"IV" is given as the route for nitroglycerin, but the cited route is SL (f3).',
  ]);
});

test('checks the route of a dose given without naming the drug', () => {
  assert.deepEqual(errors('Gave 0.4 mg SL. [f3]'), []);
  assert.deepEqual(errors('Gave 0.4 mg IV. [f3]'), ['"IV" is given as the route for 0.4 mg, but the cited route is SL (f3).']);
});

test('rejects doses swapped between drugs', () => {
  assert.deepEqual(errors('Gave aspirin 0.4 mg PO and nitroglycerin 324 mg SL. [f3, f7]'), [
    '"0.4 mg" is given for aspirin, but the cited dose is 324 mg (f7).',
    '"324 mg" is given for nitroglycerin, but the cited dose is 0.4 mg (f3).',
  ]);
});

test('rejects times swapped between drugs', () => {
  assert.deepEqual(errors('Gave aspirin 324 mg PO at 14:20 and nitroglycerin 0.4 mg SL at 14:18. [f3, f7]'), [
    '14:20 is given for aspirin, but the cited time is 14:18 (f7).',
    '14:18 is given for nitroglycerin, but the cited time is 14:20 (f3).',
  ]);
});

test('ties a dose to the drug in either word order and across a comma', () => {
  assert.deepEqual(errors('Administered 0.4 mg nitroglycerin SL at 14:20. [f3]'), []);
  assert.deepEqual(errors('Nitroglycerin was given, 0.4 mg SL. [f3]'), []);
  assert.deepEqual(errors('At 14:20 nitroglycerin 0.4 mg SL was given. [f3]'), []);
});

test('rejects a time nobody entered', () => {
  assert.deepEqual(errors('BP was 158/94 at 14:16. [f2]'), ['14:16 is given for BP, but the cited time is 14:15 (f2).']);
});

test('rejects a drug nobody entered once, not once per dose and route', () => {
  assert.deepEqual(errors('Gave Zofran 4 mg IV. [f3]'), [
    'The drug "ondansetron" isn\'t in the cited facts. Nothing entered matches it.',
  ]);
});

test('treats a brand name and generic name as the same drug', () => {
  assert.deepEqual(errors('Gave naloxone. [f4]'), []);
});

test('reads O2 as oxygen', () => {
  assert.match(errors('Placed on O2. [f2]')[0], /"oxygen" isn't in the cited facts/);
});

test('ignores route abbreviations that are ordinary words or not tied to a drug', () => {
  assert.deepEqual(errors('Found in a chair with IV access in place, BP 158/94. [f2]'), []);
});

test('rejects text with no source tag', () => {
  assert.match(errors('A 67-year-old male. [f1] Patient was alert and oriented.')[0], /no source tag/);
});

test('rejects citations of facts that do not exist', () => {
  assert.match(errors('A 67-year-old male. [f1, f99]')[0], /f99/);
});

test('ignores digits inside terms like SpO2 and 12-lead', () => {
  assert.deepEqual(errors('A 12-lead was done and BP was 158/94 with EtCO2 monitored. [f2]'), []);
});

test('warns on spelled-out numbers, uncited facts and meds never stated in full', () => {
  const w = warnings('Gave two doses of nitro. [f3]');
  assert.match(w, /"two"/);
  assert.match(w, /f1 .*never cites/);
  assert.match(w, /f3 .*never stated with its dose, unit and route/);
});

test('splitSpans assigns each tag to the text before it', () => {
  assert.deepEqual(splitSpans('One. [f1] Two. Three. [f2, f3] Four.').map((s) => [s.text, s.ids]), [
    ['One.', ['f1']],
    ['Two. Three.', ['f2', 'f3']],
    ['Four.', null],
  ]);
});

test('the sample narrative catches exactly the planted mistakes', () => {
  const r = checkNarrative(SAMPLE_FACTS, SAMPLE_NARRATIVE);
  assert.deepEqual(r.errors.map((e) => e.message), [
    'The drug "ondansetron" isn\'t in the cited facts. Nothing entered matches it.',
    '"128/76" is given as BP, but the cited BP is 136/88 (f16).',
  ]);
});
