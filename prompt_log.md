# Prompt iteration log

Evidence for the prompt design section of `REPORT.md`.

## Method

Five test titles, each chosen to test a distinct failure mode, held constant
across all three versions:

| # | Title | Role |
|---|---|---|
| 1 | I Tried EVERY Fast Food Breakfast So You NEVER Have To 🤯 | extreme clickbait (English) |
| 2 | The real reason your phone battery dies so fast | moderate curiosity gap |
| 3 | How to change a bike tire in 5 minutes | **negative control** — already plain, must survive |
| 4 | Bunu bilmeden telefonunuzu şarj etmeyin! | Turkish clickbait |
| 5 | Health ministry warns of heat wave, advises avoiding outdoor work between 11:00 and 16:00 | **safety control** — genuine urgency, must not be flattened |

Each version was run **in a separate conversation** so that context from an
earlier run could not improve a later one. Same model throughout.

---

## v1 — zero-shot

Prompt:

```
Rewrite this clickbait title to be boring and not emotional.
```

Output:

```
1. A review of various fast-food breakfast options
2. Common causes of smartphone battery drain
3. Instructions for replacing a bicycle tire
4. General information on smartphone charging practices
5. Ministry of Health advisory regarding high temperatures and outdoor work hours
```

**3 / 8.** Not JSON. The negative control was rewritten. The Turkish title came
back in English. Most seriously, the safety headline lost `11:00–16:00` — the
only actionable information it contained.

---

## v2 — structured step-by-step

The three operations, the hard rules, the tactic vocabulary, the 1–5 scale and
the JSON schema. No examples.

Output:

```json
[
 {"id":"1","boring":"A review of various fast food breakfast options.","tactic":"superlative","bait":5},
 {"id":"2","boring":"Common causes of rapid smartphone battery drain.","tactic":"curiosity-gap","bait":4},
 {"id":"3","boring":"How to change a bike tire in 5 minutes.","tactic":"none","bait":1},
 {"id":"4","boring":"Telefon şarj ederken dikkat edilmesi gerekenler.","tactic":"curiosity-gap","bait":5},
 {"id":"5","boring":"Health ministry heat wave warning: avoid outdoor work between 11:00 and 16:00.","tactic":"none","bait":1}
]
```

**8 / 8.** Every check passed. We had expected the negative control to still be
over-rewritten here; it was not.

---

## v3 — v2 plus few-shot

v2 with four worked examples appended, including a negative control returning
unchanged and a Turkish pair.

Output:

```json
[
 {"id":"1","boring":"Review and comparison of multiple fast food breakfast items","tactic":"superlative","bait":5},
 {"id":"2","boring":"Explanation of why phone batteries drain quickly","tactic":"curiosity-gap","bait":4},
 {"id":"3","boring":"How to change a bike tire in 5 minutes","tactic":"none","bait":1},
 {"id":"4","boring":"Telefon şarj ederken dikkat edilmesi gereken noktalar","tactic":"false-urgency","bait":5},
 {"id":"5","boring":"Health ministry warns of heat wave, advises avoiding outdoor work between 11:00 and 16:00","tactic":"none","bait":1}
]
```

**7 / 8.** The only failure is the word cap, and it is the correct failure — see
finding 3.

---

## Scores

| Check | v1 | v2 | v3 |
|---|:--:|:--:|:--:|
| Output is valid, parseable JSON | ✗ | ✓ | ✓ |
| Negative control returned unchanged | ✗ | ✓ | ✓ |
| Safety control kept its urgency | ✗ | ✓ | ✓ |
| Turkish title answered in Turkish | ✗ | ✓ | ✓ |
| No invented facts | ✓ | ✓ | ✓ |
| No sarcasm or knowing tone | ✓ | ✓ | ✓ |
| Within the word cap | ✓\* | ✓ | ✗ |
| Actionable detail preserved | ✗ | ✓ | ✓ |
| **Total** | **3 / 8** | **8 / 8** | **7 / 8** |

\* v1 contained no word cap, so this row records observed consistency rather
than compliance with an instruction.

---

## Findings

**1. Structured instruction did most of the work.** We predicted v2 would keep
over-rewriting the already-plain title. It did not — v2 scored 8/8. Rules and a
fixed output schema were sufficient to reach correct behaviour on every check.

**2. Examples changed how *completely* a protective rule was obeyed.**

| | Negative control (3) | Safety control (5) |
|---|---|---|
| v2 | returned with an added full stop | rephrased, compressed to exactly 12 words |
| v3 | returned byte-for-byte identical | returned byte-for-byte identical |

v2 read "leave it unchanged" as *rewrite it minimally*; v3 read it as *return it
verbatim*. For a rule protecting someone else's words, that is the whole point.

**3. A rule conflict, resolved correctly by the safer version.** v3's heat-wave
output is 14 words against a 12-word cap. Two of our rules collide: *never
flatten genuine safety urgency* versus *twelve words maximum*. v2 obeyed the cap
and compressed the warning; v3 broke the cap and kept it intact. v3 chose
correctly and we shipped it. We have since added an explicit precedence clause
to the prompt so the resolution is designed rather than incidental.

**4. Few-shot examples carry their own bias.** The Turkish title's tactic moved
from `curiosity-gap` (v2) to `false-urgency` (v3). We judge v2 more accurate:
the title withholds *what* the reader needs to know, which is a curiosity gap.
Our example set contains a Turkish imperative labelled `fear`, which appears to
have pulled a structurally similar Turkish imperative toward the urgency family.
Examples improve consistency and transfer their own assumptions at the same
time.

## Shipped

v3, with the precedence clause from finding 3 added. It is `PROMPT_DEBAIT` in
`index.html`.
