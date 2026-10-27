// The gap finder. Reads the entered facts and reports what a close reader
// (a hospital, a lawyer, an insurer) would find missing or inconsistent.
// Each finding is { severity: 'error' | 'warning', message, factIds }.

import { MILESTONES, MILESTONE_LABELS, parseTime, validateFact } from './schema.js';

// The time the call was dispatched, which every other time is measured from.
// Uses the "Dispatched" call time if there is one, else the dispatch entry's
// time. Null if neither has a usable time.
function dispatchTime(facts) {
  const dispatched = facts.find((f) => f.kind === 'milestone' && f.milestone === 'dispatched')
    ?? facts.find((f) => f.kind === 'dispatch');
  return parseTime(dispatched?.time) === null ? null : dispatched.time;
}

// Minutes since dispatch, so a call that crosses midnight still sorts. A call
// lasts well under 12 hours, so a time more than 12 hours "after" dispatch is
// really before it, and comes back negative.
function clock(origin) {
  const o = parseTime(origin);
  return (time) => {
    const t = parseTime(time);
    if (t === null) return null;
    if (o === null) return t;
    const since = (t - o + 1440) % 1440;
    return since > 720 ? since - 1440 : since;
  };
}

// A med written out for a message, e.g. "fentanyl 50 mcg IV".
function medName(med) {
  return [med.drug, med.dose && `${med.dose}${med.unit ? ' ' + med.unit : ''}`, med.route].filter(Boolean).join(' ');
}

// Runs every check below and returns the list of findings. "error" means
// something is wrong (bad data, times that can't be right); "warning" means
// something a close reader would expect to see is missing.
export function findGaps(facts) {
  const gaps = [];
  // Helpers: add() records a finding; at() turns a time into minutes since
  // dispatch; of() lists the facts of one kind.
  const add = (severity, message, ...factIds) => gaps.push({ severity, message, factIds });
  const dispatched = dispatchTime(facts);
  const at = clock(dispatched);
  const of = (kind) => facts.filter((f) => f.kind === kind);

  // Each fact on its own: required fields filled in, times in HH:MM.
  for (const f of facts) {
    for (const problem of validateFact(f)) add('error', `${f.id}: ${problem}.`, f.id);
  }

  // The basics every report needs.
  const patient = of('patient');
  if (!patient.length) add('warning', 'No patient age or sex entered.');
  if (!of('dispatch').length) add('warning', 'No dispatch reason entered (what the call came in as).');
  if (!of('finding').length) add('warning', 'No findings entered (what you found on arrival).');

  // Call times in order. First, each milestone should be entered once. Then,
  // taking the milestones in their expected order (dispatched, en route, on
  // scene, ...), each one must not be earlier than the one before it.
  const milestones = of('milestone').filter((f) => at(f.time) !== null);
  const seen = new Map();
  for (const m of milestones) {
    if (seen.has(m.milestone)) {
      add('warning', `"${MILESTONE_LABELS[m.milestone]}" is entered twice.`, seen.get(m.milestone).id, m.id);
    } else {
      seen.set(m.milestone, m);
    }
  }
  const ordered = MILESTONES.filter((name) => seen.has(name)).map((name) => seen.get(name));
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    if (at(cur.time) < at(prev.time)) {
      add('error',
        `Times are out of order: ${MILESTONE_LABELS[cur.milestone]} (${cur.time}) is before ${MILESTONE_LABELS[prev.milestone]} (${prev.time}).`,
        prev.id, cur.id);
    }
  }

  // Anything else timed before dispatch is either a wrong time or something
  // that happened before EMS arrived, which the narrative should say.
  if (dispatched !== null) {
    for (const f of facts) {
      const t = at(f.time);
      if (f.kind === 'milestone' || f.kind === 'dispatch' || t === null || t >= 0) continue;
      add('warning', `${f.id} is timed ${f.time}, before the call was dispatched (${dispatched}). Check the time, or say in the narrative that it happened before EMS arrived.`, f.id);
    }
  }

  // Every med needs a response, and the response can't come before the med.
  const responses = of('response');
  const vitals = of('vital');
  for (const med of of('med')) {
    const mine = responses.filter((r) => r.to === med.id);
    if (!mine.length) {
      add('warning', `You gave ${medName(med)}${med.time ? ' at ' + med.time : ''} but didn't record how the patient responded.`, med.id);
    }
    for (const r of mine) {
      if (at(r.time) !== null && at(med.time) !== null && at(r.time) < at(med.time)) {
        add('error', `The response to ${med.drug} (${r.time}) is timed before the drug was given (${med.time}).`, med.id, r.id);
      }
    }
    if (at(med.time) !== null && !vitals.some((v) => at(v.time) !== null && at(v.time) > at(med.time))) {
      add('warning', `No vitals were taken after ${med.drug} (${med.time}), so reassessment isn't documented.`, med.id);
    }
  }
  for (const r of responses) {
    if (r.to && !facts.some((f) => f.id === r.to && f.kind === 'med')) {
      add('error', `${r.id} is a response to ${r.to}, which isn't an entered medication. If that med was deleted, point the response at the right one or delete it.`, r.id);
    }
  }

  // Transport needs a medical-necessity statement and more than one set of
  // vitals. (Its destination is a required field, checked with the others
  // above.) A "set" is the vitals sharing one time.
  const transports = of('transport');
  if (transports.length) {
    const necessity = of('necessity');
    if (!necessity.length) {
      add('error', "You transported the patient but didn't say why an ambulance was medically necessary. This is the sentence the insurer looks for.", transports[0].id);
    } else if (necessity.every((n) => String(n.text ?? '').trim().split(/\s+/).length < 8)) {
      add('warning', 'The medical-necessity statement is very short. Say specifically why the patient could not safely travel another way.', ...necessity.map((n) => n.id));
    }
    const vitalTimes = new Set(vitals.map((v) => v.time));
    if (vitalTimes.size < 2) add('warning', 'Only one set of vitals was recorded for a transported patient.');
  }

  return gaps;
}
