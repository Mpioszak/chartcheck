// The fact checker. It reads a narrative written as ordinary sentences,
// works out which entered facts each sentence came from, and flags any
// sentence that says something the entered facts don't support.
//
// Nobody has to label the sentences. For each sentence the checker:
//
//   1. reads its values as claims (see claims.js), each tied to what it
//      describes: a reading to its vital, a dose and route to their drug, a
//      time to the vital, drug, milestone or chief complaint it's written with;
//   2. looks for an entered fact that says the same thing about the same
//      subject, and labels the sentence with every fact it finds;
//   3. flags the sentence if any claim matches no fact, or if claims written
//      together ("BP 158/94 at 14:30", "fentanyl 50 mcg IV") only match when
//      taken from different facts;
//   4. matches the wording against facts entered as free text (dispatch
//      reason, chief complaint, findings, procedures, responses, transport,
//      necessity, patient notes), for sentences with values or without;
//   5. flags the sentence if nothing in it matches any fact.
//
// Values are never pooled: a reading only matches a fact for the same vital,
// a dose only a fact for the same drug with the same unit.

import { factText } from './schema.js';
import { canonicalDrug } from './drugs.js';
import { factClaims, formatTime, makeReader, sameValue, subjectName } from './claims.js';

// Old-style source tags like "[f3, f8]". They're no longer needed, so they
// are taken out before reading.
const TAG_RE = /\s*\[\s*f\d+(?:\s*,\s*f\d+)*\s*\]/gi;

// Words that end in a period without ending the sentence ("St. Mary's").
const ABBREVIATIONS = new Set(['st', 'dr', 'mr', 'mrs', 'ms', 'pt', 'approx', 'vs', 'e.g', 'i.e']);

