# Boringifier — Hackathon Report

**Group 10** · Digital Addiction & Digital Well-Being · 30 August 2026
**Team:** Huzeyfe Hakan Sarıcaoğlu, Nehir Kazancı, Ramazan Bıyık, Damla Korkmaz, Asya Güney
**Model:** Google Gemini (`gemini-3.6-flash`) via the `generateContent` API
**Repository:** https://github.com/Neka67/boringifier

---

## 1. The problem

Compulsive feed use is not mainly driven by the quality of the content. It is
driven by the **curiosity gap**: a title that withholds its own answer creates a
tension the reader is motivated to resolve, and clicking resolves it.
Recommendation feeds are optimised to generate that tension continuously, which
is why people open an app intending to watch one thing and leave forty minutes
later unable to say what they watched.

Our target user is that person — someone who does not want to quit a platform,
but who wants to stop being pulled through it. We intervene at the moment of
temptation rather than reporting on it afterwards.

**In one sentence:** Boringifier removes the manipulation from the titles in a
real YouTube feed and shows the user which persuasion tactics that feed was
using on them.

## 2. The solution

The project ships as **two surfaces sharing one engine**.

**A Chrome extension (Manifest V3) — the deployed intervention.** On the YouTube
homepage it collects titles as the feed renders, sends them to the model in
batches of twelve, and replaces each title in place with a flat, factual
version. The rewritten title is set in a lighter weight than untouched text, a
1–5 bait score appears beside it, and hovering restores the original word for
word along with the manipulation tactic identified. On a video's watch page it
goes further: it fetches the caption track and compares the title against what
the video actually contains.

**A single-page web application — the controlled testbed.** The same prompts
running against a fixed feed, plus a free-text box for arbitrary titles. This is
where the prompts were developed and where behaviour can be checked
reproducibly, without YouTube's DOM changing underneath the experiment. It also
carries the **Mirror**: a session tally of how many titles were analysed, which
tactics appeared and how often, and a short generated reflection.

The division is deliberate. The extension is where the tool is useful; the web
app is where it is testable. Both call the same model with the same prompts.

**Why generative AI is core rather than decorative.** Every function above is a
judgement about meaning, not a text transformation. Whether a title withholds
its own answer, which tactic it uses, and what a neutral restatement would be
cannot be decided with keywords. Our own test data shows why: *"Doctors HATE
this one simple trick"* and *"Health ministry warns of heat wave, advises
avoiding outdoor work between 11:00 and 16:00"* both use urgent, charged
language, but one is manipulation and one is public safety information.
Separating them requires a model. Remove the model and there is no product.

## 3. Prompt design

The system uses **three** system prompts, built with deliberately different
techniques because they solve different kinds of problem.

| | A · debait (feed) | B · transcript (watch page) | C · reflect (Mirror) |
|---|---|---|---|
| **Job** | Rewrite a title from the title alone | Rewrite using the video's captions, and score title-to-content match | Write a reflection on a tally |
| **Techniques** | Structured step-by-step + few-shot + structured output | Structured step-by-step + structured output, no examples | Zero-shot + constraint-based (negative) prompting |
| **Why** | One narrow correct output form; examples show it faster than description can | The task is grounded in supplied source text, so rules suffice and examples would bias it toward their own subjects | Many acceptable answers, one unacceptable *tone*; boundaries matter more than models to imitate |

Prompt A decomposes a vague instruction ("make it boring") into three checkable
operations — close the gap, flatten the register, state the subject plainly —
followed by hard rules, a fixed tactic vocabulary, a 1–5 scale, and a JSON
schema the application validates before rendering.

