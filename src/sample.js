// Made-up calls for trying the app. Not real patients. "Load sample call"
// picks one at random.
//
// Each call is { title, facts, narrative }. The facts are what a medic would
// enter on the form; the narrative is what an AI might write from them, as
// plain sentences, and the checker works out which facts each sentence came
// from. Every call has planted mistakes, listed above it: some in the
// narrative for the checker to catch, and some in the facts for the gap
// finder to catch.

// Chest pain. Narrative: a repeat BP of 128/76 at 14:30 (the entered reading
// was 136/88) and ondansetron, which was never given. Facts: no response to
// aspirin.
const CHEST_PAIN = {
  title: 'Chest pain',
  facts: [
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
    { id: 'f22', kind: 'complaint', time: '14:13', text: 'crushing substernal chest pain radiating to the left arm' },
  ],
  narrative: `Dispatched at 14:02 for chest pain.
Arrived on scene at 14:11 and made patient contact at 14:13.
Found a 67-year-old male sitting upright in the kitchen, pale and diaphoretic, reporting crushing substernal chest pain radiating to the left arm that began 30 minutes prior.
Initial vitals were BP 158/94, HR 104 and SpO2 93%.
A 12-lead ECG showed ST elevation in II, III and aVF and was transmitted to St. Mary's.
Administered aspirin 324 mg PO at 14:18 and nitroglycerin 0.4 mg SL at 14:20.
Following nitroglycerin, pain decreased from 8/10 to 5/10.
Administered 4 mg ondansetron IV for nausea.
Departed scene at 14:24, transporting emergent to St. Mary's cath lab in semi-Fowler position.
Repeat vitals at 14:30 were BP 128/76 and HR 96.
Arrived at 14:38 and transferred care to the cath lab team at 14:42.
Ambulance transport was medically necessary for suspected inferior STEMI requiring continuous cardiac monitoring, ALS interventions en route and direct cath lab activation.`,
};

// Low blood sugar. Narrative: a repeat blood glucose of 121 (the entered
// reading was 112). Facts: the response to dextrose is timed before the
// dextrose was given.
const HYPOGLYCEMIA = {
  title: 'Diabetic with low blood sugar',
  facts: [
    { id: 'f1', kind: 'patient', age: '58', sex: 'female', text: 'insulin-dependent diabetic' },
    { id: 'f2', kind: 'dispatch', time: '07:41', text: 'unknown problem, confused' },
    { id: 'f3', kind: 'milestone', time: '07:41', milestone: 'dispatched' },
    { id: 'f4', kind: 'milestone', time: '07:43', milestone: 'enroute' },
    { id: 'f5', kind: 'milestone', time: '07:52', milestone: 'onscene' },
    { id: 'f6', kind: 'milestone', time: '07:54', milestone: 'patientcontact' },
    { id: 'f7', kind: 'complaint', time: '07:54', text: 'confusion and sweating since waking, per husband' },
    { id: 'f8', kind: 'finding', time: '07:54', text: 'sitting on the edge of the bed, diaphoretic, slow to answer questions, took insulin last night and skipped dinner' },
    { id: 'f9', kind: 'vital', time: '07:56', type: 'bgl', value: '38' },
    { id: 'f10', kind: 'vital', time: '07:56', type: 'gcs', value: '13' },
    { id: 'f11', kind: 'vital', time: '07:56', type: 'hr', value: '112' },
    { id: 'f12', kind: 'vital', time: '07:56', type: 'bp', value: '142/86' },
    { id: 'f13', kind: 'procedure', time: '07:58', name: 'IV access', text: '20 gauge left antecubital' },
    { id: 'f14', kind: 'med', time: '08:00', drug: 'dextrose', dose: '25', unit: 'g', route: 'IV' },
    { id: 'f15', kind: 'response', time: '07:58', to: 'f14', text: 'became alert and oriented, answering questions appropriately' },
    { id: 'f16', kind: 'vital', time: '08:10', type: 'bgl', value: '112' },
    { id: 'f17', kind: 'vital', time: '08:10', type: 'gcs', value: '15' },
    { id: 'f18', kind: 'milestone', time: '08:14', milestone: 'departscene' },
    { id: 'f19', kind: 'transport', time: '08:14', destination: 'Riverside General', text: 'non-emergent, seated' },
    { id: 'f20', kind: 'milestone', time: '08:29', milestone: 'atdestination' },
    { id: 'f21', kind: 'milestone', time: '08:33', milestone: 'transfer' },
    { id: 'f22', kind: 'necessity', text: 'Altered mental status from severe hypoglycemia treated with IV dextrose; at risk of recurrent hypoglycemia from long-acting insulin and needs monitoring during transport.' },
  ],
  narrative: `Dispatched at 07:41 for an unknown problem, patient confused.
Arrived on scene at 07:52 and made patient contact at 07:54.
Found a 58-year-old female insulin-dependent diabetic sitting on the edge of the bed, diaphoretic and slow to answer questions.
Her husband reports confusion and sweating since waking; she took insulin last night and skipped dinner.
Initial blood glucose was 38 with GCS 13, HR 112 and BP 142/86.
IV access was established with a 20 gauge in the left antecubital.
Administered dextrose 25 g IV at 08:00.
Following dextrose, she became alert and oriented and was answering questions appropriately.
Repeat blood glucose at 08:10 was 121 with GCS 15.
Departed scene at 08:14, transporting non-emergent to Riverside General, seated.
Arrived at 08:29 and transferred care at 08:33.
Ambulance transport was medically necessary for altered mental status from severe hypoglycemia, with risk of recurrent hypoglycemia from long-acting insulin requiring monitoring during transport.`,
};

