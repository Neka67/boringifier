"use strict";

const $ = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  // Load saved API key
  chrome.storage.local.get(["apiKey", "analysedCount"], (result) => {
    if (result.apiKey) {
      $("apiKey").value = result.apiKey;
    }
    if (result.analysedCount > 0) {
      $("statsSection").hidden = false;
      $("statsTotal").textContent = result.analysedCount + " titles analysed";
    }
  });

  $("saveKey").addEventListener("click", () => {
    let key = $("apiKey").value.trim();
    key = key.replace(/[^\x21-\x7E]/g, ""); // Clean key
    if (key) {
      chrome.storage.local.set({ apiKey: key }, () => {
        $("keyMsg").textContent = "Key saved!";
        $("keyMsg").hidden = false;
        setTimeout(() => { $("keyMsg").hidden = true; }, 2000);
      });
    } else {
      chrome.storage.local.remove("apiKey", () => {
        $("keyMsg").textContent = "Key cleared!";
        $("keyMsg").hidden = false;
        setTimeout(() => { $("keyMsg").hidden = true; }, 2000);
      });
    }
  });

  $("clearStats").addEventListener("click", () => {
    chrome.storage.local.set({ analysedCount: 0 }, () => {
      $("statsSection").hidden = true;
    });
  });
});
