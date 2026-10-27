// Reads text into claims the checker can compare against the entered facts.
// A claim ties a value to what it describes:
//
//   value  a reading tied to its vital sign ("BP 158/94"), or to nothing
//   dose   a dose and unit tied to its drug ("nitroglycerin 0.4 mg")
//   route  a route tied to its drug ("nitroglycerin ... SL")
//   time   a time tied to the vital, drug or call milestone it belongs to
//   drug   a drug name
//
// The narrative and the free-text parts of facts are read the same way, so
// "pain decreased from 8/10 to 5/10" in a fact and in the narrative produce
// the same claims.
//
// A value belongs to the nearest label before it in the same clause (clauses
// are split at commas, semicolons, colons, brackets, "and", "then", "but",
// "while"). A dose
// belongs to the nearest drug before it in the clause, else the next one. A
// time belongs to the most recent label, drug or milestone in the clause,
// else the next one. A label or drug left without a value carries over to
// the next clause of the same sentence ("Nitroglycerin was given, 0.4 mg SL").

import { DRUG_ALIASES, canonicalDrug } from './drugs.js';
import { MILESTONE_LABELS, VITAL_TYPES, parseTime } from './schema.js';

// Words that name each vital sign (plus age) in a sentence. A number after
// one of these is read as that vital's reading.
const VITAL_WORDS = {
  bp: ['blood pressure', 'b/p', 'bp'],
  hr: ['heart rate', 'pulse rate', 'pulse', 'hr'],
  rr: ['respiratory rate', 'respiration rate', 'respirations', 'resp rate', 'resps', 'rr'],
  spo2: ['oxygen saturation', 'o2 saturation', 'o2 sats', 'o2 sat', 'pulse oximetry', 'pulse ox', 'spo2', 'sp02', 'sats'],
  etco2: ['end-tidal co2', 'end tidal co2', 'end-tidal', 'end tidal', 'etco2', 'capnography'],
  gcs: ['glasgow coma scale', 'glasgow coma score', 'gcs'],
  bgl: ['blood glucose', 'blood sugar', 'glucose', 'bgl', 'cbg'],
  temp: ['temperature', 'temp'],
  pain: ['pain'],
  age: ['aged', 'age'],
};

// Only phrases that name the event itself, so "while on scene" or "patient
// responded" don't tie a time to the wrong milestone.
const MILESTONE_WORDS = {
  dispatched: ['dispatched'],
  enroute: ['en route to scene', 'en route to the scene', 'en route to the call', 'responded to scene', 'responded to the scene'],
  onscene: ['arrived on scene', 'arrived at scene', 'arrived at the scene', 'arrival on scene', 'arrival at scene', 'arrival at the scene'],
  patientcontact: ['patient contact', 'made contact with the patient', 'made contact with patient'],
  departscene: ['departed scene', 'departed the scene', 'departed for', 'left scene', 'left the scene', 'departure from scene', 'departure from the scene'],
  atdestination: ['arrived at hospital', 'arrived at the hospital', 'arrived at destination', 'arrived at the destination', 'arrival at hospital', 'arrival at the hospital', 'arrival at destination', 'arrival at the destination'],
  transfer: ['transferred care', 'care was transferred', 'care transferred', 'transfer of care', 'report given', 'gave report'],
};

// Ways each route can be written.
const ROUTE_WORDS = {
  PO: ['po', 'orally', 'oral', 'by mouth'],
  SL: ['sl', 'sublingual', 'sublingually'],
  IV: ['iv', 'ivp', 'intravenous', 'intravenously'],
  IO: ['io', 'intraosseous', 'intraosseously'],
  IM: ['im', 'intramuscular', 'intramuscularly'],
  IN: ['in', 'intranasal', 'intranasally'],
  SQ: ['sq', 'sc', 'subq', 'sub-q', 'subcutaneous', 'subcutaneously'],
  PR: ['pr', 'rectally', 'per rectum'],
  ET: ['et', 'endotracheal', 'endotracheally'],
  NEB: ['neb', 'nebulized', 'nebulizer'],
  NC: ['nc', 'nasal cannula'],
  NRB: ['nrb', 'non-rebreather', 'non rebreather', 'nonrebreather'],
};
// Route abbreviations that are also English words count only in capitals.
const CAPS_ONLY = new Set(['in', 'pr', 'et']);

// Terms with digits in them that aren't values.
const NEUTRAL_WORDS = ['12-lead', '12 lead', '15-lead', '15 lead', 'co2', 'd5w'];

