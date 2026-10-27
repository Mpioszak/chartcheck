// The fact format. Every report is a flat list of facts; each fact has an id
// ("f1", "f2", ...), a kind, and the fields listed for that kind below.
// Times are "HH:MM", 24-hour. An id belongs to one fact for good: editing a
// fact keeps its id, and a deleted fact's id is never handed out again.

// The call milestones, in the order they should happen. The gap finder uses
// this order to catch times that are out of sequence.
export const MILESTONES = [
  'dispatched',
  'enroute',
  'onscene',
  'patientcontact',
  'departscene',
  'atdestination',
  'transfer',
];

// How each milestone is shown to the medic.
export const MILESTONE_LABELS = {
  dispatched: 'Dispatched',
  enroute: 'En route',
  onscene: 'On scene',
  patientcontact: 'Patient contact',
  departscene: 'Departed scene',
  atdestination: 'At destination',
  transfer: 'Care transferred',
};

// The vital signs the form offers, and how each one is shown.
export const VITAL_TYPES = ['bp', 'hr', 'rr', 'spo2', 'etco2', 'gcs', 'bgl', 'temp', 'pain'];

export const VITAL_LABELS = {
  bp: 'Blood pressure',
  hr: 'Heart rate',
  rr: 'Respiratory rate',
  spo2: 'SpO2',
  etco2: 'EtCO2',
  gcs: 'GCS',
  bgl: 'Blood glucose',
  temp: 'Temperature',
  pain: 'Pain score',
};

// Routes a medication can be given by (by mouth, under the tongue, IV, and so on).
export const ROUTES = ['PO', 'SL', 'IV', 'IO', 'IM', 'IN', 'NEB', 'NC', 'NRB', 'SQ', 'PR', 'ET'];

// Every kind of fact a medic can enter, with the fields each one has. This
// one table drives the form (which boxes to show, for adding and editing) and
// validation (which boxes must be filled in). The facts table shows each
// kind's label.
//
// field: [label, input type, required?]
export const KINDS = {
  patient: { label: 'Patient', fields: { age: ['Age', 'text', true], sex: ['Sex', 'text', true], text: ['Notes', 'text', false] } },
  dispatch: { label: 'Dispatch', fields: { time: ['Time', 'time', true], text: ['Dispatched as', 'text', true] } },
  complaint: { label: 'Patient Chief Complaint', fields: { time: ['Time', 'time', true], text: ['Described as', 'text', true] } },
  milestone: { label: 'Call time', fields: { time: ['Time', 'time', true], milestone: ['Milestone', 'milestone', true] } },
  finding: { label: 'Finding', fields: { time: ['Time', 'time', false], text: ['What you found', 'text', true] } },
  vital: { label: 'Vital sign', fields: { time: ['Time', 'time', true], type: ['Type', 'vitaltype', true], value: ['Value', 'text', true] } },
  med: { label: 'Medication', fields: { time: ['Time', 'time', true], drug: ['Drug', 'text', true], dose: ['Dose', 'text', true], unit: ['Unit', 'text', true], route: ['Route', 'route', true] } },
  response: { label: 'Response to med', fields: { time: ['Time', 'time', true], to: ['Medication', 'medref', true], text: ['How the patient responded', 'text', true] } },
  procedure: { label: 'Procedure', fields: { time: ['Time', 'time', true], name: ['Procedure', 'text', true], text: ['Result / notes', 'text', false] } },
  transport: { label: 'Transport', fields: { time: ['Time', 'time', false], destination: ['Destination', 'text', true], text: ['Mode / position', 'text', false] } },
  necessity: { label: 'Medical necessity', fields: { text: ['Why an ambulance was needed', 'text', true] } },
};

// Fields that are bookkeeping rather than something the medic observed: the
// id, the kind, and the med a response points to. They are left out when a
// fact is written as text.
const NON_FACT_FIELDS = new Set(['id', 'kind', 'to']);

// A fact as one line of plain text, e.g. "Blood pressure 158/94" or
// "aspirin 324 mg PO". Used in the facts table and in messages about a fact.
export function factText(fact) {
  const parts = [];
  for (const [key, value] of Object.entries(fact)) {
    if (NON_FACT_FIELDS.has(key) || value == null || value === '') continue;
    if (key === 'type') parts.push(VITAL_LABELS[value] ?? value);
    else if (key === 'milestone') parts.push(MILESTONE_LABELS[value] ?? value);
    else parts.push(String(value));
  }
  return parts.join(' ');
}

// Turns "HH:MM" into minutes since midnight ("14:02" -> 842), so times can be
// compared. Anything that isn't a valid 24-hour time comes back as null.
export function parseTime(value) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Returns a list of problems with the fact's own fields (missing required
// values, bad times). Empty list means the fact is well formed.
export function validateFact(fact) {
  const spec = KINDS[fact.kind];
  if (!spec) return [`Unknown kind "${fact.kind}"`];
  const problems = [];
  for (const [field, [label, type, required]] of Object.entries(spec.fields)) {
    const value = fact[field];
    const empty = value == null || String(value).trim() === '';
    if (empty) {
      if (required) problems.push(`${label} is missing`);
      continue;
    }
    if (type === 'time' && parseTime(value) === null) problems.push(`${label} "${value}" is not HH:MM`);
  }
  return problems;
}

// The number in a fact id ("f12" -> 12), or 0 if it doesn't have one.
export function idNumber(id) {
  return Number(String(id).slice(1)) || 0;
}

// The id for a new fact: one more than the highest id in use or ever handed
// out. lastId is the highest number handed out so far, so deleting f6 and
// then adding a fact gives f7, not a second f6. Without it (an old save or
// import) the highest id in the list is used.
export function nextFactId(facts, lastId = 0) {
  const max = facts.reduce((n, f) => Math.max(n, idNumber(f.id)), lastId);
  return `f${max + 1}`;
}

// The facts that point at a fact by id: the responses to a med. Deleting a
// fact leaves these pointing at nothing, so the page warns before deleting.
export function dependentsOf(facts, id) {
  return facts.filter((f) => f.kind === 'response' && f.to === id);
}
