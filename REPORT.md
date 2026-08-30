# Boringifier — Hackathon Report

**Group 10** · Digital Addiction & Digital Well-Being · 30 August 2026
**Team:** Huzeyfe Hakan Sarıcaoğlu, Nehir Kazancı, Ramazan Bıyık, Damla Korkmaz, Asya Güney
**Model used:** Google Gemini (`gemini-2.5-flash`) via the `generateContent` API — the same model family the prompts were developed on
**Repository:** https://github.com/Neka67/boringifier

---

## 1. The problem

Compulsive feed use is not mainly driven by the quality of the content. It is driven by the **curiosity gap**: a title that withholds its own answer creates a tension the reader is motivated to resolve, and clicking resolves it. Recommendation feeds are optimised to generate that tension continuously, which is why people open an app intending to watch one thing and leave forty minutes later unable to say what they watched.

Our target user is that person — someone who does not want to quit a platform, but who wants to stop being pulled through it. We chose to intervene at the moment of temptation rather than reporting on it afterwards.

**What our tool does, in one sentence:** Boringifier removes the manipulation from the titles in a feed and shows the user which persuasion tactics that feed was using on them.

## 2. Solution and the role of generative AI

Boringifier is a single-page web application with two modes.

**The Feed.** A feed of video titles is displayed as it normally appears. One toggle rewrites every title into a flat, factual version: the emotional framing is removed and, where the original withholds information, the rewrite states plainly what the content is about. Hovering any rewritten title restores the original word for word, together with the manipulation tactic identified and a 1–5 bait estimate. Users can also paste their own titles, so the tool works on any feed rather than a prepared sample.

**The Mirror.** A second view reports what the feed just did: how many titles were analysed, which tactics appeared and how often, and a short generated reflection on the pattern.

**Why generative AI is core rather than decorative.** Every function above is a judgement about meaning, not a text transformation. Deciding whether a title withholds its own answer, which persuasion tactic it uses, and what a neutral restatement of it would be cannot be done with keywords or regular expressions. Our own test data demonstrates this directly: *"Doctors HATE this one simple trick"* and *"Health ministry warns of heat wave, advises avoiding outdoor work between 11:00 and 16:00"* both contain urgent, emotionally charged language, but one is manipulation and one is public safety information. Distinguishing them requires a model. Remove the model and there is no product.

## 3. Prompt design

We wrote **two** system prompts and deliberately built them with **different techniques**, because they solve different kinds of problem.

| | Prompt A — the debaiter | Prompt B — the reflector |
|---|---|---|
| **Job** | Rewrite a title, classify its tactic, score it | Write a short reflection on a tally |
| **Techniques** | Structured step-by-step + few-shot + structured output (JSON) | Zero-shot + constraint-based (negative) prompting |
| **Why** | One narrow correct output form. Examples show the form faster than description can | Many acceptable answers, one unacceptable *tone*. Boundaries matter more than models to imitate |

Prompt A decomposes a vague instruction ("make it boring") into three checkable operations — close the gap, flatten the register, state the subject plainly — followed by hard rules, a fixed tactic vocabulary, a 1–5 scale, and a JSON schema the application validates before rendering.

Prompt B contains almost no positive instruction. It is mostly prohibitions: no second-person judgement, no vocabulary of blame ("addiction", "wasting", "should"), no estimate that was not directly counted, no clinical or diagnostic framing, no praise or encouragement. This is a deliberate design choice, not laziness — for a reflection shown to someone about their own behaviour, the risk is not a wrong answer but a harmful tone, and prohibitions constrain tone more reliably than examples do.

### 3.1 Iteration method

We fixed five test titles, each chosen to test a distinct failure mode, and held them constant across all versions:

1. Extreme clickbait (English) — *I Tried EVERY Fast Food Breakfast So You NEVER Have To 🤯*
2. Moderate curiosity gap — *The real reason your phone battery dies so fast*
3. **Negative control** — *How to change a bike tire in 5 minutes* (already plain; must survive unchanged)
4. Turkish clickbait — *Bunu bilmeden telefonunuzu şarj etmeyin!*
5. **Safety control** — *Health ministry warns of heat wave, advises avoiding outdoor work between 11:00 and 16:00*

Each prompt version was run **in a separate conversation** so that earlier context could not improve later versions, and all runs used the same model. Outputs were scored against eight checks.

### 3.2 Results

| Check | v1 zero-shot | v2 structured | v3 v2 + few-shot |
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

\* v1 contained no word cap, so this row records observed consistency rather than compliance with an instruction.

Full outputs for all three versions are in `prompt_log.md` in the repository.

### 3.3 What we found

**Finding 1 — Structured instruction did most of the work.** We expected the zero-shot version to fail and it did, on four checks. But we also expected the structured version to keep over-rewriting the already-plain title, and **it did not**. v2 scored 8/8. Explicit rules and a fixed output schema were sufficient to produce correct behaviour on every check; few-shot examples were not required to reach it.

