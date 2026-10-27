// Tests for the fact checker (src/checker.js). Each test feeds a short
// narrative, written as plain sentences, against the facts below and checks
// which facts each sentence is matched to and what gets flagged.
// Run with `npm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNarrative, splitSentences } from '../src/checker.js';
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
  { id: 'f10', kind: 'vital', time: '14:30', type: 'bp', value: '136/88' },
  { id: 'f11', kind: 'med', time: '14:22', drug: 'fentanyl', dose: '50', unit: 'mcg', route: 'IN' },
  { id: 'f12', kind: 'med', time: '14:35', drug: 'fentanyl', dose: '25', unit: 'mcg', route: 'IV' },
  { id: 'f13', kind: 'procedure', time: '14:16', name: '12-lead ECG', text: 'ST elevation in II, III and aVF' },
  { id: 'f14', kind: 'complaint', time: '14:13', text: 'crushing chest pain radiating to the left arm' },
];

// Shorthands: the error messages for a narrative, the facts each sentence was
// matched to, and all the warnings joined.
const check = (narrative) => checkNarrative(facts, narrative);
const errors = (narrative) => check(narrative).errors.map((e) => e.message);
const labels = (narrative) => check(narrative).sentences.map((s) => s.ids);
const warnings = (narrative) => check(narrative).warnings.map((w) => w.message).join('\n');

test('labels each sentence with the facts it came from, with no tags written', () => {
  const r = check('A 67-year-old male. BP was 158/94 at 14:15. Gave nitro .4 mg SL at 14:20. '
    + 'Gave naloxone 4 mg IN at 0905. Following nitroglycerin, pain decreased from 8/10 to 5/10.');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.sentences.map((s) => s.ids), [['f1'], ['f2'], ['f3'], ['f4'], ['f3', 'f9']]);
  assert.ok(r.sentences.every((s) => s.ok));
});

test('accepts the same reading written different ways', () => {
  assert.deepEqual(errors('BP 158 over 94. BP 158 / 94 mmHg. Pulse 104 bpm. Sats 93 percent.'), []);
  assert.deepEqual(labels('BP 158/94 HR 104 SpO2 93% RR 20 at 14:15.'), [['f2', 'f5', 'f6', 'f8']]);
  assert.deepEqual(labels('Vitals at 14:15: BP 158/94, HR 104.'), [['f2', 'f5']]);
});

test('matches free-text facts by their wording', () => {
  const r = check('A 12-lead ECG showed ST elevation in II, III and aVF.');
  assert.deepEqual(r.sentences[0].ids, ['f13']);
  assert.deepEqual(r.sentences[0].wordOnly, ['f13']);
});

test('flags a sentence that matches nothing entered', () => {
  const r = check('BP was 158/94. Patient was alert and oriented.');
  assert.equal(r.sentences[0].ok, true);
  assert.equal(r.sentences[1].ok, false);
  assert.deepEqual(r.sentences[1].ids, []);
  assert.deepEqual(r.sentences[1].problems, ['Nothing in this sentence matches an entered fact.']);
});

test('flags a sentence that names a vital without its reading', () => {
  assert.deepEqual(errors('Blood pressure was stable.'), [
    'Mentions BP but gives no value or time to match against what was entered.',
  ]);
});

test('flags real readings moved to the wrong vital', () => {
  assert.deepEqual(errors('Vitals were BP 104/93, HR 158 and SpO2 94%.'), [
    '"104/93" is given as BP, but the entered BP is 158/94 (f2) or 136/88 (f10).',
    '"158" is given as HR, but the entered HR is 104 (f5).',
    '"94%" is given as SpO2, but the entered SpO2 is 93 (f6).',
  ]);
});

test('flags two readings swapped between labels', () => {
  const out = errors('HR 20 and RR 104.');
  assert.equal(out.length, 2);
  assert.match(out[0], /"20" is given as HR, but the entered HR is 104/);
});

test('flags half of a blood pressure used as another reading', () => {
  assert.match(errors('BP 158/94 and pulse 158.')[0], /"158" is given as HR/);
});

test('flags a reading nobody entered, compared with the reading taken at that time', () => {
  assert.deepEqual(errors('BP was 128/76 at 14:30.'), ['"128/76" is given as BP, but the entered BP is 136/88 (f10).']);
});

test('flags a real reading paired with the time of a different reading', () => {
  assert.deepEqual(errors('BP was 158/94 at 14:30.'), [
    '"158/94", "14:30" don\'t all come from one BP entry. Entered: 14:15 Blood pressure 158/94 (f2); 14:30 Blood pressure 136/88 (f10).',
  ]);
});

test('flags a dose with the wrong unit', () => {
  assert.deepEqual(errors('Gave nitroglycerin 0.4 mcg SL.'), [
    '"0.4 mcg" is given for nitroglycerin, but the entered dose is 0.4 mg (f3).',
  ]);
});

test('flags a dose with no unit', () => {
  assert.deepEqual(errors('Gave nitroglycerin 0.4 SL.'), [
    '"0.4" is given for nitroglycerin without a unit. The entered dose is 0.4 mg (f3).',
  ]);
});

test('flags the wrong route', () => {
  assert.deepEqual(errors('Gave nitroglycerin 0.4 mg IV.'), [
    '"IV" is given as the route for nitroglycerin, but the entered route is SL (f3).',
  ]);
});

