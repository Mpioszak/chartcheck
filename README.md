# chartcheck

A patient care report tool where the narrative can't say anything the medic didn't enter.

The medic enters the call as discrete facts (vitals, meds, times, findings). The narrative is written from those facts, and every sentence has to name the facts it came from. The checker rejects any time, number or drug name that isn't in those facts, and the gap finder points out what a hospital, lawyer or insurer would find missing.

**Demo only.** Don't enter real patient information. Everything stays in the browser's local storage; nothing is sent anywhere.

## Try it

https://mpioszak.github.io/chartcheck/
Open the page and click **Load sample call**. The sample narrative has two planted mistakes (a repeat blood pressure nobody took and a drug that was never given) and the sample facts leave out the response to aspirin. All three get caught.

## Run locally

The page uses ES modules, which browsers won't load from `file://`, so serve the folder:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Tests need Node 22 and no dependencies:

```sh
npm test
```

## Publish on GitHub Pages

Settings → Pages → Build and deployment → Deploy from a branch → `main`, `/ (root)`. There's no build step.

Pages on a private repository needs a paid GitHub plan. On the free plan, make the repository public first. It contains no patient data, only the made-up sample.

## How it works

| File | What it does |
| --- | --- |
| `src/schema.js` | The fact format: kinds, fields, which are required, and validation. |
| `src/checker.js` | Checks a narrative against the facts it cites. |
| `src/claims.js` | Reads text into claims: a reading tied to its vital, a dose to its drug and unit, a time to its event. |
| `src/gaps.js` | Finds what's missing or inconsistent in the facts. |
| `src/drugs.js` | Drug names and brand names to watch for, mapped to one canonical name. |
| `src/sample.js` | The made-up chest pain call. |
| `src/app.js` | The page: form, fact list, findings. |

### The narrative format

Each sentence ends with a source tag listing the ids of the facts it came from:

```
Initial vitals were BP 158/94, HR 104 and SpO2 93%. [f8, f9, f10]
```

A tag covers all text since the previous tag. The checker reads each value together with what it's written next to and compares it with the cited fact of the same kind. It **rejects**:

- Text with no tag, and tags that cite facts that don't exist.
- A reading that doesn't match the cited reading of the vital it's labelled as. `BP 104/93, HR 158` fails even when 104 and 158 were both entered somewhere, and `158/94` is one value, so half of it can't be reused.
- A dose that doesn't match its drug's cited dose and unit, or a route that doesn't match its drug's cited route. `0.4 mcg` fails against `0.4 mg`, and so does `0.4` with no unit.
- A time that doesn't match the cited time of the vital, drug or call milestone it's written with.
- A cited vital whose reading is never stated, so a reading can't be quietly swapped out.
- A drug name, or a number not tied to anything, that isn't in the cited facts. A real value cited from the wrong fact is still rejected, and the message says where it was entered.

It **warns** when a number is spelled out ("two") because words can't be checked, when an entered fact is never cited, and when a cited med is never stated with its dose, unit and route.

A value belongs to the nearest label before it in the same clause. Clauses split at commas, semicolons, colons, "and", "then", "but" and "while". The words it recognises as labels, units, routes and call milestones are listed in `src/claims.js`. Brand and generic names count as the same drug (Narcan and naloxone). Readings can be written `158/94`, `158 / 94` or `158 over 94`, and times `14:32`, `at 1432` or `1432 hrs`.

### Gap rules

- A med with no recorded response, or no vitals after it.
- A response timed before its med.
- Call times out of order (dispatched, en route, on scene, patient contact, departed, at destination, transferred), including any before dispatch. Calls that cross midnight are handled: a time up to 12 hours after dispatch counts as later, and anything more counts as earlier.
- Any other fact timed before dispatch. This is a warning, because a med the patient took before EMS arrived is possible.
- A transport with no medical-necessity statement, or a very short one.
- Only one set of vitals on a transported patient.
- Missing patient age and sex, dispatch reason or findings, and any fact with a missing required field or a bad time.

### What it doesn't catch yet

- **Invented words inside a tagged sentence.** Only values and drug names are checked. A sentence citing the findings could still add "alert and oriented" when nobody entered mental status. This is the next thing to close.
- A time in a clause that names no vital, drug or milestone (`At 14:20, ...`) is only checked against the cited facts' times, not tied to one event.
- Drugs not in `src/drugs.js` and not entered by the medic won't be recognised as drugs.

## Next

1. Generate the narrative with Claude, prompted to tag every sentence, and run it through the checker before showing it. For the prototype the user pastes their own API key, which is called from the browser and kept in local storage. Before anyone else uses it, move the key behind a small proxy.
2. Check the words of each sentence against its cited facts, not just the numbers.
3. Edit facts in place, and add gap rules that match your protocols.
