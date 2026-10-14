import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findGaps } from '../src/gaps.js';
import { SAMPLE_FACTS } from '../src/sample.js';

const base = [
  { id: 'f1', kind: 'patient', age: '50', sex: 'female' },
  { id: 'f2', kind: 'dispatch', time: '10:00', text: 'fall' },
  { id: 'f3', kind: 'finding', time: '10:10', text: 'on floor' },
];
const msgs = (facts) => findGaps(facts).map((g) => `${g.severity}: ${g.message}`);

test('a complete minimal report has no gaps', () => {
  assert.deepEqual(msgs(base), []);
});

test('flags a med with no recorded response or reassessment', () => {
  const out = msgs([...base, { id: 'f4', kind: 'med', time: '10:15', drug: 'fentanyl', dose: '50', unit: 'mcg', route: 'IV' }]);
  assert.ok(out.some((m) => /fentanyl 50 mcg IV at 10:15 but didn't record how/.test(m)));
  assert.ok(out.some((m) => /No vitals were taken after fentanyl/.test(m)));
});

test('a response and later vitals clear the med warnings', () => {
  const out = msgs([...base,
    { id: 'f4', kind: 'med', time: '10:15', drug: 'fentanyl', dose: '50', unit: 'mcg', route: 'IV' },
    { id: 'f5', kind: 'response', time: '10:20', to: 'f4', text: 'pain 8 to 4' },
    { id: 'f6', kind: 'vital', time: '10:20', type: 'bp', value: '120/80' },
  ]);
  assert.deepEqual(out, []);
});

test('flags a response timed before its med', () => {
  const out = msgs([...base,
    { id: 'f4', kind: 'med', time: '10:15', drug: 'fentanyl', dose: '50', unit: 'mcg', route: 'IV' },
    { id: 'f5', kind: 'response', time: '10:10', to: 'f4', text: 'pain 8 to 4' },
    { id: 'f6', kind: 'vital', time: '10:20', type: 'bp', value: '120/80' },
  ]);
  assert.ok(out.some((m) => /^error: The response to fentanyl \(10:10\) is timed before/.test(m)));
});

test('flags call times out of order', () => {
  const out = msgs([...base,
    { id: 'f4', kind: 'milestone', time: '10:00', milestone: 'dispatched' },
    { id: 'f5', kind: 'milestone', time: '10:20', milestone: 'onscene' },
    { id: 'f6', kind: 'milestone', time: '10:12', milestone: 'patientcontact' },
  ]);
  assert.ok(out.some((m) => /^error: Times are out of order: Patient contact \(10:12\) is before On scene \(10:20\)/.test(m)));
});

test('call times that cross midnight are still in order', () => {
  const out = msgs([...base,
    { id: 'f4', kind: 'milestone', time: '23:50', milestone: 'dispatched' },
    { id: 'f5', kind: 'milestone', time: '00:05', milestone: 'onscene' },
  ]);
  assert.ok(!out.some((m) => /out of order/.test(m)));
});

test('flags transport with no medical-necessity statement', () => {
  const out = msgs([...base, { id: 'f4', kind: 'transport', destination: 'General' }]);
  assert.ok(out.some((m) => /^error: You transported the patient but didn't say why/.test(m)));
  assert.ok(out.some((m) => /Only one set of vitals/.test(m)));
});

test('flags missing required fields', () => {
  const out = msgs([...base, { id: 'f4', kind: 'med', time: '25:00', drug: 'aspirin' }]);
  assert.ok(out.includes('error: f4: Time "25:00" is not HH:MM.'));
  assert.ok(out.includes('error: f4: Dose is missing.'));
});

test('the sample call is missing only the aspirin response', () => {
  assert.deepEqual(msgs(SAMPLE_FACTS), [
    "warning: You gave aspirin 324 mg PO at 14:18 but didn't record how the patient responded.",
  ]);
});
