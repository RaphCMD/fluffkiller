import * as d3 from "/lib/d3/d3-7-9-0.js";
let currentThreshold = 0.5;
let highlightOnly = false;
let lastHistData = null;

// injectScript("https://cdn.jsdelivr.net/npm/d3@7");

console.log("fluffkiller: Popup script loaded.");
// const checkElement = document.querySelector("p.check");

document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    document.querySelector("p.check").textContent = "No active tab found.";
  }
  const url = new URL(tab.url);
  const domain = url.hostname;
  const key = `fluffkiller_threshold_${domain}`;

  chrome.storage.local.get([key, "fluffkiller_debug_highlight_only"], (result) => {
    const stored = result[key] ?? 0.5;
    highlightOnly = !!result["fluffkiller_debug_highlight_only"];
    currentThreshold = stored;

    const headerLabel = document.getElementById("threshold-label");
    if (headerLabel) {
      headerLabel.textContent = stored.toFixed(2);
    }

    // Optionally re-emit threshold to ensure content is consistent
    chrome.tabs.sendMessage(tab.id, {
      type: "fluffkiller_SET_THRESHOLD",
      threshold: stored,
      highlightOnly,
    });
  });
  // You can now use `tab.id`, `tab.url`, etc. as needed

  document.querySelector(
    "p.check"
  ).textContent = `Generating for tab: ${tab.title.substring(
    0,
    50
  )}...\n Click again soon.`;
});

async function waitForResultsAndRender(interval = 200, timeout = 5000) {
  const start = Date.now();

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const tabId = tabs[0]?.id;
    const currentTabId = tabId;
    if (!tabId) {
      document.body.innerHTML = `<p style="text-align:center; font-weight:bold;">Unable to get active tab.</p>`;
      return;
    }

    const key = `fluffkiller_results_${tabId}`;

    const check = () => {
      chrome.storage.local.get([key], (result) => {
        const rawdata = result[key];

        // Case: No result stored = not an article
        if (rawdata === undefined) {
          document.body.innerHTML = `<div class="notarticle" style="width:10rem">
                        <p style="text-align:center; font-weight:bold;">This page is not an article.</p>
                        <button class="button" id="yes-it-is" style="display:flex; justify-content: center;">Yes it is!</button>
                    </div>`;
          return;
        }

        // Case: Still generating
        if (rawdata === "PENDING") {
          const checkElement = document.querySelector("p.check");
          if (checkElement) checkElement.textContent = "Generating...";

          if (Date.now() - start > timeout) {
            document.body.innerHTML = `<p style="text-align:center; font-weight:bold;">Timed out while waiting for results.</p>`;
            return;
          }

          setTimeout(check, interval);
          return;
        }

        // Case: Ready
        try {
          document.querySelector(
            "p.check"
          ).textContent = `Generated for tab: ${tabs[0].title.substring(
            0,
            50
          )}...`;
          const data = JSON.parse(rawdata);
          for (const item of data) {
            if (item.isFluff) {
              item.score = 1 - item.score;
            }
          }

          const scores = data.map((p) => p.score);
          const hist = makeDensityData(scores, 50);
          renderDistSVG(hist);
          lastHistData = hist;
          hydrateDebugToggle();
          renderTrash(currentTabId);
        } catch (err) {
          console.error("fluffkiller: Failed to parse relevance results", err);
          document.body.innerHTML = `<p style="text-align:center; font-weight:bold;">Error rendering data.</p>`;
        }
      });
    };

    check();
  });
}

function renderTrash(tabId) {
  const trashContainer = document.getElementById("trash-list");
  if (!trashContainer || !tabId) return;

  const key = `fluffkiller_trash_${tabId}`;
  chrome.storage.local.get([key], (res) => {
    let items = [];
    try {
      items = JSON.parse(res[key] || "[]");
    } catch (e) {
      items = [];
    }

    if (!Array.isArray(items) || items.length === 0) {
      trashContainer.innerHTML = `<p class="subtle">No hidden sentences.</p>`;
      return;
    }

    trashContainer.innerHTML = "";
    for (const item of items) {
      const div = document.createElement("div");
      div.className = "trash-item";

      const p = document.createElement("p");
      p.className = "trash-text";
      p.textContent = item.paragraph || item.sentence || "";
      div.appendChild(p);

      const meta = document.createElement("p");
      meta.className = "trash-score";
      meta.textContent = `Score: ${Number(item.score ?? 0).toFixed(2)}`;
      div.appendChild(meta);

      trashContainer.appendChild(div);
    }
  });
}