// Units that can follow a number. The unit says what kind of value it is:
// "mg" makes it a dose, "bpm" a heart rate, "minutes" a duration.
// [spellings, canonical unit, what a value with this unit is]
const UNITS = [
  [['mg/dl', 'mg per dl'], 'mg/dl', 'bgl'],
  [['mmhg', 'mm hg'], 'mmhg', 'bp'],
  [['bpm', 'beats per minute', 'beats/min'], 'bpm', 'hr'],
  [['breaths per minute', 'breaths/min', 'breaths'], 'breaths/min', 'rr'],
  [['°f', '°c', 'degrees', 'f'], 'degrees', 'temp'],
  [['years old', 'year old', 'year-old', 'yrs old', 'yr old', 'y/o', 'y.o.', 'yo'], 'years', 'age'],
  [['seconds', 'second', 'secs', 'sec'], 'seconds', 'duration'],
  [['minutes', 'minute', 'mins', 'min'], 'minutes', 'duration'],
  [['hours', 'hour', 'hrs'], 'hours', 'duration'],
  [['days', 'day'], 'days', 'duration'],
  [['weeks', 'week'], 'weeks', 'duration'],
  [['months', 'month'], 'months', 'duration'],
  [['years', 'year'], 'years', 'duration'],
  [['%', 'percent'], '%', null],
  [['mcg/kg/min'], 'mcg/kg/min', 'dose'],
  [['mcg/kg'], 'mcg/kg', 'dose'],
  [['mcg/min'], 'mcg/min', 'dose'],
  [['mg/kg'], 'mg/kg', 'dose'],
  [['mg/min'], 'mg/min', 'dose'],
  [['mcg', 'ug', 'micrograms', 'microgram'], 'mcg', 'dose'],
  [['mg', 'milligrams', 'milligram'], 'mg', 'dose'],
  [['g', 'gm', 'grams', 'gram'], 'g', 'dose'],
  [['ml', 'mls', 'milliliters', 'milliliter', 'cc'], 'ml', 'dose'],
  [['l', 'lpm', 'l/min', 'liters', 'liter', 'litres', 'litre'], 'l', 'dose'],
  [['units', 'unit', 'u', 'iu'], 'units', 'dose'],
  [['meq'], 'meq', 'dose'],
  [['mmol'], 'mmol', 'dose'],
  [['tablets', 'tablet', 'tabs', 'tab'], 'tab', 'dose'],
  [['puffs', 'puff'], 'puff', 'dose'],
  [['sprays', 'spray'], 'spray', 'dose'],
  [['doses', 'dose'], 'dose', 'dose'],
  [['drops', 'drop'], 'drop', 'dose'],
];

const VITALS = new Set(VITAL_TYPES);

// Short names used in error messages ("the entered BP is ...").
export const SUBJECT_NAMES = {
  bp: 'BP', hr: 'HR', rr: 'RR', spo2: 'SpO2', etco2: 'EtCO2', gcs: 'GCS',
  bgl: 'blood glucose', temp: 'temperature', pain: 'pain', age: 'age', duration: 'duration',
  ...MILESTONE_LABELS,
};

export function subjectName(subject) {
  return SUBJECT_NAMES[subject] ?? subject;
}

// Numbers spelled out in words. These can't be checked, so the checker warns
// about them.
const NUMBER_WORDS = [
  'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'dozen',
];
const NUMBER_WORD_RE = new RegExp(`(?<![a-z])(${NUMBER_WORDS.join('|')})(?![a-z])`, 'g');

// Small text helpers. key() puts a phrase in a standard form for lookups
// (lowercase, single spaces, µg as mcg). alternation() builds a regex that
// matches any of a list of phrases, longest first so "blood pressure" wins
// over "pressure".
const key = (s) => String(s).toLowerCase().replace(/µ/g, 'mc').replace(/\s+/g, ' ').trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alternation = (phrases) => [...new Set(phrases)]
  .sort((a, b) => b.length - a.length)
  .map((p) => escapeRe(p).replace(/ /g, '\\s+'))
  .join('|');

// Lookup tables from every spelling to its standard unit and route.
const UNIT_INFO = new Map();
for (const [spellings, canon, category] of UNITS) {
  for (const s of spellings) UNIT_INFO.set(s, { canon, category });
}
const UNIT_ALTS = alternation([...UNIT_INFO.keys()]);

const ROUTE_INFO = new Map();
for (const [route, spellings] of Object.entries(ROUTE_WORDS)) {
  for (const s of spellings) ROUTE_INFO.set(s, route);
}

// Standard form of a unit ("milligrams" -> "mg") and of a route
// ("sublingual" -> "SL"), so different spellings compare as equal.
export function canonUnit(unit) {
  const k = key(unit);
  return UNIT_INFO.get(k)?.canon ?? k;
}

