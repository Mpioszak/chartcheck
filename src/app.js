// The page itself. This file wires the three sections of index.html to the
// logic in the other modules:
//
//   1. Facts            a form for entering facts, and a table listing them
//   2. What's missing   the gap finder's results (gaps.js), refreshed on every change
//   3. Narrative check  a text box for the narrative and the checker's verdict (checker.js)
//
// Nothing is sent anywhere. The facts and narrative are kept in the browser's
// local storage so a page reload doesn't lose them, and can be exported to or
// imported from a JSON file.

import { KINDS, MILESTONES, MILESTONE_LABELS, VITAL_TYPES, VITAL_LABELS, ROUTES, factText, nextFactId, validateFact } from './schema.js';
import { checkNarrative } from './checker.js';
import { findGaps } from './gaps.js';
import { SAMPLE_FACTS, SAMPLE_NARRATIVE } from './sample.js';

const STORAGE_KEY = 'chartcheck:v1';
// Shorthand for finding one element on the page, e.g. $('#narrative').
const $ = (sel) => document.querySelector(sel);

// Everything the page knows: the list of facts and the narrative text.
let state = load();

// ---- Saving and loading ----

// Reads the last saved report from local storage. Falls back to an empty
// report if nothing is saved or the saved copy can't be read.

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.facts)) return { facts: saved.facts, narrative: saved.narrative ?? '' };
  } catch { /* storage unavailable or corrupt */ }
  return { facts: [], narrative: '' };
}

// Writes the current report to local storage. Failing to save is not fatal.
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

// ---- Building page elements ----

// Creates an HTML element. attrs sets its attributes ("class", or "onclick"
// and friends for event handlers); children are added inside it.
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

// Turns a list of values into <option>s for a dropdown, using the friendly
// label for each where there is one.
function options(values, labels = {}) {
  return values.map((v) => el('option', { value: v }, labels[v] ?? v));
}

// Builds the input box for one field of the fact form. The type comes from
// the field list in schema.js: times get a text box that expects HH:MM, fixed
// lists (milestones, vital types, routes) get a dropdown, and "medref" gets a
// dropdown of the medications already entered, so a response can say which
// med it was a response to.
function fieldInput(name, type) {
  switch (type) {
    case 'time': return el('input', { name, type: 'text', placeholder: 'HH:MM', pattern: '([01]?\\d|2[0-3]):[0-5]\\d', inputmode: 'numeric' });
    case 'milestone': return el('select', { name }, ...options(MILESTONES, MILESTONE_LABELS));
    case 'vitaltype': return el('select', { name }, ...options(VITAL_TYPES, VITAL_LABELS));
    case 'route': return el('select', { name }, ...options(ROUTES));
    case 'medref': {
      const meds = state.facts.filter((f) => f.kind === 'med');
      return el('select', { name }, ...meds.map((m) => el('option', { value: m.id }, `${m.id}: ${m.drug} ${m.time}`)));
    }
    default: return el('input', { name, type: 'text' });
  }
}

// ---- Drawing each section ----

// Redraws the form fields for whichever kind of fact is picked in the
// "Kind" dropdown (a vital needs time, type and value; a med needs drug,
// dose, unit and route; and so on).
function renderFields() {
  const spec = KINDS[$('#kind').value];
  const box = $('#fields');
  box.replaceChildren();
  for (const [name, [label, type, required]] of Object.entries(spec.fields)) {
    box.append(el('label', {}, `${label}${required ? '' : ' (optional)'} `, fieldInput(name, type)));
  }
}

// Redraws the table of entered facts. A fact with a problem (a missing
// required field, a bad time) is highlighted, with the problem shown on hover.
function renderFacts() {
  const body = $('#facts tbody');
  body.replaceChildren();
  for (const f of state.facts) {
    const { time, ...rest } = f;
    const problems = validateFact(f);
    body.append(el('tr', problems.length ? { class: 'invalid', title: problems.join('; ') } : {},
      el('td', {}, f.id),
      el('td', {}, KINDS[f.kind]?.label ?? f.kind),
      el('td', {}, time ?? ''),
      el('td', {}, factText(rest) + (f.to ? ` (re ${f.to})` : '')),
      el('td', {}, el('button', { class: 'small', onclick: () => removeFact(f.id) }, 'Delete')),
    ));
  }
}