function hydrateDebugToggle() {
  const toggle = document.getElementById("debug-highlight-only");
  if (!toggle) return;
  chrome.storage.local.get(["fluffkiller_debug_highlight_only"], (res) => {
    const value = !!res["fluffkiller_debug_highlight_only"];
    highlightOnly = value;
    toggle.checked = value;
  });
  toggle.onchange = () => {
    highlightOnly = toggle.checked;
    chrome.storage.local.set({ fluffkiller_debug_highlight_only: highlightOnly });
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) return;
      chrome.tabs.sendMessage(tab.id, {
        type: "fluffkiller_SET_THRESHOLD",
        threshold: currentThreshold,
        highlightOnly,
      });
    });
  };
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;
    const key = `fluffkiller_trash_${tabId}`;
    if (changes[key]) {
      renderTrash(tabId);
    }
  });
});

document.addEventListener("DOMContentLoaded", waitForResultsAndRender);
if (document.readyState == "complete") {
  waitForResultsAndRender();
}

function makeDensityData(scores, steps = 100) {
  const sorted = scores.slice().sort((a, b) => a - b);
  const density = [];

  const min = 0,
    max = 1;
  const bandwidth = 0.05;

  for (let x = min; x <= max; x += (max - min) / steps) {
    let sum = 0;
    for (let s of sorted) {
      const u = (x - s) / bandwidth;
      sum += Math.exp(-0.5 * u * u);
    }
    density.push({
      x,
      y: sum / (sorted.length * bandwidth * Math.sqrt(2 * Math.PI)),
    });
  }

  return density;
}

function makeHistogram(scores, bins = 10) {
  const hist = new Array(bins).fill(0);
  for (const score of scores) {
    const index = Math.min(bins - 1, Math.floor(score * bins));
    hist[index]++;
  }
  return hist.map((count) => count / scores.length);
}