export function canonRoute(route) {
  const k = key(route);
  return ROUTE_INFO.get(k) ?? k.toUpperCase();
}

// Standard form of a number, so ".4", "0.4" and "0.40" all compare as "0.4".
function canonNumber(s) {
  return String(Number(s));
}

// Times are stored as four digits, "1415", and shown as "14:15".
function canonTime(h, m) {
  return String(h).padStart(2, '0') + m;
}

export function formatTime(t) {
  return `${t.slice(0, 2)}:${t.slice(2)}`;
}

// Pain is entered as "8" and often written "8/10".
function comparable(subject, value) {
  return subject === 'pain' ? value.replace(/\/10$/, '') : value;
}

export function sameValue(subject, a, b) {
  return comparable(subject, a) === comparable(subject, b);
}

// Tidies text before reading it: "158 over 94" becomes "158/94".
function normalize(text) {
  return String(text).replace(/(\d)\s+over\s+(\d)/gi, '$1/$2').replace(/µ/g, 'mc');
}

// Builds a reader that also recognises the drug names entered in this report.
// The reader works in two passes: tokenize() picks out the meaningful pieces
// of the text in order (labels, drugs, routes, milestones, times, numbers,
// clause breaks, sentence ends), then bindSentence() ties each value to the
// thing it describes.
export function makeReader(enteredDrugs = []) {
  // Every word or phrase the reader knows, and what it means.
  const phrases = new Map();
  for (const w of NEUTRAL_WORDS) phrases.set(w, { type: 'neutral' });
  for (const [route, spellings] of Object.entries(ROUTE_WORDS)) {
    for (const s of spellings) phrases.set(s, { type: 'route', route, capsOnly: CAPS_ONLY.has(s) });
  }
  for (const [milestone, spellings] of Object.entries(MILESTONE_WORDS)) {
    for (const s of spellings) phrases.set(s, { type: 'milestone', subject: milestone });
  }
  for (const [subject, spellings] of Object.entries(VITAL_WORDS)) {
    for (const s of spellings) phrases.set(s, { type: 'label', subject });
  }
  for (const name of [...Object.keys(DRUG_ALIASES), ...enteredDrugs]) {
    if (key(name)) phrases.set(key(name), { type: 'drug', subject: canonicalDrug(name) });
  }

  // One pattern that finds every kind of piece. Each named group is one kind:
  //   phrase  a known word (vital label, drug, route, milestone)
  //   time    "14:15"
  //   at/hrs  times without a colon, "at 1415" or "1415 hrs"
  //   pair    "158/94"
  //   single  a number, with its unit if one follows ("0.4 mg", "104 bpm")
  //   sep     a clause break: comma, semicolon, colon, bracket, "and",
  //           "then", "but", "while"
  //   end     a sentence end
  const re = new RegExp([
    `(?<phrase>(?<![a-z0-9])(?:${alternation([...phrases.keys()])})(?![a-z0-9]))`,
    '(?<time>(?<!\\d|\\d[:.])(?<th>[01]?\\d|2[0-3]):(?<tm>[0-5]\\d)(?!\\d|:\\d))',
    // 24-hour times without a colon: "at 1432", "@1432", "1432 hrs".
    `(?<at>(?<![a-z])(?:at|@)\\s*(?<ah>[01]\\d|2[0-3])(?<am>[0-5]\\d)(?!\\d|[.:]\\d|\\/)(?!\\s*-?\\s*(?:${UNIT_ALTS})(?![a-z0-9])))`,
    '(?<hrs>(?<![\\d.])(?<hh>[01]\\d|2[0-3])(?<hm>[0-5]\\d)\\s*(?:hrs|hours)(?![a-z]))',
    // Pairs like 158/94 are one value. Only mmHg can follow one.
    '(?<pair>(?<pa>(?<![\\d.])\\d+(?:\\.\\d+)?)\\s*\\/\\s*(?<pb>\\d+(?:\\.\\d+)?)(?!\\d|\\.\\d)(?:\\s*(?<pu>mm\\s?hg)(?![a-z0-9]))?)',
    `(?<single>(?<sv>(?<![\\d.])(?:\\d+(?:\\.\\d+)?|\\.\\d+))(?:\\s*-?\\s*(?<su>${UNIT_ALTS})(?![a-z0-9]))?)`,
    '(?<sep>[,;:()]|(?<![a-z])(?:and|then|but|while)(?![a-z]))',
    '(?<end>[.!?](?=\\s|$)|\\n)',
  ].join('|'), 'gi');

  // Turns text into the list of pieces, in the order they appear.
  function tokenize(text) {
    const tokens = [];
    for (const m of text.matchAll(re)) {
      const g = m.groups;
      const raw = m[0].trim();
      if (g.phrase !== undefined) {
        const p = phrases.get(key(g.phrase));
        if (!p || p.type === 'neutral') continue;
        if (p.capsOnly && g.phrase !== g.phrase.toUpperCase()) continue;
        tokens.push({ ...p, raw });
      } else if (g.time !== undefined) {
        tokens.push({ type: 'time', time: canonTime(g.th, g.tm), raw });
      } else if (g.at !== undefined) {
        tokens.push({ type: 'time', time: g.ah + g.am, raw: g.ah + g.am });
      } else if (g.hrs !== undefined) {
        tokens.push({ type: 'time', time: g.hh + g.hm, raw });
      } else if (g.pair !== undefined) {
        tokens.push({
          type: 'value', value: `${canonNumber(g.pa)}/${canonNumber(g.pb)}`, raw,
          unit: g.pu ? 'mmhg' : null, category: g.pu ? 'bp' : null,
        });
      } else if (g.single !== undefined) {
        const unit = g.su ? UNIT_INFO.get(key(g.su)) : null;
        // "x3" is a count, not a reading or a dose.
        const count = /x\s?$/i.test(text.slice(Math.max(0, m.index - 2), m.index));
        tokens.push({
          type: 'value', value: canonNumber(g.sv), raw,
          unit: unit?.canon ?? null, category: unit?.category ?? null, count,
        });
      } else if (g.sep !== undefined) {
        tokens.push({ type: 'sep' });
      } else if (g.end !== undefined) {
        tokens.push({ type: 'end' });
      }
    }
    return tokens;
  }

  // Returns { claims, subjects, numberWords }. subjects is every label, drug
  // and milestone mentioned, whether or not a value is tied to it.
  function read(text) {
    const src = normalize(text);
    const tokens = tokenize(src);
    const claims = [];
    const subjects = new Set(tokens.filter((t) => t.subject).map((t) => t.subject));
    const clauses = { count: 0 };
    let sentence = [];
    for (const t of [...tokens, { type: 'end' }]) {
      if (t.type === 'end') {
        bindSentence(sentence, claims, clauses);
        sentence = [];
      } else {
        sentence.push(t);
      }
    }
    const numberWords = [...src.toLowerCase().matchAll(NUMBER_WORD_RE)].map((m) => m[1]);
    return { claims, subjects, numberWords };
  }

  return { read };
}

