// The fact checker. It reads a narrative and rejects any value that doesn't
// match the fact it belongs to.
//
// Narrative format: every sentence (or run of sentences) ends with a source
// tag listing the fact ids it was written from, e.g.
//
//   Found a 67-year-old male sitting upright, complaining of chest pain. [f1, f3]
//
// A tag covers all text since the previous tag. Text with no tag is rejected,
// because a sentence with no source is how a fluent invented fact slips in.
//
// Within a tagged span, values are checked as claims (see claims.js), not as
// loose numbers: a reading must match the cited reading of the vital it's
// written next to, a dose must match its drug's cited dose and unit, a route
// its drug's cited route, and a time the cited time of the vital, drug or
// milestone it's written with. Every cited vital's reading must be stated.

import { factText } from './schema.js';
import { canonicalDrug } from './drugs.js';
import { factClaims, formatTime, makeReader, sameValue, subjectName } from './claims.js';

const TAG_RE = /\[([^\]]*)\]/g;

// Splits a narrative into spans, each with the tag that closes it. Any text
// left after the last tag becomes a span with no tag (ids: null), which the
// checker rejects.
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

// Helpers for writing readable error messages.
const quote = (s) => `"${s}"`;
const name = (subject) => subjectName(subject);

// One supported value written out with the fact it came from, e.g.
// "0.4 mg (f13)", so a message can say what the cited fact actually says.
function show(s) {
  switch (s.kind) {
    case 'value': return `${s.value} (${s.factId})`;
    case 'dose': return `${s.value} ${s.unit} (${s.factId})`;
    case 'route': return `${s.route} (${s.factId})`;
    case 'time': return `${formatTime(s.time)} (${s.factId})`;
    default: return s.factId;
  }
}

const list = (items) => [...new Set(items.map(show))].join(' or ');