function renderDistSVG(data, threshold = 0.6) {
  lastHistData = data;
  const width = 300;
  const height = 150;
  const padding = 30;

  const graphTop = 0; // Top margin
  const graphHeight = height; // Vertical space for the curve

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height + 50);
  svg.innerHTML = ""; // clear

  const maxY = Math.max(...data.map((d) => d.y));
  const xScale = (x) => padding + x * (width - 2 * padding);
  const yScale = (y) => graphTop + graphHeight * (1 - y / maxY);

  const topY = yScale(maxY); // This is the highest visible point of the curve

  // Histogram bars behind the line
  const bins = 20;
  const binWidth = (width - 2 * padding) / bins;
  const histCounts = new Array(bins).fill(0);
  for (const d of data) {
    const binIdx = Math.min(bins - 1, Math.floor(d.x * bins));
    histCounts[binIdx] += d.y;
  }
  const histMax = Math.max(...histCounts, 1);
  histCounts.forEach((count, i) => {
    const x = padding + i * binWidth;
    const barHeight = graphHeight * (count / histMax);
    const y = graphTop + graphHeight - barHeight;
    const binStart = i / bins;
    const binEnd = (i + 1) / bins;
    const belowThreshold = binEnd <= threshold;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", binWidth - 2);
    rect.setAttribute("height", barHeight);
    rect.setAttribute(
      "fill",
      belowThreshold ? "rgba(239, 68, 68, 0.25)" : "rgba(59, 130, 246, 0.25)"
    );
    rect.setAttribute(
      "stroke",
      belowThreshold ? "rgba(239, 68, 68, 0.45)" : "rgba(59, 130, 246, 0.4)"
    );
    rect.setAttribute("stroke-width", "1");
    svg.appendChild(rect);
  });

  // Axis
  for (let i = 0; i <= 10; i++) {
    const x = padding + ((width - 2 * padding) * i) / 10;
    const label = (i / 10).toFixed(1);
    svg.innerHTML += `<text x="${x}" y="${
      height + 15
    }" text-anchor="middle" font-size="10" fill="#1f2937" opacity="0.75">${label}</text>`;
  }

  // Red fill rectangle (drawn before everything else)
  const redRect = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect"
  );
  redRect.setAttribute("x", padding);
  redRect.setAttribute("y", topY);
  redRect.setAttribute("width", xScale(threshold) - padding);
  redRect.setAttribute("height", height);
  redRect.setAttribute("fill", "rgba(255, 0, 0, 0.15)");
  svg.appendChild(redRect);

  // Red vertical threshold line
  const threshLine = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "line"
  );
  threshLine.setAttribute("x1", xScale(threshold));
  threshLine.setAttribute("x2", xScale(threshold));
  threshLine.setAttribute("y1", topY);
  threshLine.setAttribute("y2", height);
  threshLine.setAttribute("stroke", "red");
  threshLine.setAttribute("stroke-width", "2");
  svg.appendChild(threshLine);

  // Draggable threshold handle
  const handle = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle"
  );
  handle.setAttribute("cx", xScale(threshold));
  handle.setAttribute("cy", (topY + height) / 2);
  handle.setAttribute("r", 9);

  handle.setAttribute("fill", "red");
  handle.style.cursor = "ew-resize";
  svg.appendChild(handle);

  // DRAG BEHAVIOR
  let isDragging = false;

  handle.addEventListener("mousedown", () => {
    isDragging = true;
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const bounds = svg.getBoundingClientRect();
    const mouseX = e.clientX - bounds.left;
    let newX = Math.max(padding, Math.min(mouseX, width - padding));

    let newThreshold = (newX - padding) / (width - 2 * padding);
    newThreshold = Math.max(0, Math.min(1, newThreshold));
    currentThreshold = newThreshold;

    // Update visuals
    handle.setAttribute("cx", xScale(newThreshold));
    threshLine.setAttribute("x1", xScale(newThreshold));
    threshLine.setAttribute("x2", xScale(newThreshold));
    redRect.setAttribute("width", xScale(newThreshold) - padding);

    // Persist threshold and notify content script
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      const domain = new URL(tab.url).hostname;
      const key = `fluffkiller_threshold_${domain}`;
      chrome.storage.local.set({ [key]: newThreshold });
      chrome.tabs.sendMessage(tab.id, {
        type: "fluffkiller_SET_THRESHOLD",
        threshold: newThreshold,
        highlightOnly,
      });
    });

    const headerLabel = document.getElementById("threshold-label");
    if (headerLabel) {
      headerLabel.textContent = newThreshold.toFixed(2);
    }

    if (lastHistData) {
      renderDistSVG(lastHistData, newThreshold);
    }
  });

  // Title
  const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
  title.setAttribute("x", width / 2);
  title.setAttribute("y", padding - 30);
  title.setAttribute("text-anchor", "middle");
  title.setAttribute("font-size", "14");
  title.textContent = "Relevance Score Density";
  svg.appendChild(title);

  // Paths: split line into below/above threshold segments
  const paths = { below: "", above: "" };
  data.forEach((d, i) => {
    const segment = d.x <= threshold ? "below" : "above";
    const cmd = `${paths[segment] ? "L" : "M"} ${xScale(d.x)} ${yScale(d.y)}`;
    paths[segment] += (paths[segment] ? " " : "") + cmd;
  });

  const lineBelow = document.createElementNS("http://www.w3.org/2000/svg", "path");
  lineBelow.setAttribute("d", paths.below);
  lineBelow.setAttribute("fill", "none");
  lineBelow.setAttribute("stroke", "red");
  lineBelow.setAttribute("stroke-width", "2");
  lineBelow.setAttribute("stroke-linejoin", "round");
  lineBelow.setAttribute("stroke-linecap", "round");
  svg.appendChild(lineBelow);

  const lineAbove = document.createElementNS("http://www.w3.org/2000/svg", "path");
  lineAbove.setAttribute("d", paths.above);
  lineAbove.setAttribute("fill", "none");
  lineAbove.setAttribute("stroke", "steelblue");
  lineAbove.setAttribute("stroke-width", "2");
  lineAbove.setAttribute("stroke-linejoin", "round");
  lineAbove.setAttribute("stroke-linecap", "round");
  svg.appendChild(lineAbove);

  // Replace old SVG
  const graphContainer =
    document.getElementById("graph-container") ||
    (() => {
      const div = document.createElement("div");
      div.id = "graph-container";
      document.body.appendChild(div);
      return div;
    })();
  graphContainer.innerHTML = "";

  graphContainer.appendChild(svg);

  // Slider behavior
}

function renderHistogramSVG(hist) {
  const width = 400;
  const height = 150;
  const margin = { top: 20, right: 20, bottom: 30, left: 30 };

  const svg = d3
    .select("body")
    .append("svg")
    .attr("id", "fluffkiller-histogram")
    .attr("width", width)
    .attr("height", height + margin.top + margin.bottom)
    .style("display", "block")
    .style("margin", "20px auto")
    .style("border", "1px solid #ccc");

  const x = d3
    .scaleLinear()
    .domain([0, hist.length])
    .range([margin.left, width - margin.right]);

  const y = d3
    .scaleLinear()
    .domain([0, d3.max(hist)])
    .range([height, margin.top]);

  const barWidth = (width - margin.left - margin.right) / hist.length;

  svg
    .selectAll("rect")
    .data(hist)
    .enter()
    .append("rect")
    .attr("x", (_, i) => x(i))
    .attr("y", (d) => y(d))
    .attr("width", barWidth - 2)
    .attr("height", (d) => height - y(d))
    .attr("fill", "#4a90e2");

  const xAxis = d3
    .axisBottom(
      d3
        .scaleLinear()
        .domain([0, 1])
        .range([margin.left, width - margin.right])
    )
    .ticks(hist.length)
    .tickFormat((d) => d.toFixed(1));

  svg.append("g").attr("transform", `translate(0, ${height})`).call(xAxis);

  const title = svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", margin.top)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("Relevance Score Distribution");
}
