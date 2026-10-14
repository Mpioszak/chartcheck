import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNarrative, splitSpans } from '../src/checker.js';
import { SAMPLE_FACTS, SAMPLE_NARRATIVE } from '../src/sample.js';

const facts = [
  { id: 'f1', kind: 'patient', age: '67', sex: 'male' },
  { id: 'f2', kind: 'vital', time: '14:15', type: 'bp', value: '158/94' },
  { id: 'f3', kind: 'med', time: '14:20', drug: 'nitroglycerin', dose: '0.4', unit: 'mg', route: 'SL' },
  { id: 'f4', kind: 'med', time: '09:05', drug: 'Narcan', dose: '4', unit: 'mg', route: 'IN' },
];

const messages = (r) => r.errors.map((e) => e.message);

test('accepts a narrative where every claim is in the cited facts', () => {
  const r = checkNarrative(facts, 'A 67-year-old male. [f1] BP was 158/94 at 14:15. [f2] Gave nitro .4 mg SL at 14:20. [f3] Gave naloxone 4 mg IN at 0905. [f4]');
  assert.deepEqual(messages(r), []);
  assert.equal(r.ok, true);
});

test('rejects a number nobody entered', () => {
  const r = checkNarrative(facts, 'BP was 128/76 at 14:15. [f2]');
  assert.equal(r.ok, false);
  assert.match(messages(r)[0], /128.*Nothing entered/);
});

test('rejects a real number cited from the wrong fact', () => {
  const r = checkNarrative(facts, 'BP was 158/94. [f1]');
  assert.match(messages(r)[0], /158.*entered in f2/);
});

test('rejects a time nobody entered', () => {
  const r = checkNarrative(facts, 'BP was 158/94 at 14:16. [f2]');
  assert.match(messages(r)[0], /14:16/);
});

test('rejects a drug nobody entered, including brand names', () => {
  const r = checkNarrative(facts, 'Gave Zofran. [f3]');
  assert.match(messages(r)[0], /ondansetron/);
});

test('treats a brand name and generic name as the same drug', () => {
  const r = checkNarrative(facts, 'Gave naloxone. [f4]');
  assert.deepEqual(messages(r), []);
});

test('rejects text with no source tag', () => {
  const r = checkNarrative(facts, 'A 67-year-old male. [f1] Patient was alert and oriented.');
  assert.match(messages(r)[0], /no source tag/);
});

test('rejects citations of facts that do not exist', () => {
  const r = checkNarrative(facts, 'A 67-year-old male. [f1, f99]');
  assert.match(messages(r)[0], /f99/);
});

test('ignores digits inside terms like SpO2 and 12-lead', () => {
  const r = checkNarrative(facts, 'SpO2 and a 12-lead were checked, O2 on. [f2]');
  assert.deepEqual(messages(r), []);
});

test('warns on spelled-out numbers and uncited facts', () => {
  const r = checkNarrative(facts, 'Gave two doses of nitro, 0.4 mg. [f3]');
  const w = r.warnings.map((x) => x.message).join('\n');
  assert.match(w, /"two"/);
  assert.match(w, /f1 .*never cites/);
});

test('warns when a cited vital never states its value', () => {
  const r = checkNarrative(facts, 'Blood pressure was taken. [f2]');
  assert.match(r.warnings.map((x) => x.message).join('\n'), /Cites f2 but never states its value/);
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
  assert.deepEqual(messages(r), [
    "The number 4 isn't in the cited facts. Nothing entered contains it.",
    'The drug "ondansetron" isn\'t in the cited facts. Nothing entered contains it.',
    "The number 128 isn't in the cited facts. Nothing entered contains it.",
    "The number 76 isn't in the cited facts. Nothing entered contains it.",
  ]);
});