// Compares one narrative claim with the cited facts' claims. Returns an error
// message, or null when a cited fact supports it.
//
// For each kind of claim it asks: is there a cited fact that says the same
// thing about the same subject? If not, the message says what the cited
// facts do say, and elsewhere() adds whether the value was entered in some
// other fact the sentence forgot to cite.
function verify(c, cited, elsewhere) {
  switch (c.kind) {
    // A reading. Tied to a vital ("BP 158/94"): the cited reading of that
    // vital must match. Not tied to anything: any cited reading or dose with
    // that number will do.
    case 'value': {
      if (c.subject) {
        const same = cited.filter((s) => s.kind === 'value' && s.subject === c.subject);
        if (same.some((s) => sameValue(c.subject, s.value, c.value))) return null;
        const what = c.subject === 'duration' ? 'a duration' : name(c.subject);
        if (same.length) return `${quote(c.raw)} is given as ${what}, but the cited ${name(c.subject)} is ${list(same)}.`;
        return `${quote(c.raw)} is given as ${what}, but no cited fact has a ${name(c.subject)}.`
          + elsewhere((s) => s.kind === 'value' && s.subject === c.subject && sameValue(c.subject, s.value, c.value));
      }
      const match = (s) => (s.kind === 'value' || s.kind === 'dose') && sameValue(s.subject, s.value, c.value);
      if (cited.some(match)) return null;
      return `The number ${quote(c.raw)} isn't in the cited facts.` + elsewhere(match);
    }
    // A dose. Number and unit must both match the cited dose of that drug,
    // so 0.4 mcg against an entered 0.4 mg is rejected.
    case 'dose': {
      if (!c.drug) {
        const match = (s) => s.kind === 'dose' && s.value === c.value && s.unit === c.unit;
        if (cited.some(match)) return null;
        return `The dose ${quote(c.raw)} isn't in the cited facts.` + elsewhere(match);
      }
      const doses = cited.filter((s) => s.kind === 'dose' && s.drug === c.drug);
      if (doses.some((s) => s.value === c.value && s.unit === c.unit)) return null;
      if (!c.unit) {
        return `${quote(c.raw)} is given for ${c.drug} without a unit.`
          + (doses.length ? ` The cited dose is ${list(doses)}.` : '');
      }
      if (doses.length) return `${quote(c.raw)} is given for ${c.drug}, but the cited dose is ${list(doses)}.`;
      return `${quote(c.raw)} is given for ${c.drug}, but no cited fact has a dose of ${c.drug}.`
        + elsewhere((s) => s.kind === 'dose' && s.drug === c.drug && s.value === c.value && s.unit === c.unit);
    }
    // A route. Must match the cited route of that drug (or of that dose,
    // when the sentence doesn't name the drug).
    case 'route': {
      if (!c.drug) {
        // A dose nobody entered is already its own error.
        const routes = cited.filter((s) => s.kind === 'route' && s.dose === c.dose && s.unit === c.unit);
        if (!routes.length || routes.some((s) => s.route === c.route)) return null;
        return `${quote(c.raw)} is given as the route for ${c.dose} ${c.unit}, but the cited route is ${list(routes)}.`;
      }
      const routes = cited.filter((s) => s.kind === 'route' && s.drug === c.drug);
      if (routes.some((s) => s.route === c.route)) return null;
      if (routes.length) return `${quote(c.raw)} is given as the route for ${c.drug}, but the cited route is ${list(routes)}.`;
      return `${quote(c.raw)} is given as the route for ${c.drug}, but no cited fact has a route for it.`;
    }
    // A time. Tied to an event ("BP ... at 14:15", "departed scene at 14:24"):
    // must match that event's cited time. Otherwise any cited time will do.
    case 'time': {
      if (!c.subject) {
        const match = (s) => s.kind === 'time' && s.time === c.time;
        if (cited.some(match)) return null;
        return `Time ${formatTime(c.time)} isn't in the cited facts.` + elsewhere(match);
      }
      const times = cited.filter((s) => s.kind === 'time' && s.subject === c.subject);
      if (times.some((s) => s.time === c.time)) return null;
      if (times.length) return `${formatTime(c.time)} is given for ${name(c.subject)}, but the cited time is ${list(times)}.`;
      return `${formatTime(c.time)} is given for ${name(c.subject)}, but no cited fact has a time for ${name(c.subject)}.`
        + elsewhere((s) => s.kind === 'time' && s.subject === c.subject && s.time === c.time);
    }
    // A drug name. Some cited fact must involve that drug.
    case 'drug': {
      const match = (s) => s.kind === 'drug' && s.drug === c.drug;
      if (cited.some(match)) return null;
      return `The drug "${c.drug}" isn't in the cited facts.` + elsewhere(match);
    }
  }
  return null;
}