// Fills a list on the page with findings. Each finding shows the narrative
// text it's about (if any) and the message explaining what's wrong.
function renderFindings(list, items, cls) {
  list.replaceChildren(...items.map((item) => el('li', { class: cls ?? item.severity },
    item.text ? el('q', {}, item.text) : '', item.text ? ' ' : '', item.message)));
}

// Runs the gap finder on the current facts and shows what it found in the
// "What's missing" section.
function renderGaps() {
  const gaps = findGaps(state.facts);
  const list = $('#gaps');
  if (!state.facts.length) list.replaceChildren(el('li', { class: 'muted' }, 'Add facts to see what is missing.'));
  else if (!gaps.length) list.replaceChildren(el('li', { class: 'ok' }, 'Nothing missing that these rules know to look for.'));
  else renderFindings(list, gaps);
}

// Runs the fact checker on the narrative and shows the verdict: accepted if
// every time, number and drug name traces to a cited fact, rejected
// otherwise, followed by the errors and the warnings.
function runCheck() {
  state.narrative = $('#narrative').value;
  save();
  const result = checkNarrative(state.facts, state.narrative);
  $('#verdict').replaceChildren(result.ok
    ? el('p', { class: 'ok' }, 'Every time, number and drug name traces to a cited fact.')
    : el('p', { class: 'error' }, `Rejected: ${result.errors.length} unsupported claim${result.errors.length === 1 ? '' : 's'}.`));
  renderFindings($('#check-errors'), result.errors, 'error');
  renderFindings($('#check-warnings'), result.warnings, 'warning');
}

// Redraws everything that depends on the facts.
function render() {
  renderFacts();
  renderGaps();
  $('#narrative').value = state.narrative;
  renderFields();
}

// Deletes one fact (the Delete button in its table row).
function removeFact(id) {
  state.facts = state.facts.filter((f) => f.id !== id);
  save();
  render();
}

// ---- Wiring up the buttons and the form ----

// Fill the "Kind" dropdown with every kind of fact, and redraw the form
// fields when a different kind is picked.
$('#kind').append(...Object.entries(KINDS).map(([k, spec]) => el('option', { value: k }, spec.label)));
$('#kind').addEventListener('change', renderFields);

// "Add fact": collect the form's values into a new fact with the next free
// id (f1, f2, ...). If a required field is missing or a time is malformed,
// show why and don't add it. Otherwise add it, save, and redraw, keeping the
// same kind selected so several vitals in a row are quick to enter.
$('#add-fact').addEventListener('submit', (e) => {
  e.preventDefault();
  const kind = $('#kind').value;
  const fact = { id: nextFactId(state.facts), kind };
  for (const [name, value] of new FormData(e.target)) fact[name] = String(value).trim();
  const problems = validateFact(fact);
  const err = $('#add-error');
  if (problems.length) {
    err.textContent = problems.join('. ') + '.';
    err.hidden = false;
    return;
  }
  err.hidden = true;
  state.facts.push(fact);
  save();
  render();
  $('#kind').value = kind;
  renderFields();
});

// "Check narrative" runs the checker. Typing in the box only saves the text;
// it doesn't re-check until the button is pressed.
$('#check').addEventListener('click', runCheck);
$('#narrative').addEventListener('input', () => { state.narrative = $('#narrative').value; save(); });

// "Load sample call": replace the report with the made-up chest pain call in
// sample.js and check it straight away, so the planted mistakes show up.
$('#load-sample').addEventListener('click', () => {
  state = { facts: structuredClone(SAMPLE_FACTS), narrative: SAMPLE_NARRATIVE };
  save();
  render();
  runCheck();
});

// "Clear all": start an empty report and wipe the results.
$('#clear').addEventListener('click', () => {
  state = { facts: [], narrative: '' };
  save();
  render();
  $('#verdict').replaceChildren();
  $('#check-errors').replaceChildren();
  $('#check-warnings').replaceChildren();
});

// "Export JSON": download the facts and narrative as a file.
$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'chartcheck-report.json' });
  a.click();
  URL.revokeObjectURL(a.href);
});

// "Import JSON": load a file saved by Export, replacing the current report.
// A file without a list of facts is refused with a message.
$('#import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.facts)) throw new Error('no facts array');
    state = { facts: data.facts, narrative: data.narrative ?? '' };
    save();
    render();
  } catch (err) {
    $('#add-error').textContent = `Couldn't import that file: ${err.message}.`;
    $('#add-error').hidden = false;
  }
  e.target.value = '';
});

// Draw the page once on load, from whatever was saved last time.
render();
