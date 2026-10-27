// Tests for the gap finder (src/gaps.js). Each test starts from a small
// complete report and adds or changes facts to trigger one finding.
// Run with `npm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findGaps } from '../src/gaps.js';
import { SAMPLE_FACTS } from '../src/sample.js';

const base = [
  { id: 'f1', kind: 'patient', age: '50', sex: 'female' },
  { id: 'f2', kind: 'dispatch', time: '10:00', text: 'fall' },
  { id: 'f3', kind: 'finding', time: '10:10', text: 'on floor' },
  // Numbered out of the way of the f4, f5, ... that the tests below add.
  { id: 'f9', kind: 'complaint', time: '10:10', text: 'right hip pain' },
];
// Shorthand: each finding as "severity: message".
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

test('flags arriving on scene before the call was dispatched', () => {
  const out = msgs([...base,
    { id: 'f4', kind: 'milestone', time: '14:02', milestone: 'dispatched' },
    { id: 'f5', kind: 'milestone', time: '13:30', milestone: 'onscene' },
    { id: 'f6', kind: 'milestone', time: '13:45', milestone: 'patientcontact' },
  ]);
  assert.ok(out.includes('error: Times are out of order: On scene (13:30) is before Dispatched (14:02).'));
});

test('call times that cross midnight are still in order', () => {
  const out = msgs([...base,
    { id: 'f4', kind: 'milestone', time: '23:50', milestone: 'dispatched' },
    { id: 'f5', kind: 'milestone', time: '00:05', milestone: 'onscene' },
  ]);
  assert.ok(!out.some((m) => /out of order/.test(m)));
});

test('flags anything else timed before dispatch', () => {
  const out = msgs([...base, { id: 'f4', kind: 'vital', time: '09:40', type: 'bp', value: '120/80' }]);
  assert.ok(out.includes('warning: f4 is timed 09:40, before the call was dispatched (10:00). Check the time, or say in the narrative that it happened before EMS arrived.'));
});

test('a med just before midnight and its response just after are in order', () => {
  const out = msgs([
    { id: 'f1', kind: 'patient', age: '50', sex: 'female' },
    { id: 'f2', kind: 'dispatch', time: '23:40', text: 'fall' },
    { id: 'f3', kind: 'finding', time: '23:50', text: 'on floor' },
    { id: 'f9', kind: 'complaint', time: '23:50', text: 'right hip pain' },
    { id: 'f4', kind: 'med', time: '23:55', drug: 'fentanyl', dose: '50', unit: 'mcg', route: 'IV' },
    { id: 'f5', kind: 'response', time: '00:05', to: 'f4', text: 'pain 8 to 4' },
    { id: 'f6', kind: 'vital', time: '00:05', type: 'bp', value: '120/80' },
  ]);
  assert.deepEqual(out, []);
});

test('flags a report with no chief complaint', () => {
  const out = msgs(base.filter((f) => f.kind !== 'complaint'));
  assert.deepEqual(out, ['warning: No chief complaint entered (what the patient says is wrong).']);
});

test('flags a chief complaint timed before patient contact', () => {
  const out = msgs([...base.filter((f) => f.kind !== 'complaint'),
    { id: 'f4', kind: 'milestone', time: '10:08', milestone: 'patientcontact' },
    { id: 'f5', kind: 'complaint', time: '10:05', text: 'right hip pain' },
  ]);
  assert.deepEqual(out, ['warning: The chief complaint (10:05) is timed before patient contact (10:08). Check the time.']);
});

test('a chief complaint at or after patient contact is fine', () => {
  const out = msgs([...base.filter((f) => f.kind !== 'complaint'),
    { id: 'f4', kind: 'milestone', time: '10:08', milestone: 'patientcontact' },
    { id: 'f5', kind: 'complaint', time: '10:08', text: 'right hip pain' },
  ]);
  assert.deepEqual(out, []);
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