test('checks the route of a dose given without naming the drug', () => {
  assert.deepEqual(errors('Gave 0.4 mg SL.'), []);
  assert.deepEqual(errors('Gave 0.4 mg IV.'), ['"IV" is given as the route for 0.4 mg, but the entered route is SL (f3).']);
});

test('flags a dose and route taken from two different doses of the same drug', () => {
  assert.deepEqual(labels('Gave fentanyl 50 mcg IN at 14:22.'), [['f11']]);
  assert.match(errors('Gave fentanyl 50 mcg IV.')[0], /don't all come from one fentanyl entry/);
  assert.match(errors('Gave fentanyl 25 mcg at 14:22.')[0], /don't all come from one fentanyl entry/);
});

test('flags doses swapped between drugs', () => {
  assert.deepEqual(errors('Gave aspirin 0.4 mg PO and nitroglycerin 324 mg SL.'), [
    '"0.4 mg" is given for aspirin, but the entered dose is 324 mg (f7).',
    '"324 mg" is given for nitroglycerin, but the entered dose is 0.4 mg (f3).',
  ]);
});

test('flags times swapped between drugs', () => {
  assert.deepEqual(errors('Gave aspirin 324 mg PO at 14:20 and nitroglycerin 0.4 mg SL at 14:18.'), [
    '14:20 is given for aspirin, but the entered time is 14:18 (f7).',
    '14:18 is given for nitroglycerin, but the entered time is 14:20 (f3).',
  ]);
});

test('ties a dose to the drug in either word order and across a comma', () => {
  assert.deepEqual(errors('Administered 0.4 mg nitroglycerin SL at 14:20.'), []);
  assert.deepEqual(errors('Nitroglycerin was given, 0.4 mg SL.'), []);
  assert.deepEqual(errors('At 14:20 nitroglycerin 0.4 mg SL was given.'), []);
});

test('flags a time nobody entered', () => {
  assert.deepEqual(errors('BP was 158/94 at 14:16.'), ['14:16 is given for BP, but the entered time is 14:15 (f2).']);
});

test('flags a drug nobody entered once, not once per dose and route', () => {
  assert.deepEqual(errors('Gave Zofran 4 mg IV.'), ['The drug "ondansetron" isn\'t in the entered facts.']);
});

test('treats a brand name and generic name as the same drug', () => {
  assert.deepEqual(labels('Gave naloxone.'), [['f4']]);
});

test('reads O2 as oxygen', () => {
  assert.match(errors('Placed on O2.')[0], /"oxygen" isn't in the entered facts/);
});

test('ignores route abbreviations that are ordinary words or not tied to a drug', () => {
  assert.deepEqual(errors('Found in a chair with IV access in place, BP 158/94.'), []);
});

test('ignores digits inside terms like SpO2 and 12-lead', () => {
  assert.deepEqual(errors('A 12-lead was done and BP was 158/94 with EtCO2 monitored.'), []);
});

test('ignores old-style source tags, with a warning', () => {
  const r = check('BP was 158/94. [f2]');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.sentences.map((s) => s.text), ['BP was 158/94.']);
  assert.match(r.warnings.map((w) => w.message).join('\n'), /no longer needed/);
});

test('warns on spelled-out numbers, unused facts and meds never stated in full', () => {
  const w = warnings('Gave two doses of nitro.');
  assert.match(w, /"two"/);
  assert.match(w, /f1 .*no sentence matches it/);
  assert.match(w, /f3 .*never stated with its dose, unit and route/);
});

test('a chief complaint is matched by its wording and its time', () => {
  assert.deepEqual(labels('Patient complained of crushing chest pain radiating to the left arm.'), [['f14']]);
  assert.deepEqual(errors('Chief complaint at 14:13 was crushing chest pain radiating to the left arm.'), []);
  assert.deepEqual(labels('Chief complaint at 14:13 was crushing chest pain radiating to the left arm.'), [['f14']]);
});

test('flags a chief complaint given the wrong time', () => {
  assert.deepEqual(errors('Chief complaint at 14:10 was crushing chest pain radiating to the left arm.'), [
    '14:10 is given for chief complaint, but the entered time is 14:13 (f14).',
  ]);
});

test('splitSentences splits at sentence ends but not abbreviations or decimals', () => {
  assert.deepEqual(splitSentences('Gave 0.4 mg. Went to St. Mary\'s! Done?\nNext line'), [
    'Gave 0.4 mg.', 'Went to St. Mary\'s!', 'Done?', 'Next line',
  ]);
});

test('the sample narrative flags exactly the sentences with planted mistakes', () => {
  const r = checkNarrative(SAMPLE_FACTS, SAMPLE_NARRATIVE);
  assert.deepEqual(r.errors.map((e) => e.message), [
    'The drug "ondansetron" isn\'t in the entered facts.',
    '"128/76" is given as BP, but the entered BP is 136/88 (f16).',
  ]);
  assert.deepEqual(r.sentences.filter((s) => !s.ok).map((s) => s.text), [
    'Administered 4 mg ondansetron IV for nausea.',
    'Repeat vitals at 14:30 were BP 128/76 and HR 96.',
  ]);
  assert.ok(r.sentences.filter((s) => s.ok).every((s) => s.ids.length));
});
