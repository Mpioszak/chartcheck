// The page itself. This file wires the three sections of index.html to the
// logic in the other modules:
//
//   1. Facts            a form for entering facts, and a table listing them
//                       with an Edit and a Delete button on each row
//   2. What's missing   the gap finder's results (gaps.js), refreshed on every change
//   3. Narrative check  a text box for the narrative, and each sentence with the
//                       facts it was matched to, or why it was flagged (checker.js)
//
// Nothing is sent anywhere. The facts and narrative are kept in the browser's
// local storage so a page reload doesn't lose them, and can be exported to or
// imported from a JSON file.
//
// Fact ids never change and are never reused (see nextFactId in schema.js), so
// a label like "f12" always means the same entry. After a fact is edited or
// deleted, the gap finder reruns, and so does the narrative check if its
// results are on screen, so no label is left pointing at an old version.

import { KINDS, MILESTONES, MILESTONE_LABELS, VITAL_TYPES, VITAL_LABELS, ROUTES, dependentsOf, factText, idNumber, nextFactId, validateFact } from './schema.js';
import { checkNarrative } from './checker.js';
import { findGaps } from './gaps.js';
import { SAMPLE_CALLS, randomSampleIndex } from './sample.js';

const STORAGE_KEY = 'chartcheck:v1';
// Shorthand for finding one element on the page, e.g. $('#narrative').
const $ = (sel) => document.querySelector(sel);

// Everything the page saves: the list of facts, the narrative text, and the
// highest fact id number handed out so far (so deleted ids aren't reused).
let state = load();

// The id of the fact being edited in the form, or null when the form is
// adding a new fact.
let editingId = null;

// Whether the narrative check's results are on screen, so they can be
// refreshed when the facts change.
let checkShown = false;

// ---- Saving and loading ----

// Reads the last saved report from local storage. Falls back to an empty
// report if nothing is saved or the saved copy can't be read.

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.facts)) return report(saved);
  } catch { /* storage unavailable or corrupt */ }
  return report({});
}