// Asthma attack. Narrative: albuterol written as 2.5 mcg instead of 2.5 mg,
// the unit swap that matters most. Facts: no medical-necessity statement.
const ASTHMA = {
  title: 'Asthma attack',
  facts: [
    { id: 'f1', kind: 'patient', age: '24', sex: 'female', text: 'history of asthma' },
    { id: 'f2', kind: 'dispatch', time: '19:12', text: 'difficulty breathing' },
    { id: 'f3', kind: 'milestone', time: '19:12', milestone: 'dispatched' },
    { id: 'f4', kind: 'milestone', time: '19:13', milestone: 'enroute' },
    { id: 'f5', kind: 'milestone', time: '19:21', milestone: 'onscene' },
    { id: 'f6', kind: 'milestone', time: '19:23', milestone: 'patientcontact' },
    { id: 'f7', kind: 'complaint', time: '19:23', text: 'shortness of breath, home inhaler not helping' },
    { id: 'f8', kind: 'finding', time: '19:23', text: 'tripod position, speaking in short phrases, diffuse expiratory wheezes' },
    { id: 'f9', kind: 'vital', time: '19:25', type: 'rr', value: '32' },
    { id: 'f10', kind: 'vital', time: '19:25', type: 'spo2', value: '89%' },
    { id: 'f11', kind: 'vital', time: '19:25', type: 'hr', value: '124' },
    { id: 'f12', kind: 'med', time: '19:27', drug: 'albuterol', dose: '2.5', unit: 'mg', route: 'NEB' },
    { id: 'f13', kind: 'med', time: '19:27', drug: 'ipratropium', dose: '0.5', unit: 'mg', route: 'NEB' },
    { id: 'f14', kind: 'response', time: '19:37', to: 'f12', text: 'wheezes decreased, speaking in full sentences' },
    { id: 'f15', kind: 'response', time: '19:37', to: 'f13', text: 'wheezes decreased, speaking in full sentences' },
    { id: 'f16', kind: 'vital', time: '19:38', type: 'rr', value: '22' },
    { id: 'f17', kind: 'vital', time: '19:38', type: 'spo2', value: '95%' },
    { id: 'f18', kind: 'vital', time: '19:38', type: 'hr', value: '118' },
    { id: 'f19', kind: 'milestone', time: '19:40', milestone: 'departscene' },
    { id: 'f20', kind: 'transport', time: '19:40', destination: 'Mercy Hospital', text: 'non-emergent, high Fowler position' },
    { id: 'f21', kind: 'milestone', time: '19:52', milestone: 'atdestination' },
    { id: 'f22', kind: 'milestone', time: '19:55', milestone: 'transfer' },
  ],
  narrative: `Dispatched at 19:12 for difficulty breathing.
Arrived on scene at 19:21 and made patient contact at 19:23.
Found a 24-year-old female with a history of asthma in tripod position, speaking in short phrases, with diffuse expiratory wheezes.
She reported shortness of breath with her home inhaler not helping.
Initial vitals were RR 32, SpO2 89% and HR 124.
Administered albuterol 2.5 mcg NEB with ipratropium 0.5 mg NEB at 19:27.
Following albuterol and ipratropium, wheezes decreased and she was speaking in full sentences.
Repeat vitals at 19:38 were RR 22, SpO2 95% and HR 118.
Departed scene at 19:40, transporting non-emergent to Mercy Hospital in high Fowler position.
Arrived at 19:52 and transferred care at 19:55.`,
};

