import { KINDS, MILESTONES, MILESTONE_LABELS, VITAL_TYPES, VITAL_LABELS, ROUTES, factText, nextFactId, validateFact } from './schema.js';
import { checkNarrative } from './checker.js';
import { findGaps } from './gaps.js';
import { SAMPLE_FACTS, SAMPLE_NARRATIVE } from './sample.js';

const STORAGE_KEY = 'chartcheck:v1';
const $ = (sel) => document.querySelector(sel);

let state = load();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.facts)) return { facts: saved.facts, narrative: saved.narrative ?? '' };
  } catch { /* storage unavailable or corrupt */ }
  return { facts: [], narrative: '' };
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

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

function options(values, labels = {}) {
  return values.map((v) => el('option', { value: v }, labels[v] ?? v));
}

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

function renderFields() {
  const spec = KINDS[$('#kind').value];
  const box = $('#fields');
  box.replaceChildren();
  for (const [name, [label, type, required]] of Object.entries(spec.fields)) {
    box.append(el('label', {}, `${label}${required ? '' : ' (optional)'} `, fieldInput(name, type)));
  }
}

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

function renderFindings(list, items, cls) {
  list.replaceChildren(...items.map((item) => el('li', { class: cls ?? item.severity },
    item.text ? el('q', {}, item.text) : '', item.text ? ' ' : '', item.message)));
}

function renderGaps() {
  const gaps = findGaps(state.facts);
  const list = $('#gaps');
  if (!state.facts.length) list.replaceChildren(el('li', { class: 'muted' }, 'Add facts to see what is missing.'));
  else if (!gaps.length) list.replaceChildren(el('li', { class: 'ok' }, 'Nothing missing that these rules know to look for.'));
  else renderFindings(list, gaps);
}

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

function render() {
  renderFacts();
  renderGaps();
  $('#narrative').value = state.narrative;
  renderFields();
}

function removeFact(id) {
  state.facts = state.facts.filter((f) => f.id !== id);
  save();
  render();
}

$('#kind').append(...Object.entries(KINDS).map(([k, spec]) => el('option', { value: k }, spec.label)));
$('#kind').addEventListener('change', renderFields);

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

$('#check').addEventListener('click', runCheck);
$('#narrative').addEventListener('input', () => { state.narrative = $('#narrative').value; save(); });

$('#load-sample').addEventListener('click', () => {
  state = { facts: structuredClone(SAMPLE_FACTS), narrative: SAMPLE_NARRATIVE };
  save();
  render();
  runCheck();
});

$('#clear').addEventListener('click', () => {
  state = { facts: [], narrative: '' };
  save();
  render();
  $('#verdict').replaceChildren();
  $('#check-errors').replaceChildren();
  $('#check-warnings').replaceChildren();
});

$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'chartcheck-report.json' });
  a.click();
  URL.revokeObjectURL(a.href);
});

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

render();
