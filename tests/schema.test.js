// Tests for fact ids and references (src/schema.js), which keep a fact's
// label meaning the same entry after other facts are edited or deleted.
// Run with `npm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dependentsOf, idNumber, nextFactId } from '../src/schema.js';
import { findGaps } from '../src/gaps.js';

const facts = [
  { id: 'f1', kind: 'patient', age: '50', sex: 'female' },
  { id: 'f2', kind: 'med', time: '10:15', drug: 'fentanyl', dose: '50', unit: 'mcg', route: 'IV' },
  { id: 'f3', kind: 'response', time: '10:20', to: 'f2', text: 'pain 8 to 4' },
];

test('the next id follows the highest id in the list', () => {
  assert.equal(nextFactId([]), 'f1');
  assert.equal(nextFactId(facts), 'f4');
});

test('a deleted id is not handed out again', () => {
  // f3 was the last id handed out, then deleted.
  const afterDelete = facts.filter((f) => f.id !== 'f3');
  assert.equal(nextFactId(afterDelete, idNumber('f3')), 'f4');
  // Facts with higher ids than lastId (an imported file) still win.
  assert.equal(nextFactId(facts, 1), 'f4');
});

test('finds the responses that point at a med', () => {
  assert.deepEqual(dependentsOf(facts, 'f2').map((f) => f.id), ['f3']);
  assert.deepEqual(dependentsOf(facts, 'f1'), []);
});

test('a response left behind by a deleted med is flagged', () => {
  const out = findGaps(facts.filter((f) => f.id !== 'f2'));
  assert.ok(out.some((g) => g.severity === 'error' && /f3 is a response to f2, which isn't an entered medication/.test(g.message)));
});