// Ties the values in one sentence to what they describe, and adds the
// resulting claims to the list. The sentence is first split into clauses at
// commas, "and", "then" and so on, because a value almost always belongs to
// a label or drug in its own clause. The rules are in the comment at the top
// of this file. Each claim is numbered with its clause, so the checker can
// tell which claims were written together ("BP 158/94 at 14:15").
function bindSentence(tokens, claims, clauses) {
  const clauseList = [[]];
  for (const t of tokens) {
    if (t.type === 'sep') clauseList.push([]);
    else clauseList.at(-1).push(t);
  }
  // A label or drug from the previous clause that never got a value, so it
  // can be picked up here ("Nitroglycerin was given, 0.4 mg SL").
  let dangling = { label: null, drug: null };
  for (const clause of clauseList) {
    const first = claims.length;
    let last = null; // most recent label, drug or milestone in this clause
    let lastDrug = null;
    const used = new Set();
    const next = (i, types) => clause.slice(i + 1).find((t) => types.includes(t.type));
    const isDose = (t) => t.type === 'value' && t.category === 'dose';
    const value = (t, subject) => claims.push({ kind: 'value', subject, value: t.value, raw: t.raw });
    const dose = (t, drug) => {
      claims.push({ kind: 'dose', drug: drug?.subject ?? null, value: t.value, unit: t.unit, raw: t.raw });
      if (drug) used.add(drug);
    };

    clause.forEach((t, i) => {
      switch (t.type) {
        case 'label':
        case 'milestone':
          last = t;
          break;
        case 'drug':
          claims.push({ kind: 'drug', drug: t.subject, raw: t.raw });
          last = t;
          lastDrug = t;
          break;
        case 'route': {
          const drug = lastDrug ?? next(i, ['drug']) ?? dangling.drug;
          if (drug) {
            claims.push({ kind: 'route', drug: drug.subject, route: t.route, raw: t.raw });
            used.add(drug);
            break;
          }
          // "Gave 0.4 mg IV" names no drug, so the route goes with the dose.
          const d = clause.slice(0, i).findLast(isDose) ?? clause.slice(i + 1).find(isDose);
          if (d) claims.push({ kind: 'route', drug: null, dose: d.value, unit: d.unit, route: t.route, raw: t.raw });
          break;
        }
        case 'time': {
          const s = last ?? next(i, ['label', 'drug', 'milestone']);
          claims.push({ kind: 'time', subject: s?.subject ?? null, time: t.time, raw: t.raw });
          break;
        }
        // A number. Decide what it describes, in this order: its unit if the
        // unit settles it, the label just before it, a drug just before it,
        // or a label or drug left over from the previous clause.
        case 'value': {
          if (t.category === 'duration' || t.category === 'age') return value(t, t.category);
          if (t.category === 'dose') return dose(t, lastDrug ?? next(i, ['drug']) ?? dangling.drug);
          if (t.count) return value(t, null);
          if (last?.type === 'label') {
            used.add(last);
            return value(t, last.subject);
          }
          if (VITALS.has(t.category)) return value(t, t.category);
          // A bare number right after a drug is a dose missing its unit.
          if (last?.type === 'drug') return dose(t, last);
          if (!last && dangling.label) {
            used.add(dangling.label);
            return value(t, dangling.label.subject);
          }
          if (!last && dangling.drug) return dose(t, dangling.drug);
          return value(t, null);
        }
      }
    });
    for (const c of claims.slice(first)) c.clause = clauses.count;
    clauses.count += 1;

    // Remember a label or drug in this clause that never got a value, for
    // the next clause.
    const lastOf = (type) => clause.findLast((t) => t.type === type);
    const label = lastOf('label');
    const drug = lastOf('drug');
    dangling = {
      label: label && !used.has(label) ? label : null,
      drug: drug && !used.has(drug) ? drug : null,
    };
  }
}