// A report in the shape the page keeps, from a saved or imported copy. Older
// copies have no lastId, so it starts from the highest id in their facts.
function report({ facts = [], narrative = '', lastId = 0 }) {
  return { facts, narrative, lastId: Math.max(Number(lastId) || 0, ...facts.map((f) => idNumber(f.id))) };
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

// Builds the input box for one field of the fact form, filled in with value
// when editing. The type comes from the field list in schema.js: times get a
// text box that expects HH:MM, fixed lists (milestones, vital types, routes)
// get a dropdown, and "medref" gets a dropdown of the medications already
// entered, so a response can say which med it was a response to.
function fieldInput(name, type, value) {
  const input = blankInput(name, type, value);
  if (value != null) input.value = value;
  return input;
}

function blankInput(name, type, value) {
  switch (type) {
    case 'time': return el('input', { name, type: 'text', placeholder: 'HH:MM', pattern: '([01]?\\d|2[0-3]):[0-5]\\d', inputmode: 'numeric' });
    case 'milestone': return el('select', { name }, ...options(MILESTONES, MILESTONE_LABELS));
    case 'vitaltype': return el('select', { name }, ...options(VITAL_TYPES, VITAL_LABELS));
    case 'route': return el('select', { name }, ...options(ROUTES));
    case 'medref': {
      const meds = state.facts.filter((f) => f.kind === 'med');
      const select = el('select', { name }, ...meds.map((m) => el('option', { value: m.id }, `${m.id}: ${m.drug} ${m.time}`)));
      // A response being edited whose med was deleted keeps pointing at it
      // until the medic picks another, rather than silently switching to
      // whichever med is listed first.
      if (value && !meds.some((m) => m.id === value)) select.append(el('option', { value }, `${value}: not an entered medication`));
      return select;
    }
    default: return el('input', { name, type: 'text' });
  }
}

// ---- Drawing each section ----

// Redraws the form fields for whichever kind of fact is picked in the
// "Kind" dropdown (a vital needs time, type and value; a med needs drug,
// dose, unit and route; and so on). When a fact is being edited, the form
// shows that fact's kind and values, the kind can't be changed, and the
// buttons read "Save changes" and "Cancel".
function renderFields() {
  const editing = state.facts.find((f) => f.id === editingId);
  if (editing) $('#kind').value = editing.kind;
  $('#kind').disabled = Boolean(editing);
  $('#submit-fact').textContent = editing ? `Save changes to ${editing.id}` : 'Add fact';
  $('#cancel-edit').hidden = !editing;
  const spec = KINDS[$('#kind').value];
  const box = $('#fields');
  box.replaceChildren();
  for (const [name, [label, type, required]] of Object.entries(spec.fields)) {
    box.append(el('label', {}, `${label}${required ? '' : ' (optional)'} `, fieldInput(name, type, editing?.[name])));
  }
}

// Redraws the table of entered facts. A fact with a problem (a missing
// required field, a bad time) is highlighted, with the problem shown on hover.
// The row being edited is highlighted too.
function renderFacts() {
  const body = $('#facts tbody');
  body.replaceChildren();
  for (const f of state.facts) {
    const { time, ...rest } = f;
    const problems = validateFact(f);
    const cls = [problems.length ? 'invalid' : '', f.id === editingId ? 'editing' : ''].filter(Boolean).join(' ');
    body.append(el('tr', { class: cls, ...(problems.length ? { title: problems.join('; ') } : {}) },
      el('td', {}, f.id),
      el('td', {}, KINDS[f.kind]?.label ?? f.kind),
      el('td', {}, time ?? ''),
      el('td', {}, factText(rest) + (f.to ? ` (re ${f.to})` : '')),
      el('td', { class: 'actions' },
        el('button', { class: 'small', type: 'button', onclick: () => editFact(f.id) }, 'Edit'),
        el('button', { class: 'small danger', type: 'button', onclick: () => removeFact(f.id) }, 'Delete')),
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

// Runs the fact checker on the narrative and shows each sentence with the
// facts it was matched to. Sentences that match nothing, or say something the
// facts don't support, are listed separately with the reason.
function runCheck() {
  checkShown = true;
  state.narrative = $('#narrative').value;
  save();
  const result = checkNarrative(state.facts, state.narrative);
  const matched = result.sentences.filter((s) => s.ok);
  const flagged = result.sentences.filter((s) => !s.ok);
  const total = result.sentences.length;
  $('#verdict').replaceChildren(!total ? '' : flagged.length
    ? el('p', { class: 'error' }, `${flagged.length} of ${total} sentence${total === 1 ? '' : 's'} flagged.`)
    : el('p', { class: 'ok' }, `All ${total} sentence${total === 1 ? '' : 's'} matched to entered facts.`));
  renderSentences($('#flagged'), flagged, 'Flagged sentences');
  renderSentences($('#matched'), matched, 'Matched sentences');
  renderFindings($('#check-warnings'), result.warnings, 'warning');
}

// One fact id as a small label, with the fact itself shown on hover. A fact
// matched only by wording is drawn dashed, since its words aren't verified.
function factChip(id, wordOnly) {
  const fact = state.facts.find((f) => f.id === id);
  return el('span', {
    class: wordOnly ? 'chip words' : 'chip',
    title: (fact ? factText(fact) : id) + (wordOnly ? ' (matched by wording)' : ''),
  }, id);
}

// Fills one of the two sentence lists: the sentence, its fact labels, and
// for a flagged sentence what's wrong with it.
function renderSentences(box, sentences, heading) {
  if (!sentences.length) return box.replaceChildren();
  box.replaceChildren(
    el('h3', {}, `${heading} (${sentences.length})`),
    el('ul', { class: 'findings' }, ...sentences.map((s) => el('li', { class: s.ok ? 'ok' : 'error' },
      el('span', { class: 'sentence' }, s.text),
      el('span', { class: 'chips' }, ...(s.ids.length
        ? s.ids.map((id) => factChip(id, s.wordOnly.includes(id)))
        : [el('span', { class: 'chip none' }, 'no fact found')])),
      ...s.problems.map((p) => el('div', { class: 'problem' }, p)),
    ))),
  );
}

// Redraws everything that depends on the facts. If the narrative check's
// results are showing, they are rerun so their labels match the facts.
function render() {
  if (editingId && !state.facts.some((f) => f.id === editingId)) editingId = null;
  renderFacts();
  renderGaps();
  $('#narrative').value = state.narrative;
  renderFields();
  if (checkShown) runCheck();
}

// Shows a problem with the form (or with an imported file) under the form.
// Called with nothing, hides it.
function showError(message) {
  const err = $('#add-error');
  err.textContent = message ?? '';
  err.hidden = !message;
}

// Loads one fact into the form for editing (the Edit button in its row).
function editFact(id) {
  editingId = id;
  showError();
  render();
  $('#fields input, #fields select')?.focus();
}

// Leaves editing without saving, and puts the form back to adding.
function cancelEdit() {
  editingId = null;
  showError();
  render();
}

// Deletes one fact (the Delete button in its table row). Responses point at
// their med by id, so deleting a med that has responses asks first; the
// responses are kept, and the gap finder flags them until they're fixed.
function removeFact(id) {
  const deps = dependentsOf(state.facts, id);
  if (deps.length && !window.confirm(
    `${deps.map((d) => d.id).join(', ')} ${deps.length === 1 ? 'is a response' : 'are responses'} to ${id}. `
    + `Delete ${id} anyway? ${deps.length === 1 ? 'That response' : 'Those responses'} will be flagged until you point ${deps.length === 1 ? 'it' : 'them'} at another med or delete ${deps.length === 1 ? 'it' : 'them'}.`)) return;
  state.facts = state.facts.filter((f) => f.id !== id);
  save();
  render();
}

// ---- Wiring up the buttons and the form ----

// Fill the "Kind" dropdown with every kind of fact, and redraw the form
// fields when a different kind is picked.
$('#kind').append(...Object.entries(KINDS).map(([k, spec]) => el('option', { value: k }, spec.label)));
$('#kind').addEventListener('change', renderFields);

// "Add fact" / "Save changes": collect the form's values into a fact. When
// adding, it gets the next unused id (f1, f2, ...) and goes on the end of the
// list. When editing, it keeps its id and its place in the list, and replaces
// the old version entirely. Either way, if a required field is missing or a
// time is malformed, show why and change nothing. After adding, the same kind
// stays selected so several vitals in a row are quick to enter.
$('#add-fact').addEventListener('submit', (e) => {
  e.preventDefault();
  const kind = $('#kind').value;
  const id = editingId ?? nextFactId(state.facts, state.lastId);
  const fact = { id, kind };
  for (const [name, value] of new FormData(e.target)) fact[name] = String(value).trim();
  const problems = validateFact(fact);
  if (problems.length) return showError(problems.join('. ') + '.');
  showError();
  if (editingId) {
    state.facts = state.facts.map((f) => (f.id === id ? fact : f));
    editingId = null;
  } else {
    state.facts.push(fact);
    state.lastId = idNumber(id);
  }
  save();
  render();
});

// "Cancel" (shown only while editing) drops the changes in the form.
$('#cancel-edit').addEventListener('click', cancelEdit);

// "Check narrative" runs the checker. Typing in the box only saves the text;
// it doesn't re-check until the button is pressed.
$('#check').addEventListener('click', runCheck);
$('#narrative').addEventListener('input', () => { state.narrative = $('#narrative').value; save(); });

// "Load sample call": replace the report with one of the made-up calls in
// sample.js, picked at random, and check it straight away, so the planted
// mistakes show up. A sample whose narrative is already in the box isn't
// picked again, so each click shows a different call.
$('#load-sample').addEventListener('click', () => {
  const current = SAMPLE_CALLS.findIndex((c) => c.narrative === state.narrative);
  const sample = SAMPLE_CALLS[randomSampleIndex(current)];
  state = report({ facts: structuredClone(sample.facts), narrative: sample.narrative });
  editingId = null;
  save();
  render();
  runCheck();
});

// "Clear all": start an empty report and wipe the results. A new report
// starts again from f1.
$('#clear').addEventListener('click', () => {
  state = report({});
  editingId = null;
  checkShown = false;
  showError();
  save();
  render();
  for (const id of ['#verdict', '#flagged', '#matched', '#check-warnings']) $(id).replaceChildren();
});

// "Export JSON": download the facts, narrative and last id as a file.
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
    state = report(data);
    editingId = null;
    showError();
    save();
    render();
  } catch (err) {
    showError(`Couldn't import that file: ${err.message}.`);
  }
  e.target.value = '';
});

// Draw the page once on load, from whatever was saved last time.
render();
