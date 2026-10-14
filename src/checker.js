// The fact checker. It reads a narrative and rejects any time, number or drug
// name that the medic did not enter.
//
// Narrative format: every sentence (or run of sentences) ends with a source
// tag listing the fact ids it was written from, e.g.
//
//   Found a 67-year-old male sitting upright, complaining of chest pain. [f1, f3]
//
// A tag covers all text since the previous tag. Text with no tag is rejected,
// because a sentence with no source is how a fluent invented fact slips in.
// Within a tagged span, every time, number and drug name must appear in one of
// the cited facts, not just somewhere in the report.

import { factText } from './schema.js';
import { DRUG_ALIASES, canonicalDrug } from './drugs.js';

const TIME_RE = /(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g;
const NUM_RE = /\d+(?:\.\d+)?|\.\d+/g;
// Terms that contain digits but are not numeric claims.
const DIGIT_TERMS_RE = /(?<![a-z0-9])(?:spo2|etco2|co2|o2|1[25][- ]lead|d5w)(?![a-z0-9])/g;
const NUMBER_WORDS = [
  'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'dozen',
];
const NUMBER_WORD_RE = new RegExp(`(?<![a-z])(${NUMBER_WORDS.join('|')})(?![a-z])`, 'g');
const TAG_RE = /\[([^\]]*)\]/g;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function drugMatcher(names) {
  const sorted = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  return new RegExp(`(?<![a-z0-9])(${sorted.map(escapeRe).join('|')})(?![a-z0-9])`, 'g');
}

// Pulls out the checkable claims in a piece of text.
export function extractClaims(text, drugRe) {
  let s = String(text).toLowerCase();
  const drugs = new Set();
  s = s.replace(drugRe, (m) => { drugs.add(canonicalDrug(m)); return ' '; });
  s = s.replace(DIGIT_TERMS_RE, ' ');
  const times = new Set();
  s = s.replace(TIME_RE, (_, h, m) => { times.add(h.padStart(2, '0') + m); return ' '; });
  const numbers = [];
  s = s.replace(NUM_RE, (m) => { numbers.push({ raw: m, value: String(Number(m)) }); return ' '; });
  const numberWords = [...s.matchAll(NUMBER_WORD_RE)].map((m) => m[1]);
  return { drugs, times, numbers, numberWords };
}

function supportOf(facts, drugRe) {
  const claims = extractClaims(facts.map(factText).join(' \n '), drugRe);
  return { drugs: claims.drugs, times: claims.times, numbers: new Set(claims.numbers.map((n) => n.value)) };
}

// Splits a narrative into spans, each with the tag that closes it.
export function splitSpans(narrative) {
  const spans = [];
  let last = 0;
  for (const m of narrative.matchAll(TAG_RE)) {
    const text = narrative.slice(last, m.index).trim();
    const ids = m[1].split(',').map((x) => x.trim()).filter(Boolean);
    spans.push({ text, ids, tag: m[0] });
    last = m.index + m[0].length;
  }
  const tail = narrative.slice(last).trim();
  if (tail) spans.push({ text: tail, ids: null, tag: null });
  return spans;
}

export function checkNarrative(facts, narrative) {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const enteredDrugs = facts.filter((f) => f.kind === 'med' && f.drug).map((f) => f.drug);
  const drugRe = drugMatcher([...Object.keys(DRUG_ALIASES), ...enteredDrugs]);
  const supportById = new Map(facts.map((f) => [f.id, supportOf([f], drugRe)]));

  const errors = [];
  const warnings = [];
  const cited = new Set();
  const spans = splitSpans(narrative);

  const whereElse = (field, value) => {
    const ids = [...supportById].filter(([, s]) => s[field].has(value)).map(([id]) => id);
    return ids.length
      ? ` It was entered in ${ids.join(', ')}, which this sentence doesn't cite.`
      : ' Nothing entered contains it.';
  };

  spans.forEach((span, i) => {
    const at = { span: i, text: span.text };
    if (!span.text) {
      if (span.tag) warnings.push({ ...at, message: `Source tag ${span.tag} has no text before it.` });
      return;
    }
    if (span.ids === null) {
      errors.push({ ...at, message: 'This text has no source tag, so none of it can be verified.' });
      return;
    }
    if (span.ids.length === 0) {
      errors.push({ ...at, message: 'The source tag is empty.' });
      return;
    }
    const unknown = span.ids.filter((id) => !byId.has(id));
    if (unknown.length) {
      errors.push({ ...at, message: `Cites ${unknown.join(', ')}, which ${unknown.length > 1 ? "don't" : "doesn't"} exist.` });
    }
    const sources = span.ids.filter((id) => byId.has(id));
    sources.forEach((id) => cited.add(id));
    const support = supportOf(sources.map((id) => byId.get(id)), drugRe);
    const claims = extractClaims(span.text, drugRe);

    for (const t of claims.times) {
      if (!support.times.has(t)) {
        errors.push({ ...at, message: `Time ${t.slice(0, 2)}:${t.slice(2)} isn't in the cited facts.${whereElse('times', t)}` });
      }
    }
    for (const n of claims.numbers) {
      if (support.numbers.has(n.value)) continue;
      // "1432" written as a 24-hour time without the colon.
      if (/^\d{4}$/.test(n.raw) && support.times.has(n.raw)) continue;
      errors.push({ ...at, message: `The number ${n.raw} isn't in the cited facts.${whereElse('numbers', n.value)}` });
    }
    for (const d of claims.drugs) {
      if (!support.drugs.has(d)) {
        errors.push({ ...at, message: `The drug "${d}" isn't in the cited facts.${whereElse('drugs', d)}` });
      }
    }
    // A cited vital whose value never shows up usually means the reading was
    // swapped for a different one.
    const spanNumbers = new Set(claims.numbers.map((n) => n.value));
    for (const id of sources) {
      const f = byId.get(id);
      if (f.kind !== 'vital') continue;
      const own = extractClaims(f.value ?? '', drugRe).numbers;
      if (own.length && !own.some((n) => spanNumbers.has(n.value))) {
        warnings.push({ ...at, message: `Cites ${id} but never states its value (${f.value}).` });
      }
    }
    for (const w of claims.numberWords) {
      warnings.push({ ...at, message: `"${w}" is a spelled-out number, which can't be checked. Write numbers as digits.` });
    }
  });

  for (const f of facts) {
    if (!cited.has(f.id)) {
      warnings.push({ span: null, text: null, message: `${f.id} (${factText(f)}) was entered but the narrative never cites it.` });
    }
  }

  return { ok: errors.length === 0, errors, warnings, spans };
}
