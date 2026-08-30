"use strict";

const MODEL = "gemini-3.6-flash"; // Flash tier
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/";

// Prompts copied from original index.html
const PROMPT_DEBAIT = `You rewrite headlines to remove their psychological hooks.

Every title you receive was engineered to make someone click before they
decided to. Return the same information with the engineering removed, so a
reader can tell in one second whether they actually want it.

## The three operations

1. CLOSE THE GAP. If a title withholds its own answer, put the answer in.
   "You won't believe what he found in the attic" becomes "Man finds a 1943
   penny in an attic." A rewrite that leaves the reader still wondering has
   failed.

2. FLATTEN THE REGISTER. Remove superlatives, intensifiers, ALL CAPS,
   exclamation marks, emoji, second-person address, urgency and stakes.
   Words like "insane", "shocking", "destroyed", "nobody is talking about
   this" carry temperature, not information. Cut them.

3. STATE THE SUBJECT PLAINLY. Lead with what the thing actually is. Prefer
   the phrasing of a library catalogue entry to the phrasing of a headline.

## Hard rules

- Never invent facts. If the original does not reveal the answer, describe
  what the content is about instead of guessing: "Video about an object
  found in an attic." Guessing is worse than boring.
- Never flatten a title carrying genuine health, safety, emergency or news
  urgency. Real urgency is information, not manipulation. Return it
  unchanged, word for word, with tactic "none" and bait 1.
- Never be sarcastic, arch, knowing or funny. Irony is itself a hook. The
  target register is neutral, not superior.
- Never editorialise about the title, the creator, or clickbait itself.
- Reply in the same language as the input. Turkish in, Turkish out.
- Twelve words maximum. Sentence case.
- If a title is already plain and informative, return it unchanged, word for
  word, with a bait score of 1. Over-rewriting neutral titles is a failure
  mode, not thoroughness.

## When rules conflict

The safety rule and the "return unchanged" rule both outrank the twelve-word
limit. If preserving a genuine warning or an already-plain title requires
more than twelve words, exceed the limit and keep the title intact.

## Tactic

Assign the single most dominant tactic. Use exactly one of these strings and
never invent a new one:
curiosity-gap | outrage | fear | superlative | false-urgency |
parasocial | listicle | none

## Bait score

1 - plainly informative, nothing removed
3 - mild emotional colouring
5 - the title's entire function is to withhold or provoke

## Examples

in:  "I Spent 50 Hours Buried Alive 😱"
out: {"boring":"Man stays in a buried box for 50 hours",
      "tactic":"superlative","bait":5}

in:  "Doctors HATE this one simple trick"
out: {"boring":"Claims about an unspecified health technique",
      "tactic":"curiosity-gap","bait":5}

in:  "How to make sourdough starter from scratch"
out: {"boring":"How to make sourdough starter from scratch",
      "tactic":"none","bait":1}

in:  "Bu videoyu izlemeden ev almayın!"
out: {"boring":"Ev almadan önce dikkat edilecek noktalar",
      "tactic":"fear","bait":4}`;

const PROMPT_TRANSCRIPT = `You analyse a video by comparing its title against its transcript.

You receive a video title and the transcript of the video itself. Your job is
to determine whether the title is clickbait by checking the actual content.

## What to produce

1. BORING TITLE. Rewrite the title to be plain and factual. Because you have
   the transcript, you CAN close the curiosity gap: state what the video
   actually reveals or discusses. Do not guess — use the transcript.

2. TACTIC. Assign the single most dominant manipulation tactic from:
   curiosity-gap | outrage | fear | superlative | false-urgency |
   parasocial | listicle | none

3. TITLE BAIT SCORE (1-5). How manipulative is the title alone?
   1 = plainly informative, 5 = entire function is to withhold or provoke.

4. CONTENT MATCH SCORE (1-5). How well does the title represent the actual
   video content?
   1 = completely misleading, the video is about something else entirely
   3 = partially accurate but exaggerated or missing key context
   5 = the title accurately describes the video content

5. FEEDBACK. Write exactly one or two sentences in the SAME LANGUAGE as the
   title. Explain to the viewer what the video is actually about and whether
   the title's promise is kept. Be neutral and factual. Never judge the
   viewer. Never be sarcastic.

## Hard rules

- Never invent facts not in the transcript.
- Never flatten a title carrying genuine health, safety, emergency or news
  urgency. Return it unchanged with tactic "none", bait 1, content_match 5.
- Reply in the same language as the title. Turkish title → Turkish output.
- The boring title: twelve words maximum, sentence case.
- If the title is already plain and informative, return it unchanged with
  bait 1 and content_match 5.`;

const OUTPUT_CONTRACT = `Reply with a JSON array of exactly {{N}} objects and nothing else.
Each object: {"index": <number, matching the title's number below>, "boring": <string, the rewritten title>, "tactic": <string, exactly one of: curiosity-gap, outrage, fear, superlative, false-urgency, parasocial, listicle, none>, "bait": <integer 1-5>}`;

const OUTPUT_CONTRACT_TRANSCRIPT = `Reply with a single JSON object and nothing else.
The object: {"boring": <string, the rewritten title>, "tactic": <string, exactly one of: curiosity-gap, outrage, fear, superlative, false-urgency, parasocial, listicle, none>, "bait": <integer 1-5>, "content_match": <integer 1-5>, "feedback": <string, one or two sentences>}`;


