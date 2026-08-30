"use strict";

// Keep track of titles we've already processed or are currently processing
const processedTitles = new Set();
let pendingTitles = [];
let batchTimer = null;

console.log("Boringifier: Content script loaded!");

// Target the main video containers on home page, search, and related videos
const CONTAINER_SELECTORS = [
  'yt-lockup-view-model:not([data-boringifier-processed])',
  'ytd-rich-grid-media:not([data-boringifier-processed])',
  'ytd-compact-video-renderer:not([data-boringifier-processed])',
  'ytd-video-renderer:not([data-boringifier-processed])'
].join(', ');

function observeFeed() {
  console.log("Boringifier: Observing feed...");

  function scan() {
    const containers = document.querySelectorAll(CONTAINER_SELECTORS);
    if (containers.length === 0) return;

    containers.forEach(container => {
      // Try the old ids first, then fall back to YouTube's newer lockup markup.
      // Ordered by specificity: querySelector with a comma list returns whatever
      // comes first in the DOM, which is not what we want here.
      const titleElement =
        container.querySelector('#video-title, #video-title-link') ||
        container.querySelector('h3 span.yt-core-attributed-string') ||
        container.querySelector('h3 span') ||
        container.querySelector('h3 a');
      if (!titleElement) return;

      const titleText = titleElement.textContent.trim();
      container.dataset.boringifierProcessed = "true";

      if (titleText && titleText.length > 5 && !processedTitles.has(titleText)) {
        processedTitles.add(titleText);
        pendingTitles.push({ element: titleElement, text: titleText });
        injectLoadingBadge(titleElement);
      }
    });

    if (pendingTitles.length) {
      console.log("Boringifier: queued", pendingTitles.length, "titles");
    }
    if (!batchTimer && pendingTitles.length > 0) {
      batchTimer = setTimeout(processBatch, 1500);
    }
  }

  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();   // the feed is often already rendered before this script runs
}

function processBatch() {
  if (pendingTitles.length === 0) {
    batchTimer = null;
    return;
  }

  // Take up to 12 titles at a time to match our prompt structure
  const batch = pendingTitles.splice(0, 12);
  const titlesText = batch.map(item => item.text);
  console.log("Boringifier: Sending batch of", titlesText.length, "titles for analysis...");

  chrome.runtime.sendMessage({ type: "ANALYZE_BATCH", titles: titlesText }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Boringifier:", chrome.runtime.lastError.message);
      batchTimer = null;
      return;
    }

    if (response && response.results) {
      response.results.forEach((res, index) => {
        if (res && res.bait) {
          updateBadge(batch[index].element, res);
        } else {
          removeBadge(batch[index].element);
        }
      });
    } else {
       // Request failed or returned nothing
       batch.forEach(item => removeBadge(item.element));
    }

    // Process next batch if any
    if (pendingTitles.length > 0) {
      batchTimer = setTimeout(processBatch, 1500);
    } else {
      batchTimer = null;
    }
  });
}

function injectLoadingBadge(titleElement) {
  const container = titleElement.parentElement;
  if (!container || container.querySelector('.boringifier-badge')) return;

  const badge = document.createElement('span');
  badge.className = 'boringifier-badge loading';
  badge.textContent = '⏳';
  
  container.style.display = 'flex';
  container.style.alignItems = 'flex-start';
  container.style.justifyContent = 'space-between';

  container.appendChild(badge);
}

function removeBadge(titleElement) {
  const container = titleElement.parentElement;
  if (!container) return;
  const badge = container.querySelector('.boringifier-badge');
  if (badge) badge.remove();
}

