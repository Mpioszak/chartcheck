// Drug names the checker looks for in a narrative, mapped to a canonical name
// so "Narcan" and "naloxone" count as the same drug. Any drug the medic enters
// is also searched for, so this list only has to cover drugs that might be
// invented. Extend it to match your protocols.
export const DRUG_ALIASES = {
  acetaminophen: 'acetaminophen', tylenol: 'acetaminophen',
  adenosine: 'adenosine', adenocard: 'adenosine',
  albuterol: 'albuterol', proventil: 'albuterol', ventolin: 'albuterol',
  amiodarone: 'amiodarone', cordarone: 'amiodarone',
  aspirin: 'aspirin', asa: 'aspirin',
  atropine: 'atropine',
  'calcium chloride': 'calcium chloride', 'calcium gluconate': 'calcium gluconate',
  d10: 'dextrose', d50: 'dextrose', dextrose: 'dextrose',
  diazepam: 'diazepam', valium: 'diazepam',
  diltiazem: 'diltiazem', cardizem: 'diltiazem',
  diphenhydramine: 'diphenhydramine', benadryl: 'diphenhydramine',
  dopamine: 'dopamine',
  droperidol: 'droperidol',
  duoneb: 'duoneb',
  epinephrine: 'epinephrine', epi: 'epinephrine', adrenaline: 'epinephrine',
  etomidate: 'etomidate', amidate: 'etomidate',
  fentanyl: 'fentanyl', sublimaze: 'fentanyl',
  furosemide: 'furosemide', lasix: 'furosemide',
  glucagon: 'glucagon',
  'oral glucose': 'oral glucose',
  haloperidol: 'haloperidol', haldol: 'haloperidol',
  hydromorphone: 'hydromorphone', dilaudid: 'hydromorphone',
  ibuprofen: 'ibuprofen', motrin: 'ibuprofen',
  ipratropium: 'ipratropium', atrovent: 'ipratropium',
  ketamine: 'ketamine', ketalar: 'ketamine',
  ketorolac: 'ketorolac', toradol: 'ketorolac',
  labetalol: 'labetalol',
  'lactated ringers': 'lactated ringers', "lactated ringer's": 'lactated ringers',
  lidocaine: 'lidocaine',
  lorazepam: 'lorazepam', ativan: 'lorazepam',
  'magnesium sulfate': 'magnesium sulfate', magnesium: 'magnesium sulfate',
  methylprednisolone: 'methylprednisolone', 'solu-medrol': 'methylprednisolone',
  metoprolol: 'metoprolol', lopressor: 'metoprolol',
  midazolam: 'midazolam', versed: 'midazolam',
  morphine: 'morphine',
  naloxone: 'naloxone', narcan: 'naloxone',
  nitroglycerin: 'nitroglycerin', nitro: 'nitroglycerin', ntg: 'nitroglycerin',
  'nitrous oxide': 'nitrous oxide',
  norepinephrine: 'norepinephrine', levophed: 'norepinephrine',
  'normal saline': 'normal saline',
  olanzapine: 'olanzapine', zyprexa: 'olanzapine',
  ondansetron: 'ondansetron', zofran: 'ondansetron',
  oxygen: 'oxygen',
  promethazine: 'promethazine', phenergan: 'promethazine',
  rocuronium: 'rocuronium',
  'sodium bicarbonate': 'sodium bicarbonate', bicarb: 'sodium bicarbonate',
  succinylcholine: 'succinylcholine', sux: 'succinylcholine',
  'tranexamic acid': 'tranexamic acid', txa: 'tranexamic acid',
};

export function canonicalDrug(name) {
  const key = String(name).trim().toLowerCase();
  return DRUG_ALIASES[key] ?? key;
}