**Prompt B is the same task under different information conditions, and the
change is instructive.** Prompt A must forbid guessing: with only the title, an
unanswerable hook can only be *described* ("Video about an object found in an
attic"). Prompt B has the transcript, so the same rule inverts — it is now
required to state what the video actually reveals, and forbidden to go beyond
the transcript. It also adds a second score, content-match, separating *is this
title manipulative* from *is this title accurate*, which are genuinely different
questions.

Prompt C contains almost no positive instruction. It is mostly prohibitions: no
second-person judgement, no vocabulary of blame ("addiction", "wasting",
"should"), no estimate that was not directly counted, no clinical framing, no
praise. This is a design choice, not laziness — for text shown to someone about
their own behaviour, the risk is not a wrong answer but a harmful tone, and
prohibitions constrain tone more reliably than examples do.

### 3.1 Iteration method

Five test titles, each testing a distinct failure mode, held constant across all
versions:

1. Extreme clickbait (English) — *I Tried EVERY Fast Food Breakfast So You NEVER Have To 🤯*
2. Moderate curiosity gap — *The real reason your phone battery dies so fast*
3. **Negative control** — *How to change a bike tire in 5 minutes* (already plain; must survive)
4. Turkish clickbait — *Bunu bilmeden telefonunuzu şarj etmeyin!*
5. **Safety control** — *Health ministry warns of heat wave, advises avoiding outdoor work between 11:00 and 16:00*

Each version was run **in a separate conversation** so context from an earlier
run could not improve a later one. Iteration was carried out on Gemini Pro; the
deployed system runs `gemini-3.6-flash`, and the five titles were re-run through
the deployed prototype to confirm the shipped prompt behaves as logged. Full
outputs are in `prompt_log.md`.

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

\* v1 contained no word cap, so this row records observed consistency rather
than compliance with an instruction.

### 3.3 Findings

**1. Structured instruction did most of the work.** We expected the structured
version to keep over-rewriting the already-plain title. It did not — v2 scored
8/8. Explicit rules and a fixed output schema were sufficient to reach correct
behaviour on every check; few-shot examples were not required to get there.

**2. Examples changed how *completely* a protective rule was obeyed.**

| | Negative control (3) | Safety control (5) |
|---|---|---|
| v2 | returned with an added full stop | rephrased, compressed to exactly 12 words |
| v3 | returned byte-for-byte identical | returned byte-for-byte identical |

v2 read "leave it unchanged" as *rewrite it minimally*; v3 read it as *return it
verbatim*. For a rule whose purpose is to protect someone else's words, that
distinction is the entire point.

**3. A rule conflict, resolved correctly by the safer version.** v3's only failed
check is the word cap: it returned the heat-wave warning at 14 words against a
12-word limit. Two of our rules collide — *never flatten genuine safety urgency*
versus *twelve words maximum*. v2 obeyed the cap and compressed the warning; v3
broke the cap and kept it intact. v3 chose correctly, so we shipped it and added
an explicit precedence clause to the prompt, making the resolution designed
rather than incidental.

**4. Few-shot examples carry their own bias.** The Turkish title's tactic moved
from `curiosity-gap` (v2) to `false-urgency` (v3). We judge v2 more accurate: the
title withholds *what* the reader needs to know, which is a curiosity gap. Our
example set contains a Turkish imperative labelled `fear`, which appears to have
pulled a structurally similar Turkish imperative toward the urgency family.
Examples improve consistency and transfer their own assumptions at the same
time.

## 4. Challenges

- **A silent DOM mismatch.** The extension logged that it was watching the feed
  and then did nothing. Its selectors targeted `ytd-rich-grid-media` and
  `ytd-video-renderer`; YouTube now renders homepage cards as
  `yt-lockup-view-model` inside `ytd-rich-item-renderer`, so zero elements ever
  matched and no request was ever sent. We diagnosed it by counting matches for
  candidate selectors in the console. We also found the scan ran only inside the
  mutation callback, so a feed that finished rendering before the script loaded
  was never scanned at all; it now runs once on load as well.
- **A non-ASCII character in the API key field** made `fetch` throw before any
  request left the browser. The error named the header, not the key, so it read
  as a code fault. Input is now stripped to printable ASCII.
- **Opaque CORS failure.** Browser calls from a `file://` origin failed with
  "Failed to fetch" and no detail. Serving over `localhost` resolved it, and a
  pass-through local server is included as a fallback. The extension avoids the
  problem entirely by declaring host permissions.
- **A retired model id.** Our first target model had been withdrawn; the API's
  own 404 named the replacement. Model ids are now pinned and verified rather
  than assumed.
- **An output contract that would have broken the interface.** The tactic field
  was first specified as free text ("2–4 words naming the manipulation").
  Because the Mirror groups titles by tactic string, near-synonyms would have
  fragmented every count to one and made the breakdown meaningless. The contract
  now constrains tactic to a fixed eight-value vocabulary.
- **Batch length mismatches.** Validation requires exactly one object per input
  title. When the model returned a different count the batch was discarded and a
  null result reached the renderer. Failed batches now leave their titles
  untouched instead of throwing.

## 5. Ethical evaluation

| Risk | How we reduced it |
|---|---|
| **Misrepresenting creators.** We overwrite someone else's words on their own page; a wrong rewrite attributes meaning to a person who did not write it. | The original is never destroyed — it is kept on the element and shown on hover. The prompt forbids inventing facts. A title scored 1 is returned unchanged, word for word. |
| **Flattening genuine urgency.** Real health, safety and news headlines look sensational because the underlying event is. | An explicit prompt rule returns such titles unchanged with tactic `none`, and a real public-health headline sits permanently in our test set. In v1 this failed visibly: the times 11:00–16:00 were deleted from a heat-wave warning. |
| **Judging the user.** A reflection feature can very easily shame. | The Mirror analyses **the feed, never the person**. Prompt C forbids second-person judgement and bans the vocabulary of blame. |
| **Sounding like a diagnosis.** The brief requires support, not medical assessment. | No score is ever assigned to a user. The system holds no model of the person — only counts of what a feed contained. *Addiction*, *disorder* and *dependency* are prohibited words in Prompt C. |
| **Overconfident numbers.** Bait and content-match scores are model judgements, not measurements. | Shown as 1–5 labels, never percentages, and described as estimates. No derived metric such as "minutes saved" appears anywhere. |
| **Privacy — heightened by the extension.** The web app sees only titles a user pastes. The extension sees the user's **personal recommended feed**, which reveals interests, beliefs and habits, and sends those titles to a third-party API. | No account, no history, no server of our own; titles are sent for analysis and not retained by us. This is the risk we have *not* fully solved, and we state it plainly: a real deployment would need explicit informed consent, a visible indicator of what is being transmitted, and ideally on-device processing. For the demonstration we use a logged-out feed so no personal recommendation data is exposed. |
| **Key storage.** The extension keeps the API key in `chrome.storage.local`, unencrypted. | Acceptable for a prototype the user installs unpacked with their own key. A released version would need a backend so the key never sits in the browser. Named here rather than hidden. |
| **Modifying a third-party page.** The extension changes what a website displays without that site's involvement. | It is opt-in, installed deliberately by the user, alters only the text the user asked to have altered, and is reversible on hover. We treat this as user agency over their own browser rather than interference with the site. |
| **Language and cultural bias.** The model's sense of what is sensational is shaped largely by English data. | Turkish titles appear in the examples and in the test set. Finding 4 is direct evidence that this bias is real and measurable in our own output; we report it as a known limitation rather than a solved problem. |

### A feature we rejected

We considered blurring video thumbnails to reduce their pull, and decided against
it. Our stated principle is that nothing is hidden and the original is always
recoverable, and an indiscriminate blur contradicts both. It would also ignore
the bait score entirely, applying the same treatment to a manipulative title and
an honest one — the opposite of the discrimination the rest of the system is
built on.

## 6. From limitation to feature

Our first operation is "close the curiosity gap" — answer the question the title
withholds. Testing showed this is **not achievable from the title alone**,
because a clickbait title by definition does not contain its own answer. Prompt
A therefore describes the subject rather than guessing, which removes the hook
but does not fill it.

The watch-page analysis closes that gap properly. With the caption track
available, Prompt B can state what the video actually reveals, and the
content-match score reports whether the title's promise was kept. The remaining
limits are real: not every video has captions, transcripts are truncated to stay
within budget, and auto-generated captions are imperfect. But the gap the
title-only prompt could not fill is filled wherever the content is available,
and the difference between the two prompts is precisely a difference in what
information was available to each.
