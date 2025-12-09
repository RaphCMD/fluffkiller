chrome.storage.local.set({ fluffkiller_all_results: "PENDING" });
function isLikelyArticlePage() {
  const semantic =
    !!document.querySelector("article") || !!document.querySelector("main");
  const og =
    document.querySelector('meta[property="og:type"]')?.content === "article";
  const schema = !!document.querySelector('[itemtype*="schema.org/Article"]');

  const paragraphs = [...document.querySelectorAll("p")];
  const longParas = paragraphs.filter((p) => p.textContent.trim().length > 100);
  const dense = longParas.length >= 3;

  const urlMatch = /\/(?:\d{4}\/\d{2}|article|news|events)/.test(location.href);
  const science = !!document.querySelector(".sciencenews-class-mappings");

  const score = semantic + og + schema + dense + urlMatch + science;
  console.log("fluffkiller: Article heuristic", {
    semantic,
    og,
    schema,
    dense,
    urlMatch,
    science,
    score,
  });
  return score >= 2; // relaxed threshold so we don't miss valid articles
}

function saveJSONToFile(jsonData, filename = "fluff_output.json") {
  const blob = new Blob([JSON.stringify(jsonData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

async function injectScript(file) {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL(file);
  script.type = "text/javascript";
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}
// injectScript("https://cdn.jsdelivr.net/npm/d3@7");

if (isLikelyArticlePage()) {
  injectScript("utils/Readability.js"); // must be first
  injectScript("extract-article.js"); // must be last
  console.log("fluffkiller: Requisites attached");
  detectFluffParagraphs();
} else {
  chrome.runtime.sendMessage({
    type: "fluffkiller_ARTICLE_STATUS",
    isArticle: isLikelyArticlePage(),
  });
}

function makeHistogram(scores, bins = 100) {
  const hist = new Array(bins).fill(0);
  for (const score of scores) {
    const index = Math.min(bins - 1, Math.floor(score * bins));
    hist[index]++;
  }
  return hist.map((count) => count / scores.length); // Normalize to [0, 1]
}

// Content script to detect fluff paragraphs
function waitForMessage(typeToMatch) {
  return new Promise((resolve) => {
    function handler(event) {
      if (event.source !== window) return;
      if (event.data?.type === typeToMatch) {
        window.removeEventListener("message", handler);
        resolve(event.data);
      }
    }
    window.addEventListener("message", handler);
  });
}

function saveJSONToFile(jsonData, filename = "fluff_output.json") {
  const blob = new Blob([JSON.stringify(jsonData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function isFillerPara(p) {
  const trashRegexes = [
    /^\d+ (minutes|hours|days) ago/i,
    /^(By\s)?[A-Z][a-z]+\s[A-Z][a-z]+$/, // common bylines
    /^(Share|Save|Email|Facebook|X|Twitter)/i,
    /^Photo credit/i,
    /^Getty Images/i,
    /^Reuters/i,
    /^Duration ([0-9]+:)+[0-9]+/i,
    /^·/i,
    /^(January|February|March|April|May|June|July|August|September|October|November|December) [0-9]{1,2} · [0-9]{1,2}:[0-9]{2} (AM|PM) [A-Z]{3}$/i,
    /^(Updated|Published) [0-9]{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) [0-9]{4}$/i,
    /^Click here to read more/i,
    /^Advertisement/i,
    /^Sponsored content/i,
    /^Subscribe to our newsletter/i,
    /^Follow us on/i,
    /^Related articles/i,
    /^Editor's note/i,
    /^Disclaimer:/i,
    /^End of article/i,
    /^This article was originally published/i,
    /^For more information, visit/i,
    /^Contact us at/i,
    /^All rights reserved/i,
    /^Terms and conditions apply/i,
    /^Privacy policy/i,
    /^Cookie policy/i,
    /^Back to top/i,
    /^Next story/i,
    /^Previous story/i,
    /^Table of contents/i,
    /^Jump to section/i,
    /^Read also:/i,
    /^More from/i,
    /^Trending now:/i,
    /^Breaking news:/i,
    /^Editor's picks:/i,
    /^Top stories:/i,
    /^Most read:/i,
    /^Latest updates:/i,
    /^Watch now:/i,
    /^Listen now:/i,
    /^Download the app/i,
    /^Join the conversation/i,
    /^Leave a comment/i,
    /^Share your thoughts/i,
    /^Rate this article/i,
    /^Give feedback/i,
    /^Support our journalism/i,
    /^Become a subscriber/i,
    /^Donate now/i,
    /^Help us improve/i,
    /^Report an error/i,
    /^Contact the author/i,
    /^Follow the author/i,
    /^About the author/i,
    /^Author's bio/i,
    /^Editor's choice:/i,
    /^Featured story:/i,
    /^In case you missed it:/i,
    /^You might also like:/i,
    /^Recommended for you:/i,
    /^Up next:/i,
    /^Don't miss:/i,
    /^Exclusive:/i,
    /^Special report:/i,
    /^Analysis:/i,
    /^Opinion:/i,
    /^Commentary:/i,
    /^Perspective:/i,
    /^Insight:/i,
    /^Explainer:/i,
    /^Fact check:/i,
    /^Correction:/i,
    /^Update:/i,
    /^Breaking:/i,
    /^Developing story:/i,
    /^Live updates:/i,
    /^Follow our coverage:/i,
    /^Stay tuned:/i,
    /^Coming soon:/i,
    /^On this topic:/i,
    /^Related topics:/i,
    /^More on this:/i,
    /^Explore more:/i,
    /^Discover:/i,
    /^Learn more:/i,
    /^Find out:/i,
    /^Read next:/i,
    /^Continue reading:/i,
    /^Next page:/i,
    /^Page [0-9]+ of [0-9]+/i,
    /^End of page/i,
    /^Scroll down for more/i,
    /^Back to article/i,
    /^Return to homepage/i,
    /^Visit our website/i,
    /^Follow us for updates/i,
    /^Stay connected:/i,
    /^Join us on/i,
    /^Connect with us/i,
    /^Engage with us/i,
    /^Be part of the conversation/i,
    /^Your feedback matters/i,
    /^Tell us what you think/i,
    /^We value your input/i,
    /^Thank you for reading/i,
    /^We appreciate your support/i,
    /^Stay informed/i,
    /^Stay updated/i,
    /^Stay ahead/i,
    /create an account/i,
    /sign[- ]?in/i,
    /register(ing)? for free/i,
    /continue with your reading experience/i,
    /to continue reading/i,
    /to access this article/i,
    /^Subscribe( now)? to (read|access|unlock)/i,
    /^Unlock (the full article|full access)/i,
    /^Access (our|this) (coverage|content)/i,
  ];
  // (trashRegexes.some(rx => rx.test(p.trim()))) ? console.log("fluffkiller: Filler:", p) : console.log("fluffkiller: Not filler:", p);
  return trashRegexes.some((rx) => rx.test(p.trim()));
}

async function detectFluffParagraphs() {
  // Mark this tab as pending so the popup doesn't assume "not an article"
  let currentTabId = null;
  chrome.runtime.sendMessage({ type: "GET_TAB_DOMAIN" }, (response) => {
    const tabId = response?.tabId;
    currentTabId = tabId;
    if (tabId) {
      const key = `fluffkiller_results_${tabId}`;
      chrome.storage.local.set({ [key]: "PENDING" });
    }
  });

  const articleRequest = await waitForMessage("fluffkiller_ARTICLE");
  console.log("fluffkillerer: Article:", articleRequest);

  const articleCleaned = articleRequest.paragraphs.filter(
    (e) => !isFillerPara(e)
  );
  console.log("fluffkiller: Article Cleaned:", articleCleaned);
  // chrome.downloads.download({
  //   url: URL.createObjectURL(
  //     new Blob([JSON.stringify(articleCleaned)], { type: "application/json" })
  //   ),
  //   filename: `browsed/${document.title}.json`,
  //   saveAs: false,
  // });

  const context = 2;
  const articleParagraphs = articleCleaned;
  const articleContext = articleParagraphs.slice(0, context);
  const articleParagraphsWithoutContext = articleParagraphs.slice(context);
  if (articleParagraphsWithoutContext.length === 0) return;

  const headline = document.title + articleContext;

  const url = chrome.runtime.getURL("lib/transformers.min.js");
  const { pipeline, env } = await import(url);
  env.cache = false;
  env.backends.onnx.wasm.cacheEnabled = false;
  env.localModelPath = chrome.runtime.getURL("models/");

  if (window.caches) {
    const originalPut = caches.open;
    caches.open = async function (name) {
      const cache = await originalPut.call(this, name);
      cache.put = async function () {}; // silently block puts
      return cache;
    };
  }

  const model = await pipeline("text-classification", "trainedright", {
    quantized: false,
    local_files: true,
  });

  const paragraphResults = [];

  for (const paragraph of articleParagraphs) {
    const output = await model({ text: headline, text_pair: paragraph });
    if (!output || !Array.isArray(output) || output.length === 0) continue;

    const result = output[0];
    paragraphResults.push({
      paragraph,
      score: result.score,
      isFluff: result.label === "fluff",
    });
  }

  const jsonResults = JSON.stringify(paragraphResults);

  chrome.runtime.sendMessage({ type: "GET_TAB_DOMAIN" }, (response) => {
    const domain = response?.domain;
    const tabId = response?.tabId;
    if (!tabId || !domain) return;

    const key = `fluffkiller_results_${tabId}`;
    chrome.storage.local.set({ [key]: jsonResults }, () => {
      console.log(
        "fluffkiller: Results stored under",
        key,
        JSON.parse(jsonResults)
      );
    });

    const thresholdKey = `fluffkiller_threshold_${domain}`;
    chrome.storage.local.get([thresholdKey, "fluffkiller_debug_highlight_only"], (res) => {
      const threshold = res[thresholdKey] ?? 0.5;
      const highlightOnly = !!res["fluffkiller_debug_highlight_only"];
      lastParagraphResults = paragraphResults;
      highlightFluffParagraphs(paragraphResults, threshold, currentTabId, highlightOnly);
    });
  });
}

// Cosine similarity function
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Simple keyword overlap
function calculateKeywordOverlap(headline, paragraph) {
  const headlineWords = headline
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  const paragraphWords = new Set(paragraph.toLowerCase().split(/\W+/));
  const matches = headlineWords.filter((word) => paragraphWords.has(word));
  return matches.length / headlineWords.length || 0;
}

// Placeholder for named entity check (use compromise for accuracy)
function checkNamedEntities(paragraph) {
  return paragraph.match(/[A-Z][a-z]+ [A-Z][a-z]+/) ? 1 : 0;
}

// Run detection

function hideParagraph(el) {
  if (!el.dataset.fluffkillerOriginalStyle) {
    el.dataset.fluffkillerOriginalStyle = el.getAttribute("style") || "";
  }
  el.style.opacity = "0";
  el.style.height = "0";
  el.style.margin = "0";
  el.style.padding = "0";
  el.style.pointerEvents = "none";
  el.style.overflow = "hidden";
}

function showParagraph(el) {
  const original = el.dataset.fluffkillerOriginalStyle || "";
  el.setAttribute("style", original);
  delete el.dataset.fluffkillerOriginalStyle;
}

function highlightFluffParagraphs(results, threshold = 0.6, tabId = null, highlightOnly = false) {
  if (!Array.isArray(results)) return;

  const normalize = (str) =>
    typeof str === "string" ? str.replace(/\s+/g, " ").trim() : "";

  const paragraphs = document.querySelectorAll("p");
  const hidden = [];

  for (const paraEl of paragraphs) {
    showParagraph(paraEl); // reset
    paraEl.style.backgroundColor = "";
    paraEl.style.color = "";

    const paraText = normalize(paraEl.textContent);
    for (const item of results) {
      const matchText = normalize(item.paragraph);
      if (paraText !== matchText) continue;

      const score = item.isFluff ? 1 - item.score : item.score;

      if (score < threshold) {
        if (highlightOnly) {
          const intensity = score / threshold;
          const red = Math.round(255 * intensity);
          paraEl.style.backgroundColor = `rgb(${red},0,0)`;
          paraEl.style.color = score < 0.15 ? "white" : "inherit";
          hidden.push({ paragraph: item.paragraph, score });
        } else {
          hideParagraph(paraEl);
          hidden.push({ paragraph: item.paragraph, score });
        }
      }
      break;
    }
  }

  if (tabId) {
    const key = `fluffkiller_trash_${tabId}`;
    chrome.storage.local.set({ [key]: JSON.stringify(hidden) });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "fluffkiller_SET_THRESHOLD") {
    chrome.runtime.sendMessage({ type: "GET_TAB_ID" }, (res) => {
      const tabId = res?.tabId;
      if (!tabId) return;

      const key = `fluffkiller_results_${tabId}`;
      chrome.storage.local.get([key], (result) => {
        const raw = result[key];
        if (!raw) {
          console.warn("No stored results for tab", tabId);
          return;
        }

        const parsed = JSON.parse(raw);
        const highlightOnly = !!msg.highlightOnly;
        highlightFluffParagraphs(parsed, msg.threshold, tabId, highlightOnly);
      });
    });
  }
});
