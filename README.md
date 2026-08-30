# Boringifier

Removes clickbait manipulation from feed titles using a generative model, then
shows what the feed was doing.

## Run it

Open `index.html` in a browser. No build, no server, no dependencies.

Paste an Anthropic API key into the header field and flip the switch from
BAIT to BORING. The twelve titles are rewritten in a single request.

If your browser blocks the request from a `file://` origin, serve the folder
instead: `python3 -m http.server 8000` and open `http://localhost:8000`.

## The two tabs

**Feed** — a mock video grid. BAIT shows the original titles; BORING shows the
rewrites. Flipping back is instant and costs nothing: originals are held in
memory. Hovering (or tabbing to) a rewritten title shows the original, the
tactic the model named, and the bait score. The textarea at the bottom runs any
titles you paste through the same pipeline and appends them as cards.

**Mirror** — the tally for everything analysed in the current session: how many
titles, a breakdown by tactic ordered by count, the three highest-bait
originals with their boring versions, and a short generated reflection. The
reflection call receives only the counts, never the titles.

Everything on this tab is counted from actual model output. There are no
derived feel-good metrics.

## The four things you edit

All four are at the top of the `<script>` block in `index.html`, each behind a
banner comment.

1. `PROMPT_DEBAIT` — system prompt for the batch rewrite call.
2. `PROMPT_REFLECT` — system prompt for the reflection call.
3. `OUTPUT_CONTRACT` — the format instruction appended to the rewrite call's
   user message. Leave it alone unless you change the parser.
4. `TITLES` — the twelve feed titles.

`MODEL` is just below them. **Verify the id** at
<https://docs.claude.com/en/docs/about-claude/models> before demoing — a stale
id returns HTTP 404.

## What the model has to return

The rewrite call must reply with a JSON array of one object per input title:

```json
[{"index": 0, "boring": "rewritten title", "tactic": "curiosity gap", "bait": 4}]
```

`bait` is 1–5. `index` matches the numbering in the user message; if it is
missing, position is used instead. The reply is validated field by field before
anything is rendered — wrong length, missing field or bad type all count as a
failure. The assistant turn is prefilled with `[` so the reply starts as an
array; prose around the array is tolerated.

`OUTPUT_CONTRACT` already states this contract, so `PROMPT_DEBAIT` can focus on
the rewriting itself. Ask it for the rewrite in the same language as the
original, since the feed is mixed Turkish and English.

`tactic` is constrained to a fixed vocabulary — `curiosity-gap`, `outrage`,
`fear`, `superlative`, `false-urgency`, `parasocial`, `listicle`, `none`. This
matters: the Mirror groups titles by tactic string, so free-text labels would
fragment the tally into counts of one and the breakdown would be meaningless.

The reflection call receives this shape and should return three or four plain
sentences, inventing no numbers that are not in the input:

```json
{
  "titles_analysed": 17,
  "tactic_counts": {"curiosity gap": 5, "false urgency": 4},
  "bait_score_counts": {"1": 3, "2": 4, "3": 4, "4": 3, "5": 3}
}
```

## Failure behaviour

Every batch is one request. A malformed reply is retried once with a stricter
instruction. If the second attempt also fails, the original titles stay on
screen and a one-line message appears below the controls. The page never
crashes and never renders a partially validated batch.

Error messages carry the HTTP status and the API's own error text. The API key
is never included in them.

## The key

The key lives in one JavaScript variable for the lifetime of the page. It is
not written to `localStorage`, not logged, not put in an error message, and not
persisted anywhere. Reloading the page clears it.

Browser requests to the Anthropic API need three headers, all of which
`callModel` sends:

```
x-api-key: <key>
anthropic-version: 2023-06-01
anthropic-dangerous-direct-browser-access: true
```

Without the third one the request fails CORS.

## Design rules

Deliberate constraints, not omissions:

- No gradients, shadows, emoji, animations or transitions anywhere.
- A rewritten title is lighter and greyer than an original one.
- The only colour in the app marks a bait score of 4 or 5.
- Loading state is the titles dropping to 40% opacity. No spinner, no skeleton,
  no shimmer — a loading animation is the exact kind of attention-bait this
  project exists to remove.
- Minimum 15px text, so it reads on a projector.

## Repository contents

- `index.html` — the application. Both system prompts are near the top of the
  script block, behind banner comments.
- `REPORT.md` — the hackathon report.
- `prompt_log.md` — the prompt iteration log: three versions, five fixed test
  titles, real outputs, and what we concluded.