// Opioid overdose. Narrative: naloxone written as 4 mg (2 mg was given).
// Facts: departed scene is entered as 02:13, before patient contact at 02:14
// (02:31 was meant).
const OVERDOSE = {
  title: 'Opioid overdose',
  facts: [
    { id: 'f1', kind: 'patient', age: '31', sex: 'male', text: '' },
    { id: 'f2', kind: 'dispatch', time: '02:04', text: 'unresponsive person' },
    { id: 'f3', kind: 'milestone', time: '02:04', milestone: 'dispatched' },
    { id: 'f4', kind: 'milestone', time: '02:05', milestone: 'enroute' },
    { id: 'f5', kind: 'milestone', time: '02:12', milestone: 'onscene' },
    { id: 'f6', kind: 'milestone', time: '02:14', milestone: 'patientcontact' },
    { id: 'f7', kind: 'complaint', time: '02:14', text: 'unresponsive, found by roommate' },
    { id: 'f8', kind: 'finding', time: '02:14', text: 'supine on the bathroom floor, pinpoint pupils, cyanotic lips, snoring respirations, syringe nearby' },
    { id: 'f9', kind: 'vital', time: '02:15', type: 'rr', value: '6' },
    { id: 'f10', kind: 'vital', time: '02:15', type: 'spo2', value: '78%' },
    { id: 'f11', kind: 'vital', time: '02:15', type: 'gcs', value: '3' },
    { id: 'f12', kind: 'procedure', time: '02:15', name: 'BVM ventilation', text: 'with supplemental oxygen' },
    { id: 'f13', kind: 'med', time: '02:17', drug: 'naloxone', dose: '2', unit: 'mg', route: 'IN' },
    { id: 'f14', kind: 'response', time: '02:21', to: 'f13', text: 'breathing on his own, opened eyes to voice' },
    { id: 'f15', kind: 'vital', time: '02:23', type: 'rr', value: '16' },
    { id: 'f16', kind: 'vital', time: '02:23', type: 'spo2', value: '96%' },
    { id: 'f17', kind: 'vital', time: '02:23', type: 'gcs', value: '14' },
    { id: 'f18', kind: 'milestone', time: '02:13', milestone: 'departscene' },
    { id: 'f19', kind: 'transport', time: '02:31', destination: 'County Medical Center', text: 'non-emergent, position of comfort' },
    { id: 'f20', kind: 'milestone', time: '02:44', milestone: 'atdestination' },
    { id: 'f21', kind: 'milestone', time: '02:48', milestone: 'transfer' },
    { id: 'f22', kind: 'necessity', text: 'Opioid overdose with respiratory depression reversed by naloxone; naloxone can wear off before the opioid does, so he needs monitoring for recurrent respiratory depression.' },
  ],
  narrative: `Dispatched at 02:04 for an unresponsive person.
Arrived on scene at 02:12 and made patient contact at 02:14.
His roommate found him unresponsive and called for help.
Found a 31-year-old male supine on the bathroom floor with pinpoint pupils, cyanotic lips and snoring respirations, with a syringe nearby.
Initial vitals were RR 6, SpO2 78% and GCS 3.
Began BVM ventilation with supplemental oxygen at 02:15.
Administered naloxone 4 mg IN at 02:17.
Following naloxone, he was breathing on his own and opened his eyes to voice.
Repeat vitals at 02:23 were RR 16, SpO2 96% and GCS 14.
Departed scene at 02:31, transporting non-emergent to County Medical Center in position of comfort.
Arrived at 02:44 and transferred care at 02:48.
Ambulance transport was medically necessary for opioid overdose with respiratory depression; naloxone can wear off before the opioid does, so he needs monitoring for recurrent respiratory depression.`,
};