**Finding 2 — Examples changed how *completely* a protective rule was obeyed.** Although v2 passed every check, comparing it with v3 on the two control titles shows a consistent difference:

| | Negative control (title 3) | Safety control (title 5) |
|---|---|---|
| **v2** | returned with an added full stop | rephrased and compressed to exactly 12 words |
| **v3** | returned byte-for-byte identical | returned byte-for-byte identical |

v2 interpreted "leave it unchanged" as *rewrite it minimally*. v3 interpreted it as *return it verbatim*. For a rule that exists to protect someone else's words, that distinction is the entire point, and it was the worked example — showing a plain title coming back untouched — that taught it.

**Finding 3 — A rule conflict, resolved correctly by the safer version.** v3's only failed check is the word cap: it returned the heat-wave warning at 14 words against a 12-word limit. This is where two of our own rules collide — *never flatten genuine safety urgency* versus *twelve words maximum*. v2 obeyed the length rule and compressed the warning; v3 broke the length rule to keep the warning intact. **v3 chose correctly**, and we kept it. A failed check here is the desired behaviour, and we have since made the precedence explicit in the prompt so the resolution is designed rather than incidental.

**Finding 4 — Few-shot examples carry their own bias.** The Turkish title's tactic changed from `curiosity-gap` (v2) to `false-urgency` (v3). We judge v2 to be more accurate: *"Bunu bilmeden telefonunuzu şarj etmeyin!"* withholds *what* the reader needs to know, which is a curiosity gap. Our example set contains a Turkish imperative labelled `fear`, and it appears to have pulled a structurally similar Turkish imperative toward the urgency family. Examples improve consistency and transfer their own assumptions at the same time — a trade-off we document rather than claim to have solved.

## 4. Challenges

- **Rule collisions are invisible until tested.** Our safety rule and our length rule contradicted each other and we only discovered it because the test set contained a real safety headline. [Add anything else your build hit here.]
- **Browser-to-API calls.** Calling the API directly from a static page requires an explicit browser-access header; without it the request fails as a CORS error that reads like a network fault.
- **Batching.** A feed contains 20–40 titles. Sending one request per title made the interface unusable; batching the whole feed into a single request with a JSON array response was necessary for the tool to feel instant.
- **Testing revealed cases we had not designed for.** [Insert the failure log from your 20-title test run — real examples are stronger than this placeholder.]

## 5. Ethical evaluation

| Risk | How we reduced it |
|---|---|
| **Misrepresenting creators.** We display a rewrite of someone else's words; a wrong rewrite attributes meaning to a person who did not write it. | The original is never destroyed and is always one hover away. The prompt forbids inventing facts. A title scored 1 is returned unchanged. |
| **Flattening genuine urgency.** Real health, safety and news headlines look sensational because the underlying event is. | An explicit prompt rule returns such titles unchanged with tactic `none`, and a real public-health headline is in our permanent test set. In v1 this failed visibly: the times 11:00–16:00 were deleted from a heat-wave warning. |
| **Judging the user.** A reflection feature can very easily shame. | The Mirror analyses **the feed, never the person**. Prompt B forbids second-person judgement outright and bans the vocabulary of blame. |
| **Sounding like a diagnosis.** The brief requires support, not medical assessment. | No score is ever assigned to a user. The tool holds no model of the person — only counts of what a feed contained. The words *addiction*, *disorder* and *dependency* are prohibited in Prompt B. |
| **Overconfident numbers.** A bait score is a model judgement, not a measurement. | Shown as a 1–5 label, never a percentage, and described in the interface as an estimate. No derived metrics such as "minutes saved" appear anywhere. |
| **Privacy.** Titles are sent to a third-party API, and what someone watches is revealing. | No account, no history, no storage. Only title text leaves the browser, only when the user acts. **Residual risk we have not solved:** title text still reveals interests, so a real deployment would require explicit consent and ideally local processing. |
| **Language and cultural bias.** The model's sense of what is sensational is shaped largely by English data. | Turkish titles appear in both the examples and the test set. Finding 4 above is direct evidence that this bias is real and measurable in our own output; we report it as a known limitation. |

## 6. Known limitation

Our first operation is "close the curiosity gap" — answer the question the title is withholding. Testing showed this is **rarely achievable from the title alone**, because a clickbait title by definition does not contain its own answer. The model correctly describes the subject instead of guessing (guessing would violate our no-invented-facts rule), but the gap is removed rather than filled. Closing it properly would require the video description or transcript, which is the clearest next step for this project.

---

### Placeholders to fill before submitting

1. Confirm the exact Gemini model id matches what you ran — header
3. Section 4, bullet 1 — any other build problems you hit
4. Section 4, bullet 4 — your 20-title failure log
5. Confirm the team list is correct