async function callModel(apiKey, system, user, maxTokens, wantJson, noThinking) {
  const generationConfig = Object.assign(
    { maxOutputTokens: maxTokens, temperature: 0.2 },
    wantJson ? { responseMimeType: "application/json" } : {},
    !noThinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}
  );

  const res = await fetch(API_URL + MODEL + ":generateContent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: generationConfig
    })
  });

  if (!res.ok) {
    let detail = "";
    try { const j = await res.json(); detail = (j && j.error && j.error.message) ? j.error.message : ""; } catch(e){}
    if (res.status === 400 && !noThinking && /think/i.test(detail)) {
      return callModel(apiKey, system, user, maxTokens, wantJson, true);
    }
    throw new Error("HTTP " + res.status + (detail ? ": " + detail.slice(0,200) : ""));
  }

  const data = await res.json();
  const cand = (data.candidates && data.candidates[0]) || null;
  const parts = (cand && cand.content && cand.content.parts) || [];
  const text = parts.map(p => p.text || "").join("");
  if (!text) {
    const why = cand && cand.finishReason ? " (" + cand.finishReason + ")" : "";
    throw new Error("Empty reply" + why);
  }
  return text;
}

function parseArray(text){
  const a = text.indexOf("["), b = text.lastIndexOf("]");
  if(a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch(e){ return null; }
}

function validate(arr, n){
  if(!Array.isArray(arr) || arr.length !== n) return null;
  const out = new Array(n);
  for(let k = 0; k < arr.length; k++){
    const it = arr[k];
    if(!it || typeof it !== "object") return null;
    const idx = Number.isInteger(it.index) ? it.index : k;
    if(idx < 0 || idx >= n || out[idx]) return null;
    const boring = typeof it.boring === "string" ? it.boring.trim() : "";
    const tactic = typeof it.tactic === "string" ? it.tactic.trim() : "";
    const bait = Number(it.bait);
    if(!boring || !tactic || !Number.isFinite(bait)) return null;
    out[idx] = { boring: boring, tactic: tactic, bait: Math.max(1, Math.min(5, Math.round(bait))) };
  }
  for(let i = 0; i < n; i++) if(!out[i]) return null;
  return out;
}

async function handleBatchAnalyze(titles) {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) throw new Error("API key missing");

  const numbered = titles.map((t, i) => i + ". " + t).join("\n");
  const userMsg = OUTPUT_CONTRACT.replace("{{N}}", String(titles.length)) + "\n\nTitles:\n" + numbered;
  
  let result = null;
  for (let attempt = 0; attempt < 2 && !result; attempt++) {
    try {
      const budget = Math.min(16000, 1200 + 250 * titles.length) * (attempt + 1);
      const raw = await callModel(
        apiKey,
        PROMPT_DEBAIT,
        attempt > 0 ? "Your previous reply could not be parsed. Reply with the JSON array only, no prose.\n\n" + userMsg : userMsg,
        budget,
        true
      );
      result = validate(parseArray(raw), titles.length);
    } catch(e) {
      console.warn("Attempt failed", e);
    }
  }

  if (result) {
    // Update stats
    chrome.storage.local.get("analysedCount", (res) => {
      const count = (res.analysedCount || 0) + result.length;
      chrome.storage.local.set({ analysedCount: count });
    });
  }

  return result;
}

async function handleTranscriptAnalyze(title, transcript) {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) throw new Error("API key missing");

  const maxTranscript = 4000;
  const truncated = transcript.length > maxTranscript ? transcript.slice(0, maxTranscript) + "\n[transcript truncated]" : transcript;
  const userMsg = OUTPUT_CONTRACT_TRANSCRIPT + "\n\nTitle: " + title.trim() + "\n\nTranscript:\n" + truncated;

  let result = null;
  for (let attempt = 0; attempt < 2 && !result; attempt++) {
    try {
      const budget = 2000 * (attempt + 1);
      const raw = await callModel(
        apiKey,
        PROMPT_TRANSCRIPT,
        attempt > 0 ? "Your previous reply could not be parsed. Reply with the JSON object only, no prose.\n\n" + userMsg : userMsg,
        budget,
        true
      );
      
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch(e){
        const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
        if(a >= 0 && b > a) try { parsed = JSON.parse(raw.slice(a, b + 1)); } catch(e2){}
      }
      
      if (parsed && parsed.boring && parsed.tactic && Number.isFinite(parsed.bait)) {
        result = parsed;
      }
    } catch(e) {
      console.warn("Attempt failed", e);
    }
  }

  if (result) {
    chrome.storage.local.get("analysedCount", (res) => {
      chrome.storage.local.set({ analysedCount: (res.analysedCount || 0) + 1 });
    });
  }
  
  return result;
}

// Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "ANALYZE_BATCH") {
    handleBatchAnalyze(request.titles)
      .then(results => sendResponse({ results }))
      .catch(err => {
        console.error("Batch error:", err);
        sendResponse({ error: err.message });
      });
    return true; // Keep channel open
  }
  
  if (request.type === "ANALYZE_TRANSCRIPT") {
    handleTranscriptAnalyze(request.title, request.transcript)
      .then(result => sendResponse({ result }))
      .catch(err => {
        console.error("Transcript error:", err);
        sendResponse({ error: err.message });
      });
    return true;
  }
});