// Fall with a hip injury. Narrative: an SpO2 of 97% nobody took. Facts: only
// one set of vitals, all before the fentanyl, so reassessment isn't
// documented.
const FALL = {
  title: 'Fall with hip injury',
  facts: [
    { id: 'f1', kind: 'patient', age: '84', sex: 'female', text: 'lives alone, takes apixaban' },
    { id: 'f2', kind: 'dispatch', time: '09:05', text: 'fall' },
    { id: 'f3', kind: 'milestone', time: '09:05', milestone: 'dispatched' },
    { id: 'f4', kind: 'milestone', time: '09:07', milestone: 'enroute' },
    { id: 'f5', kind: 'milestone', time: '09:16', milestone: 'onscene' },
    { id: 'f6', kind: 'milestone', time: '09:18', milestone: 'patientcontact' },
    { id: 'f7', kind: 'complaint', time: '09:18', text: 'right hip pain after tripping on a rug' },
    { id: 'f8', kind: 'finding', time: '09:18', text: 'lying on the hallway floor, right leg shortened and externally rotated, denies hitting her head' },
    { id: 'f9', kind: 'vital', time: '09:20', type: 'bp', value: '164/90' },
    { id: 'f10', kind: 'vital', time: '09:20', type: 'hr', value: '88' },
    { id: 'f11', kind: 'vital', time: '09:20', type: 'pain', value: '9/10' },
    { id: 'f12', kind: 'med', time: '09:26', drug: 'fentanyl', dose: '50', unit: 'mcg', route: 'IN' },
    { id: 'f13', kind: 'response', time: '09:34', to: 'f12', text: 'pain decreased to 5/10' },
    { id: 'f14', kind: 'procedure', time: '09:36', name: 'Scoop stretcher', text: 'moved to stretcher with pillows supporting the right leg' },
    { id: 'f15', kind: 'milestone', time: '09:41', milestone: 'departscene' },
    { id: 'f16', kind: 'transport', time: '09:41', destination: 'Riverside General', text: 'non-emergent, supine' },
    { id: 'f17', kind: 'milestone', time: '09:58', milestone: 'atdestination' },
    { id: 'f18', kind: 'milestone', time: '10:03', milestone: 'transfer' },
    { id: 'f19', kind: 'necessity', text: 'Suspected right hip fracture; unable to bear weight or sit upright, requires stretcher transport and pain management, and is on a blood thinner.' },
  ],
  narrative: `Dispatched at 09:05 for a fall.
Arrived on scene at 09:16 and made patient contact at 09:18.
Found an 84-year-old female lying on the hallway floor complaining of right hip pain after tripping on a rug.
Her right leg was shortened and externally rotated, and she denies hitting her head.
She lives alone and takes apixaban.
Initial vitals were BP 164/90, HR 88, SpO2 97% and pain 9/10.
Administered fentanyl 50 mcg IN at 09:26.
Following fentanyl, pain decreased to 5/10.
She was moved by scoop stretcher to the stretcher with pillows supporting the right leg.
Departed scene at 09:41, transporting non-emergent to Riverside General, supine.
Arrived at 09:58 and transferred care at 10:03.
Ambulance transport was medically necessary for a suspected right hip fracture; she is unable to bear weight or sit upright and requires stretcher transport, and is on a blood thinner.`,
};

