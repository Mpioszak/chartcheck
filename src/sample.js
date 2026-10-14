// A made-up chest pain call for trying the app. Not a real patient.
// The narrative has planted mistakes for the checker to catch: a repeat blood
// pressure nobody took, and a drug that was never given. The facts also leave
// out the response to aspirin, which the gap finder should flag.

export const SAMPLE_FACTS = [
  { id: 'f1', kind: 'patient', age: '67', sex: 'male', text: '' },
  { id: 'f2', kind: 'dispatch', time: '14:02', text: 'chest pain' },
  { id: 'f3', kind: 'milestone', time: '14:02', milestone: 'dispatched' },
  { id: 'f4', kind: 'milestone', time: '14:04', milestone: 'enroute' },
  { id: 'f5', kind: 'milestone', time: '14:11', milestone: 'onscene' },
  { id: 'f6', kind: 'milestone', time: '14:13', milestone: 'patientcontact' },
  { id: 'f7', kind: 'finding', time: '14:13', text: 'sitting upright in the kitchen, pale and diaphoretic, crushing substernal chest pain radiating to the left arm, onset 30 minutes prior' },
  { id: 'f8', kind: 'vital', time: '14:15', type: 'bp', value: '158/94' },
  { id: 'f9', kind: 'vital', time: '14:15', type: 'hr', value: '104' },
  { id: 'f10', kind: 'vital', time: '14:15', type: 'spo2', value: '93%' },
  { id: 'f11', kind: 'procedure', time: '14:16', name: '12-lead ECG', text: "ST elevation in II, III and aVF, transmitted to St. Mary's" },
  { id: 'f12', kind: 'med', time: '14:18', drug: 'aspirin', dose: '324', unit: 'mg', route: 'PO' },
  { id: 'f13', kind: 'med', time: '14:20', drug: 'nitroglycerin', dose: '0.4', unit: 'mg', route: 'SL' },
  { id: 'f14', kind: 'response', time: '14:25', to: 'f13', text: 'pain decreased from 8/10 to 5/10' },
  { id: 'f15', kind: 'milestone', time: '14:24', milestone: 'departscene' },
  { id: 'f16', kind: 'vital', time: '14:30', type: 'bp', value: '136/88' },
  { id: 'f17', kind: 'vital', time: '14:30', type: 'hr', value: '96' },
  { id: 'f18', kind: 'transport', time: '14:24', destination: "St. Mary's cath lab", text: 'emergent, semi-Fowler position' },
  { id: 'f19', kind: 'milestone', time: '14:38', milestone: 'atdestination' },
  { id: 'f20', kind: 'milestone', time: '14:42', milestone: 'transfer' },
  { id: 'f21', kind: 'necessity', text: 'Suspected inferior STEMI requiring continuous cardiac monitoring, ALS interventions en route and direct cath lab activation; private transport would delay definitive care.' },
];

export const SAMPLE_NARRATIVE = `Dispatched at 14:02 for chest pain. [f2, f3]
Arrived on scene at 14:11 and made patient contact at 14:13. [f5, f6]
Found a 67-year-old male sitting upright in the kitchen, pale and diaphoretic, reporting crushing substernal chest pain radiating to the left arm that began 30 minutes prior. [f1, f7]
Initial vitals were BP 158/94, HR 104 and SpO2 93%. [f8, f9, f10]
A 12-lead ECG showed ST elevation in II, III and aVF and was transmitted to St. Mary's. [f11]
Administered aspirin 324 mg PO at 14:18 and nitroglycerin 0.4 mg SL at 14:20. [f12, f13]
Following nitroglycerin, pain decreased from 8/10 to 5/10. [f13, f14]
Administered 4 mg ondansetron IV for nausea. [f13]
Departed scene at 14:24, transporting emergent to St. Mary's cath lab in semi-Fowler position. [f15, f18]
Repeat vitals at 14:30 were BP 128/76 and HR 96. [f16, f17]
Arrived at 14:38 and transferred care to the cath lab team at 14:42. [f19, f20]
Ambulance transport was medically necessary for suspected inferior STEMI requiring continuous cardiac monitoring, ALS interventions en route and direct cath lab activation. [f21]`;
