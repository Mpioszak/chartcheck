# chartcheck

A patient care report tool where the narrative can't say anything the medic didn't enter.

The medic enters the call as discrete facts (vitals, meds, times, findings). The narrative is written from those facts as ordinary sentences. The checker matches each sentence to the facts it came from, labels it with their ids, and flags any sentence with a time, number or drug name that isn't in those facts, or with nothing in it that matches. The gap finder points out what a hospital, lawyer or insurer would find missing.

**Demo only.** Don't enter real patient information. Everything stays in the browser's local storage; nothing is sent anywhere.

## Try it

https://mpioszak.github.io/chartcheck/
Open the page and click **Load sample call**. It loads one of six made-up calls at random (chest pain, low blood sugar, asthma, opioid overdose, a fall with a hip injury, and a possible stroke), and clicking again loads a different one. Each has planted mistakes: the narrative gets a value wrong or adds one nobody entered (a wrong blood pressure, a drug never given, mcg written for mg, a wrong time), and the facts leave something out or out of order (no response to a drug, no medical-necessity statement, a departure timed before patient contact). All of them get caught. The planted mistakes are listed above each call in `src/sample.js`.

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
| `src/checker.js` | Matches each sentence of a narrative to the facts it came from, and flags the ones that don't match. |
| `src/claims.js` | Reads text into claims: a reading tied to its vital, a dose to its drug and unit, a time to its event. |
| `src/gaps.js` | Finds what's missing or inconsistent in the facts. |
| `src/drugs.js` | Drug names and brand names to watch for, mapped to one canonical name. |
| `src/sample.js` | The made-up sample calls, with their planted mistakes. |
| `src/app.js` | The page: form, fact list with edit and delete, findings. |

### The narrative format

Write ordinary sentences. Nobody has to label them:

```
Initial vitals were BP 158/94, HR 104 and SpO2 93%.
```

The checker splits the narrative into sentences, reads each value together with what it's written next to, and looks for an entered fact that says the same thing about the same subject. The page lists every sentence with the ids of the facts it matched (`f8 f9 f10` above), and lists flagged sentences separately with the reason. A sentence is **flagged** when:

- Nothing in it matches an entered fact ("Patient was alert and oriented.").
- A reading doesn't match any entered reading of the vital it's labelled as. `BP 104/93, HR 158` fails even when 104 and 158 were both entered somewhere, and `158/94` is one value, so half of it can't be reused.
- A dose doesn't match an entered dose of its drug in the same unit, or a route doesn't match its drug's route. `0.4 mcg` fails against `0.4 mg`, and so does `0.4` with no unit.
- A time doesn't match the entered time of the vital, drug, call milestone or chief complaint it's written with ("chief complaint", "complaining of", "c/o" tie a time to the chief complaint).
- Values written together only match when taken from different entries. `BP 158/94 at 14:30` fails when 158/94 was taken at 14:15 and a different BP at 14:30, and `fentanyl 50 mcg IV` fails when 50 mcg was given IN and a later 25 mcg IV.
- A drug, or a number not tied to anything, isn't in the entered facts.

Sentences with no values ("A 12-lead ECG showed ST elevation in II, III and aVF.") are matched by wording against facts entered as free text: chief complaint, findings, procedures, transport, dispatch reason, responses, patient notes and the necessity statement. Those labels are drawn dashed, because the words themselves aren't verified. Vitals, meds and call times are never matched by wording, so "Blood pressure was stable." is flagged rather than matched to a BP entry.

It **warns** when a number is spelled out ("two") because words can't be checked, when an entered fact matches no sentence, and when a med is mentioned but never stated with its dose, unit and route. Old-style tags like `[f3, f8]` are ignored, with a warning.

A value belongs to the nearest label before it in the same clause. Clauses split at commas, semicolons, colons, brackets, "and", "then", "but" and "while". The words it recognises as labels, units, routes and call milestones are listed in `src/claims.js`. Brand and generic names count as the same drug (Narcan and naloxone). Readings can be written `158/94`, `158 / 94` or `158 over 94`, and times `14:32`, `at 1432` or `1432 hrs`. Sentences end at `.`, `!`, `?` or a line break, but not after abbreviations like `St.` or inside numbers like `0.4`.

### Editing and deleting facts

Each row in the facts table has **Edit** and **Delete**. Edit loads the fact back into the form; its kind is fixed, and **Save changes** replaces it in place with the same id. Ids are never reused: delete f6 and the next fact added is f7, so a label like `f6` in an old export or a screenshot never ends up meaning a different entry. After any edit or delete, the gap list updates, and if narrative check results are showing they are rerun against the changed facts.

Deleting a med that has a recorded response asks first. The response is kept and flagged in the gap list until it is pointed at another med or deleted.

### Gap rules

- A med with no recorded response, or no vitals after it.
- A response timed before its med.
- Call times out of order (dispatched, en route, on scene, patient contact, departed, at destination, transferred), including any before dispatch. Calls that cross midnight are handled: a time up to 12 hours after dispatch counts as later, and anything more counts as earlier.
- Any other fact timed before dispatch. This is a warning, because a med the patient took before EMS arrived is possible.
- A chief complaint timed before patient contact. Also a warning, since the time may be when the complaint began.
- A transport with no medical-necessity statement, or a very short one.
- Only one set of vitals on a transported patient.
- Missing patient age and sex, dispatch reason, chief complaint or findings, and any fact with a missing required field or a bad time.

### What it doesn't catch yet

- **Invented words inside a matched sentence.** Only values and drug names are checked. A sentence that matches the findings could still add "alert and oriented" when nobody entered mental status. This is the next thing to close.
- A time in a clause that names no vital, drug, milestone or chief complaint (`At 14:20, ...`) is only checked against the times of all entered facts, not tied to one event.
- Two values of the same vital in one clause with two times (`pain 8/10 at 14:13 to 5/10 at 14:25`) are each checked against an entry at one of those times, so swapping the two times isn't caught.
- Wording matches can be loose: a sentence that shares a few words with a free-text fact is labelled with it.
- Drugs not in `src/drugs.js` and not entered by the medic won't be recognised as drugs.

## Next

1. Generate the narrative with Claude and run it through the checker before showing it. For the prototype the user pastes their own API key, which is called from the browser and kept in local storage. Before anyone else uses it, move the key behind a small proxy.
2. Check the words of each sentence against its matched facts, not just the numbers.
3. Add gap rules that match your protocols.