// Stroke. Narrative: arrived on scene at 16:02 (16:04 was entered). Facts: the
// chief complaint is timed 15:10, when the symptoms started, which is before
// patient contact.
const STROKE = {
  title: 'Possible stroke',
  facts: [
    { id: 'f1', kind: 'patient', age: '72', sex: 'male', text: 'history of atrial fibrillation' },
    { id: 'f2', kind: 'dispatch', time: '15:56', text: 'possible stroke' },
    { id: 'f3', kind: 'milestone', time: '15:56', milestone: 'dispatched' },
    { id: 'f4', kind: 'milestone', time: '15:57', milestone: 'enroute' },
    { id: 'f5', kind: 'milestone', time: '16:04', milestone: 'onscene' },
    { id: 'f6', kind: 'milestone', time: '16:05', milestone: 'patientcontact' },
    { id: 'f7', kind: 'complaint', time: '15:10', text: 'sudden slurred speech and right arm weakness, per wife' },
    { id: 'f8', kind: 'finding', time: '16:05', text: 'seated in a recliner, right facial droop, right arm drift, slurred speech, last known well 15:10 per wife' },
    { id: 'f9', kind: 'vital', time: '16:07', type: 'bp', value: '188/102' },
    { id: 'f10', kind: 'vital', time: '16:07', type: 'hr', value: '96' },
    { id: 'f11', kind: 'vital', time: '16:07', type: 'bgl', value: '134' },
    { id: 'f12', kind: 'vital', time: '16:07', type: 'gcs', value: '14' },
    { id: 'f13', kind: 'procedure', time: '16:09', name: 'Stroke alert', text: 'called to Mercy Hospital' },
    { id: 'f14', kind: 'milestone', time: '16:13', milestone: 'departscene' },
    { id: 'f15', kind: 'transport', time: '16:13', destination: 'Mercy Hospital stroke center', text: 'emergent, head of stretcher at 30 degrees' },
    { id: 'f16', kind: 'vital', time: '16:20', type: 'bp', value: '182/98' },
    { id: 'f17', kind: 'vital', time: '16:20', type: 'hr', value: '92' },
    { id: 'f18', kind: 'milestone', time: '16:27', milestone: 'atdestination' },
    { id: 'f19', kind: 'milestone', time: '16:29', milestone: 'transfer' },
    { id: 'f20', kind: 'necessity', text: 'Acute stroke symptoms within the treatment window; requires emergent transport to a stroke center with prehospital stroke alert to avoid delay in thrombolytic care.' },
  ],
  narrative: `Dispatched at 15:56 for a possible stroke.
Arrived on scene at 16:02 and made patient contact at 16:05.
Found a 72-year-old male with a history of atrial fibrillation seated in a recliner with right facial droop, right arm drift and slurred speech.
His wife reports sudden slurred speech and right arm weakness, last known well 15:10.
Initial vitals were BP 188/102, HR 96, blood glucose 134 and GCS 14.
A stroke alert was called to Mercy Hospital at 16:09.
Departed scene at 16:13, transporting emergent to Mercy Hospital stroke center with the head of the stretcher at 30 degrees.
Repeat vitals at 16:20 were BP 182/98 and HR 92.
Arrived at 16:27 and transferred care at 16:29.
Ambulance transport was medically necessary for acute stroke symptoms within the treatment window, requiring emergent transport to a stroke center with a prehospital stroke alert.`,
};

export const SAMPLE_CALLS = [CHEST_PAIN, HYPOGLYCEMIA, ASTHMA, OVERDOSE, FALL, STROKE];

// The chest pain call, which the tests use as their standard example.
export const SAMPLE_FACTS = CHEST_PAIN.facts;
export const SAMPLE_NARRATIVE = CHEST_PAIN.narrative;

// Picks a sample call at random, other than the one at index `current` when
// there is a choice. Returns the index, so the caller can avoid it next time.
export function randomSampleIndex(current = -1, random = Math.random) {
  const choices = SAMPLE_CALLS.map((_, i) => i).filter((i) => i !== current);
  return choices[Math.floor(random() * choices.length)];
}