// Every number in a short entered value, e.g. "158/94" or "93%". Used for
// structured fields like a vital's value or a patient's age.
function numbersIn(text) {
  return [...normalize(text).matchAll(/(\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*(\d+(?:\.\d+)?))?/g)]
    .map((m) => (m[2] ? `${canonNumber(m[1])}/${canonNumber(m[2])}` : canonNumber(m[1])));
}

// The claims an entered fact supports. Structured fields give claims
// directly; free text is read like the narrative.
export function factClaims(fact, reader, byId) {
  const claims = [];
  const add = (c) => claims.push({ ...c, factId: fact.id });
  const minutes = parseTime(fact.time);
  const time = minutes === null ? null : canonTime(Math.floor(minutes / 60), String(minutes % 60).padStart(2, '0'));

  // Claims from the form's own fields, by kind of fact.
  switch (fact.kind) {
    case 'patient':
      for (const v of numbersIn(fact.age ?? '')) add({ kind: 'value', subject: 'age', value: v });
      break;
    case 'dispatch':
      if (time) add({ kind: 'time', subject: 'dispatched', time });
      break;
    case 'milestone':
      if (time) add({ kind: 'time', subject: fact.milestone, time });
      break;
    case 'vital':
      for (const v of numbersIn(fact.value ?? '')) add({ kind: 'value', subject: fact.type, value: v });
      if (time) add({ kind: 'time', subject: fact.type, time });
      break;
    case 'med': {
      const drug = canonicalDrug(fact.drug ?? '');
      add({ kind: 'drug', drug });
      const [dose] = numbersIn(fact.dose ?? '');
      if (dose) add({ kind: 'dose', drug, value: dose, unit: canonUnit(fact.unit ?? '') });
      if (fact.route) add({ kind: 'route', drug, dose, unit: canonUnit(fact.unit ?? ''), route: canonRoute(fact.route) });
      if (time) add({ kind: 'time', subject: drug, time });
      break;
    }
    // A response supports naming the drug it was a response to.
    case 'response': {
      const med = byId.get(fact.to);
      if (med?.drug) add({ kind: 'drug', drug: canonicalDrug(med.drug) });
      break;
    }
    // A transport's time is when the ambulance left the scene.
    case 'transport':
      if (time) add({ kind: 'time', subject: 'departscene', time });
      break;
  }

  // Claims from the free-text parts (procedure name, destination, notes),
  // read the same way as the narrative.
  const text = [fact.name, fact.destination, fact.text].filter(Boolean).join('. ');
  if (text) {
    const { claims: read, subjects } = reader.read(text);
    for (const c of read) add(c);
    // A timed finding about pain supports "pain ... at 14:13".
    if (time) for (const subject of subjects) add({ kind: 'time', subject, time });
  }
  // A fact's time also supports a time written with nothing to tie it to.
  if (time) add({ kind: 'time', subject: null, time });
  return claims;
}