// The main check. Returns { ok, errors, warnings, spans }. ok is true only
// when there are no errors. Errors mean the narrative says something the
// entered facts don't support; warnings point at things worth a second look
// (an entered fact the narrative never mentions, a spelled-out number).
export function checkNarrative(facts, narrative) {
  // Set up: look up facts by id, build a reader that knows the drug names
  // entered in this report, and work out what each fact supports.
  const byId = new Map(facts.map((f) => [f.id, f]));
  const reader = makeReader(facts.filter((f) => f.kind === 'med' && f.drug).map((f) => f.drug));
  const supportById = new Map(facts.map((f) => [f.id, factClaims(f, reader, byId)]));

  // Running totals across all spans: which facts were cited anywhere, which
  // meds were stated in full, and which drugs already have an error (so
  // they don't also get a "never stated" warning).
  const errors = [];
  const warnings = [];
  const cited = new Set();
  const medsStated = new Set();
  const drugsWithErrors = new Set();
  const spans = splitSpans(narrative);

  // Check each tagged span in turn.
  spans.forEach((span, i) => {
    const at = { span: i, text: span.text };
    // First, the tag itself: there must be text before it, the tag must
    // list at least one id, and every id must be a fact that exists.
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
    // Everything the cited facts support, pooled for this span. Each claim
    // still carries its subject (which vital, which drug), so a value can
    // only be matched to the fact it belongs to.
    const sources = span.ids.filter((id) => byId.has(id));
    sources.forEach((id) => cited.add(id));
    const support = sources.flatMap((id) => supportById.get(id));
    // For error messages: was the value entered in a fact this span didn't cite?
    const elsewhere = (match) => {
      const ids = [...supportById].filter(([id, claims]) => !sources.includes(id) && claims.some(match)).map(([id]) => id);
      return ids.length
        ? ` It was entered in ${ids.join(', ')}, which this sentence doesn't cite.`
        : ' Nothing entered matches it.';
    };

    // Read the span's text into claims, the same way fact text is read.
    const { claims, numberWords } = reader.read(span.text);

    // An unsupported drug gets one error, not one per dose, route and time.
    const badDrugs = new Set();
    for (const c of claims.filter((c) => c.kind === 'drug')) {
      const problem = verify(c, support, elsewhere);
      if (problem && !badDrugs.has(c.drug)) errors.push({ ...at, message: problem });
      if (problem) badDrugs.add(c.drug);
    }
    // Then every other claim: values, doses, routes and times.
    const mismatched = new Set();
    for (const c of claims.filter((c) => c.kind !== 'drug')) {
      if (badDrugs.has(c.drug) || badDrugs.has(c.subject)) continue;
      const problem = verify(c, support, elsewhere);
      if (!problem) continue;
      errors.push({ ...at, message: problem });
      if (c.kind === 'value') mismatched.add(c.subject);
      if (c.drug) drugsWithErrors.add(c.drug);
    }

    // Every cited vital's reading has to be stated, so a cited reading can't
    // be quietly replaced with another number.
    for (const id of sources) {
      const f = byId.get(id);
      if (f.kind !== 'vital' || mismatched.has(f.type)) continue;
      const readings = supportById.get(id).filter((s) => s.kind === 'value');
      const stated = readings.every((r) => claims.some((c) => c.kind === 'value'
        && (c.subject === r.subject || c.subject === null) && sameValue(r.subject, r.value, c.value)));
      if (!stated) errors.push({ ...at, message: `Cites ${id} (${name(f.type)} ${f.value}) but doesn't state that reading.` });
    }

    // Note which cited meds had their full dose, unit and route stated here,
    // for the "never stated in full" warning at the end.
    for (const id of sources) {
      const f = byId.get(id);
      if (f.kind !== 'med') continue;
      const drug = canonicalDrug(f.drug ?? '');
      const own = supportById.get(id);
      const doseOk = own.filter((s) => s.kind === 'dose').every((s) =>
        claims.some((c) => c.kind === 'dose' && c.drug === drug && c.value === s.value && c.unit === s.unit));
      const routeOk = own.filter((s) => s.kind === 'route').every((s) =>
        claims.some((c) => c.kind === 'route' && c.drug === drug && c.route === s.route));
      if (doseOk && routeOk) medsStated.add(id);
    }

    // "Two puffs" can't be checked against anything, so ask for digits.
    for (const w of numberWords) {
      warnings.push({ ...at, message: `"${w}" is a spelled-out number, which can't be checked. Write numbers as digits.` });
    }
  });

  // After all spans: warn about entered facts the narrative never cites, and
  // meds that are cited but never written out with dose, unit and route.
  for (const f of facts) {
    if (!cited.has(f.id)) {
      warnings.push({ span: null, text: null, message: `${f.id} (${factText(f)}) was entered but the narrative never cites it.` });
    } else if (f.kind === 'med' && !medsStated.has(f.id) && !drugsWithErrors.has(canonicalDrug(f.drug ?? ''))) {
      warnings.push({ span: null, text: null, message: `${f.id} (${factText(f)}) is cited but never stated with its dose, unit and route.` });
    }
  }

  return { ok: errors.length === 0, errors, warnings, spans };
}