function updateBadge(titleElement, analysis) {
  const container = titleElement.parentElement;
  if (!container) return;
  
  let badge = container.querySelector('.boringifier-badge');
  if (!badge) {
    injectLoadingBadge(titleElement);
    badge = container.querySelector('.boringifier-badge');
  }
  if (!badge) return;

  badge.className = 'boringifier-badge' + (analysis.bait >= 4 ? ' hot' : '');
  badge.textContent = analysis.bait; // Just the number to keep it minimal

  const tooltip = document.createElement('div');
  tooltip.className = 'boringifier-tooltip';
  
  const titleDiv = document.createElement('div');
  titleDiv.className = 'boringifier-title';
  titleDiv.textContent = analysis.boring;
  tooltip.appendChild(titleDiv);

  const metaDiv = document.createElement('div');
  metaDiv.className = 'boringifier-meta';
  metaDiv.textContent = `${analysis.tactic} · bait ${analysis.bait}`;
  tooltip.appendChild(metaDiv);

  badge.appendChild(tooltip);
  
  // Try to adjust layout of parent so badge sits nicely next to title
  container.style.display = 'flex';
  container.style.alignItems = 'flex-start';
  container.style.justifyContent = 'space-between';

  container.appendChild(badge);
  
  // If it's a flex container or inline, making sure it doesn't break layout
  badge.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation(); // prevent clicking through to the video
  });
}

// Watch page logic
let currentWatchUrl = "";

function checkWatchPage() {
  if (window.location.pathname === '/watch' && window.location.href !== currentWatchUrl) {
    currentWatchUrl = window.location.href;
    setTimeout(analyzeWatchVideo, 2000); // Give the page time to load
  }
}

async function analyzeWatchVideo() {
  // Only inject if not already injected
  if (document.getElementById('boringifier-watch-panel')) return;

  const titleElement = document.querySelector('h1.ytd-watch-metadata');
  if (!titleElement) return;
  const titleText = titleElement.textContent.trim();

  // Try to find the transcript. On a content script, getting the transcript 
  // is tricky without intercepting network requests.
  // For the hackathon, we will fetch the video page HTML and parse ytInitialPlayerResponse
  try {
    const res = await fetch(window.location.href);
    const html = await res.text();
    const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*;/);
    let transcriptText = "";
    
    if (match) {
      const data = JSON.parse(match[1]);
      const captions = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (captions && captions.length > 0) {
        // Fetch the actual XML
        const xmlRes = await fetch(captions[0].baseUrl);
        const xml = await xmlRes.text();
        // Super simple XML tag stripping
        transcriptText = xml.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
      }
    }

    if (transcriptText) {
      chrome.runtime.sendMessage({ 
        type: "ANALYZE_TRANSCRIPT", 
        title: titleText, 
        transcript: transcriptText 
      }, (response) => {
        if (response && response.result) {
          injectWatchPanel(response.result);
        }
      });
    } else {
       console.log("Boringifier: No transcript found for this video.");
    }
  } catch (e) {
    console.error("Boringifier Transcript Error:", e);
  }
}

function injectWatchPanel(analysis) {
  const container = document.querySelector('#description-inner'); // Target the description box
  if (!container || document.getElementById('boringifier-watch-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'boringifier-watch-panel';
  panel.className = 'boringifier-watch-analysis';

  panel.innerHTML = `
    <h3 class="boring-h3">Boringifier Transcript Analysis</h3>
    <div class="boring-title" style="font-weight:600;margin-bottom:8px;">${analysis.boring}</div>
    <div class="boring-feedback">${analysis.feedback}</div>
    <div class="boring-stats">
      <span class="${analysis.bait >= 4 ? 'hot' : ''}">Bait: ${analysis.bait}/5</span>
      <span class="${analysis.content_match <= 2 ? 'hot' : ''}">Content Match: ${analysis.content_match}/5</span>
      <span>Tactic: ${analysis.tactic}</span>
    </div>
  `;

  container.prepend(panel);
}

// Initial setup
observeFeed();

// Handle SPA navigation on YouTube
window.addEventListener('yt-navigate-finish', checkWatchPage);
if (window.location.pathname === '/watch') {
  checkWatchPage();
}
