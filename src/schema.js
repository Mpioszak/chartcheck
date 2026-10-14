// The fact format. Every report is a flat list of facts; each fact has an id
// ("f1", "f2", ...), a kind, and the fields listed for that kind below.
// Times are "HH:MM", 24-hour.

export const MILESTONES = [
  'dispatched',
  'enroute',
  'onscene',
  'patientcontact',
  'departscene',
  'atdestination',
  'transfer',
];

export const MILESTONE_LABELS = {
  dispatched: 'Dispatched',
  enroute: 'En route',
  onscene: 'On scene',
  patientcontact: 'Patient contact',
  departscene: 'Departed scene',
  atdestination: 'At destination',
  transfer: 'Care transferred',
};

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

export const ROUTES = ['PO', 'SL', 'IV', 'IO', 'IM', 'IN', 'NEB', 'NC', 'NRB', 'SQ', 'PR', 'ET'];

// field: [label, input type, required?]
export const KINDS = {
  patient: { label: 'Patient', fields: { age: ['Age', 'text', true], sex: ['Sex', 'text', true], text: ['Notes', 'text', false] } },
  dispatch: { label: 'Dispatch', fields: { time: ['Time', 'time', true], text: ['Dispatched as', 'text', true] } },
  milestone: { label: 'Call time', fields: { time: ['Time', 'time', true], milestone: ['Milestone', 'milestone', true] } },
  finding: { label: 'Finding', fields: { time: ['Time', 'time', false], text: ['What you found', 'text', true] } },
  vital: { label: 'Vital sign', fields: { time: ['Time', 'time', true], type: ['Type', 'vitaltype', true], value: ['Value', 'text', true] } },
  med: { label: 'Medication', fields: { time: ['Time', 'time', true], drug: ['Drug', 'text', true], dose: ['Dose', 'text', true], unit: ['Unit', 'text', true], route: ['Route', 'route', true] } },
  response: { label: 'Response to med', fields: { time: ['Time', 'time', true], to: ['Medication', 'medref', true], text: ['How the patient responded', 'text', true] } },
  procedure: { label: 'Procedure', fields: { time: ['Time', 'time', true], name: ['Procedure', 'text', true], text: ['Result / notes', 'text', false] } },
  transport: { label: 'Transport', fields: { time: ['Time', 'time', false], destination: ['Destination', 'text', true], text: ['Mode / position', 'text', false] } },
  necessity: { label: 'Medical necessity', fields: { text: ['Why an ambulance was needed', 'text', true] } },
};

// Fields whose values are references or enums rather than entered facts.
// They are left out of the text the checker searches.
const NON_FACT_FIELDS = new Set(['id', 'kind', 'to']);

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

export function nextFactId(facts) {
  const max = facts.reduce((n, f) => Math.max(n, Number(String(f.id).slice(1)) || 0), 0);
  return `f${max + 1}`;
}
