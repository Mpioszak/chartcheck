# chartcheck

A patient care report tool where the narrative can't say anything the medic didn't enter.

The medic enters the call as discrete facts (vitals, meds, times, findings). The narrative is written from those facts, and every sentence has to name the facts it came from. The checker rejects any time, number or drug name that isn't in those facts, and the gap finder points out what a hospital, lawyer or insurer would find missing.

**Demo only.** Don't enter real patient information. Everything stays in the browser's local storage; nothing is sent anywhere.

## Try it

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
| `src/gaps.js` | Finds what's missing or inconsistent in the facts. |
| `src/drugs.js` | Drug names and brand names to watch for, mapped to one canonical name. |
| `src/sample.js` | The made-up chest pain call. |
| `src/app.js` | The page: form, fact list, findings. |

### The narrative format

Each sentence ends with a source tag listing the ids of the facts it came from:

```
Initial vitals were BP 158/94, HR 104 and SpO2 93%. [f8, f9, f10]
```

A tag covers all text since the previous tag. The checker then:

- **Rejects** text with no tag, tags that cite facts that don't exist, and any time, number or drug name that isn't in the *cited* facts. A real number cited from the wrong fact is still rejected, and the message says where it was actually entered.
- **Warns** when a cited vital's value never appears (usually a swapped reading), when a number is spelled out ("two") because words can't be checked, and when an entered fact is never cited.

Brand and generic names count as the same drug (Narcan and naloxone). Times can be written `14:32` or `1432`.

### Gap rules

- A med with no recorded response, or no vitals after it.
- A response timed before its med.
- Call times out of order (dispatched, en route, on scene, patient contact, departed, at destination, transferred). Calls that cross midnight are handled.
- A transport with no medical-necessity statement, or a very short one.
- Only one set of vitals on a transported patient.
- Missing patient age and sex, dispatch reason or findings, and any fact with a missing required field or a bad time.

### What it doesn't catch yet

- **Invented words inside a tagged sentence.** Only times, numbers and drug names are checked. A sentence citing the findings could still add "alert and oriented" when nobody entered mental status. This is the next thing to close.
- Routes and units aren't compared ("IV" vs "IM", "mg" vs "mcg").
- Drugs not in `src/drugs.js` and not entered by the medic won't be recognised as drugs.

## Next

1. Generate the narrative with Claude, prompted to tag every sentence, and run it through the checker before showing it. For the prototype the user pastes their own API key, which is called from the browser and kept in local storage. Before anyone else uses it, move the key behind a small proxy.
2. Check the words of each sentence against its cited facts, not just the numbers.
3. Edit facts in place, and add gap rules that match your protocols.