// Splits a narrative into sentences at ., ! or ? followed by a space, and at
// line breaks. A period after an abbreviation or inside a number (0.4) isn't
// a sentence end.
export function splitSentences(narrative) {
  const text = String(narrative).replace(TAG_RE, '');
  const sentences = [];
  let start = 0;
  for (const m of text.matchAll(/[.!?]+(?=\s|$)|\n/g)) {
    if (m[0] !== '\n') {
      const word = /([a-z.]+)$/i.exec(text.slice(start, m.index))?.[1].toLowerCase();
      if (ABBREVIATIONS.has(word)) continue;
    }
    const end = m.index + m[0].length;
    const sentence = text.slice(start, end).trim();
    if (sentence) sentences.push(sentence);
    start = end;
  }
  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

// Helpers for writing readable error messages.
const quote = (s) => `"${s}"`;
const name = (subject) => subjectName(subject);

// One entered value written out with the fact it came from, e.g.
// "0.4 mg (f13)", so a message can say what was actually entered.
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

// Does entered claim s say the same thing as narrative claim c, about the
// same subject? This is the only test for a match, so a value can only be
// matched to a fact about what it's written next to.
function supports(c, s) {
  switch (c.kind) {
    case 'value':
      if (c.subject) return s.kind === 'value' && s.subject === c.subject && sameValue(c.subject, s.value, c.value);
      return (s.kind === 'value' || s.kind === 'dose') && sameValue(s.subject, s.value, c.value);
    case 'dose':
      return s.kind === 'dose' && (!c.drug || s.drug === c.drug) && s.value === c.value && s.unit === c.unit;
    case 'route':
      if (c.drug) return s.kind === 'route' && s.drug === c.drug && s.route === c.route;
      return s.kind === 'route' && s.dose === c.dose && s.unit === c.unit && s.route === c.route;
    case 'time':
      return s.kind === 'time' && (!c.subject || s.subject === c.subject) && s.time === c.time;
    case 'drug':
      return s.kind === 'drug' && s.drug === c.drug;
  }
  return false;
}

// Explains why a claim matches nothing, given the entered claims it could
// have been about. Returns null if one of them does match after all.
function explain(c, entered) {
  if (entered.some((s) => supports(c, s))) return null;
  switch (c.kind) {
    case 'value': {
      if (!c.subject) return `The number ${quote(c.raw)} isn't in the entered facts.`;
      const same = entered.filter((s) => s.kind === 'value' && s.subject === c.subject);
      const what = c.subject === 'duration' ? 'a duration' : name(c.subject);
      if (same.length) return `${quote(c.raw)} is given as ${what}, but the entered ${name(c.subject)} is ${list(same)}.`;
      return `${quote(c.raw)} is given as ${what}, but no ${name(c.subject)} was entered.`;
    }
    // Number and unit must both match, so 0.4 mcg against 0.4 mg fails.
    case 'dose': {
      if (!c.drug) return `The dose ${quote(c.raw)} isn't in the entered facts.`;
      const doses = entered.filter((s) => s.kind === 'dose' && s.drug === c.drug);
      if (!c.unit) {
        return `${quote(c.raw)} is given for ${c.drug} without a unit.`
          + (doses.length ? ` The entered dose is ${list(doses)}.` : '');
      }
      if (doses.length) return `${quote(c.raw)} is given for ${c.drug}, but the entered dose is ${list(doses)}.`;
      return `${quote(c.raw)} is given for ${c.drug}, but no dose of ${c.drug} was entered.`;
    }
    case 'route': {
      if (!c.drug) {
        // A dose nobody entered is already its own error.
        const routes = entered.filter((s) => s.kind === 'route' && s.dose === c.dose && s.unit === c.unit);
        if (!routes.length) return null;
        return `${quote(c.raw)} is given as the route for ${c.dose} ${c.unit}, but the entered route is ${list(routes)}.`;
      }
      const routes = entered.filter((s) => s.kind === 'route' && s.drug === c.drug);
      if (routes.length) return `${quote(c.raw)} is given as the route for ${c.drug}, but the entered route is ${list(routes)}.`;
      return `${quote(c.raw)} is given as the route for ${c.drug}, but no route for it was entered.`;
    }
    case 'time': {
      if (!c.subject) return `Time ${formatTime(c.time)} isn't in the entered facts.`;
      const times = entered.filter((s) => s.kind === 'time' && s.subject === c.subject);
      if (times.length) return `${formatTime(c.time)} is given for ${name(c.subject)}, but the entered time is ${list(times)}.`;
      return `${formatTime(c.time)} is given for ${name(c.subject)}, but no time for ${name(c.subject)} was entered.`;
    }
    case 'drug':
      return `The drug "${c.drug}" isn't in the entered facts.`;
  }
  return null;
}

// Claims written together in one clause about one subject form a unit, and
// a unit has to come from a single fact: "BP 158/94 at 14:30" needs one BP
// entry with that reading at that time, not a reading from one entry and a
// time from another. Readings and doses count as the same kind here.
const unitKey = (c) => `${c.clause}:${c.subject ?? c.drug ?? ''}`;
const kindOf = (c) => (c.kind === 'dose' ? 'value' : c.kind);

// ---- Matching sentences by wording ----
//
// A sentence with no values ("A 12-lead ECG showed ST elevation") can still
// come from a fact entered as free text. These facts are matched on shared
// words. Vitals, meds and call times are never matched this way, because a
// sentence about them has to state the value.

const STOP_WORDS = new Set(`
  about above after again against also among because been before being below between both came come could
  does doing down during each else even from further gave give given going had has have having here into
  just like made make more most much must noted only other over patient same should some such than that
  their them then there these they this those through under until upon very want were what when where which
  while will with within without would your`.split(/\s+/).filter(Boolean));

// The meaningful words in some text: a trailing "'s" or plural "s" is dropped
// ("elevations" -> "elevation"), and words under four letters and common
// words like "with" are skipped.
function contentWords(text) {
  const words = String(text).toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
  return new Set(words
    .map((w) => w.replace(/'s$/, '').replace(/(?<=[a-z]{3})s$/, ''))
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w)));
}

// The free-text part of a fact, if it has one worth matching on.
function freeText(fact) {
  return ['dispatch', 'complaint', 'finding', 'procedure', 'transport', 'necessity', 'response', 'patient'].includes(fact.kind)
    ? [fact.name, fact.destination, fact.text].filter(Boolean).join(' ')
    : '';
}

// A sentence matches a free-text fact when it shares at least two of the
// fact's words (or its only word), and those make up a fair part of the fact:
// four words, or a third of a shorter fact. So "chest pain" matches a
// dispatch entered as "chest pain" but not a long finding that mentions it.
function wordMatches(sentence, wordsById) {
  const words = contentWords(sentence);
  const ids = [];
  for (const [id, own] of wordsById) {
    let shared = 0;
    for (const w of own) if (words.has(w)) shared += 1;
    if (shared >= Math.min(2, own.size) && (shared >= 4 || shared * 3 >= own.size)) ids.push(id);
  }
  return ids;
}

// The main check. Returns { ok, sentences, errors, warnings }.
//
// sentences: one entry per sentence, in order:
//   { text, ids, wordOnly, problems, ok }
//   ids       the facts the sentence was matched to, in entry order
//   wordOnly  the subset of ids matched only by wording, not by a value
//   problems  why the sentence is flagged; empty when it's fine
// errors: every problem, as { sentence, text, message }.
// warnings: things worth a second look (an entered fact no sentence uses, a
// spelled-out number), as { sentence, text, message }.
export function checkNarrative(facts, narrative) {
  // Set up: look up facts by id, build a reader that knows the drug names
  // entered in this report, and work out what each fact supports.
  const order = new Map(facts.map((f, i) => [f.id, i]));
  const byId = new Map(facts.map((f) => [f.id, f]));
  const reader = makeReader(facts.filter((f) => f.kind === 'med' && f.drug).map((f) => f.drug));
  const supportById = new Map(facts.map((f) => [f.id, factClaims(f, reader, byId)]));
  const allSupport = [...supportById.values()].flat();
  const wordsById = new Map(facts.map((f) => [f.id, contentWords(freeText(f))]).filter(([, w]) => w.size));

  // The facts that support a claim on their own.
  const supporters = (c) => facts.filter((f) => supportById.get(f.id).some((s) => supports(c, s))).map((f) => f.id);

  const errors = [];
  const warnings = [];
  const used = new Set();
  const medsStated = new Set();
  const drugsWithErrors = new Set();

  if (String(narrative).replace(TAG_RE, '') !== String(narrative)) {
    warnings.push({ sentence: null, text: null, message: 'Source tags like [f3] are no longer needed, so they were ignored.' });
  }

  const sentences = splitSentences(narrative).map((text, i) => {
    const problems = [];
    const ids = new Set();
    const { claims, subjects, numberWords } = reader.read(text);

    // An unsupported drug gets one error, not one per dose, route and time.
    const badDrugs = new Set();
    for (const c of claims.filter((c) => c.kind === 'drug')) {
      if (badDrugs.has(c.drug)) continue;
      const found = supporters(c);
      if (!found.length) {
        problems.push(explain(c, allSupport));
        badDrugs.add(c.drug);
      } else if (!claims.some((o) => o.kind !== 'drug' && (o.drug ?? o.subject) === c.drug)) {
        // A drug named with nothing else about it ("following nitroglycerin")
        // is labelled with every fact about that drug.
        found.forEach((id) => ids.add(id));
      }
    }

    // Then values, doses, routes and times, one unit at a time.
    const units = new Map();
    const looseTimes = [];
    for (const c of claims) {
      if (c.kind === 'drug' || badDrugs.has(c.drug) || badDrugs.has(c.subject)) continue;
      if (!units.has(unitKey(c))) units.set(unitKey(c), []);
      units.get(unitKey(c)).push(c);
    }
    for (const unit of units.values()) {
      const found = new Map(unit.map((c) => [c, supporters(c)]));
      const missing = unit.filter((c) => !found.get(c).length);

      if (missing.length) {
        // Explain each claim against the facts the rest of the unit points
        // to, so "BP 128/76 at 14:30" is compared with the BP taken at 14:30.
        for (const c of missing) {
          const near = new Set(unit.filter((o) => kindOf(o) !== kindOf(c)).flatMap((o) => found.get(o)));
          const pool = near.size ? [...near].flatMap((id) => supportById.get(id)) : allSupport;
          const problem = explain(c, pool) ?? explain(c, allSupport);
          if (!problem) continue;
          problems.push(problem);
          if (c.drug) drugsWithErrors.add(c.drug);
        }
        // What did match is still labelled.
        unit.filter((c) => !missing.includes(c)).forEach((c) => found.get(c).forEach((id) => ids.add(id)));
        continue;
      }

      // Every claim matched something. Now the facts that match all of the
      // unit's kinds at once.
      const kinds = new Set(unit.map(kindOf));
      const together = facts.map((f) => f.id).filter((id) => [...kinds].every((k) =>
        unit.some((c) => kindOf(c) === k && found.get(c).includes(id))));
      if (kinds.size > 1 && !together.length) {
        const raws = unit.map((c) => quote(c.raw)).join(', ');
        const subject = unit[0].subject ?? unit[0].drug;
        const entries = [...new Set(unit.flatMap((c) => found.get(c)))]
          .sort((a, b) => order.get(a) - order.get(b))
          .map((id) => `${factText(byId.get(id))} (${id})`).join('; ');
        problems.push(`${raws} don't all come from one ${subject ? name(subject) + ' ' : ''}entry. Entered: ${entries}.`);
        if (unit[0].drug) drugsWithErrors.add(unit[0].drug);
        continue;
      }
      // Label with the facts that match the whole unit. A unit of one kind
      // ("Pain went from 8/10 to 5/10") is labelled with each value's facts.
      // A time on its own ("Vitals at 14:15: ...") waits until the rest of
      // the sentence is labelled.
      if (kinds.size > 1) together.forEach((id) => ids.add(id));
      else if (unit.every((c) => c.kind === 'time' && !c.subject)) looseTimes.push(...unit);
      else unit.forEach((c) => found.get(c).forEach((id) => ids.add(id)));
    }
    // A time tied to nothing labels only the facts at that time the sentence
    // already matched, if there are any, rather than every fact at that time.
    const matched = new Set(ids);
    for (const c of looseTimes) {
      const found = supporters(c);
      const narrowed = found.filter((id) => matched.has(id));
      (narrowed.length ? narrowed : found).forEach((id) => ids.add(id));
    }

    // Wording, for facts entered as free text.
    const valueIds = new Set(ids);
    for (const id of wordMatches(text, wordsById)) ids.add(id);
    const wordOnly = [...ids].filter((id) => !valueIds.has(id));

    // Nothing at all matched: flag the sentence.
    if (!ids.size && !problems.length) {
      const named = [...subjects].filter((s) => !claims.some((c) => c.drug === s));
      problems.push(named.length
        ? `Mentions ${named.map(name).join(', ')} but gives no value or time to match against what was entered.`
        : 'Nothing in this sentence matches an entered fact.');
    }

    // Note which matched meds had their full dose, unit and route stated
    // here, for the "never stated in full" warning at the end.
    for (const id of ids) {
      used.add(id);
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

    for (const message of problems) errors.push({ sentence: i, text, message });
    // "Two puffs" can't be checked against anything, so ask for digits.
    for (const w of numberWords) {
      warnings.push({ sentence: i, text, message: `"${w}" is a spelled-out number, which can't be checked. Write numbers as digits.` });
    }

    const sorted = (xs) => [...xs].sort((a, b) => order.get(a) - order.get(b));
    return { text, ids: sorted(ids), wordOnly: sorted(wordOnly), problems, ok: problems.length === 0 };
  });

  // After all sentences: warn about entered facts no sentence uses, and meds
  // that are used but never written out with dose, unit and route.
  for (const f of facts) {
    if (!used.has(f.id)) {
      warnings.push({ sentence: null, text: null, message: `${f.id} (${factText(f)}) was entered but no sentence matches it.` });
    } else if (f.kind === 'med' && !medsStated.has(f.id) && !drugsWithErrors.has(canonicalDrug(f.drug ?? ''))) {
      warnings.push({ sentence: null, text: null, message: `${f.id} (${factText(f)}) is mentioned but never stated with its dose, unit and route.` });
    }
  }

  return { ok: errors.length === 0, sentences, errors, warnings };
}
