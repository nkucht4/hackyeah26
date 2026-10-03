let enabledSites = ["mail.google.com"];
let tooltip = null;
let activeEditor = null;
let activeIssues = [];
let selectionRange = null;
let selectionTarget = null;
let hideTimer = null;

async function loadSettings() {
  const data = await browser.storage.local.get({ enabledSites: ["mail.google.com"] });
  enabledSites = data.enabledSites || ["mail.google.com"];
}

function normalizeDomain(domain) {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

function siteEnabled() {
  const host = location.hostname.toLowerCase();
  return enabledSites.some(site => {
    const d = normalizeDomain(site);
    return host === d || host.endsWith("." + d);
  });
}

async function analyzeText(text) {
  return analyzeTextBackend(text);
}


async function analyzeTextBackend(text) {
  try {
    const response = await fetch("https://leonore-untrading-laurence.ngrok-free.dev/api/v1/correction", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text })
    });

    const body = await response.text();

    console.log("Directly backend status:", response.status);
    console.log("Directly backend response:", body);

    if (!response.ok) {
      throw new Error(`Backend ${response.status}: ${body}`);
    }

    const data = JSON.parse(body);

    return (data.corrections || []).map((correction, index) => ({
      id: `backend-${Date.now()}-${index}`,
      start: correction.start,
      end: correction.end,
      text: correction.original,
      type: (correction.labels || []).join(", "),
      reason: correction.reason,
      replacement: correction.suggested
    }));
  } catch (error) {
    console.error("Directly backend error:", error);
    throw error;
  }
}

function analyzeTextLocally(text) {
  const rules = [
    [/przepraszam,?\s+że\s+zawracam\s+głowę/gi, "Unnecessary apology", "Nie musisz przepraszać za zajmowanie czyjegoś czasu.", ""],
    [/przepraszam\s+za\s+kłopot/gi, "Unnecessary apology", "Ta formuła niepotrzebnie osłabia komunikat.", ""],
    [/chciałam\s+tylko\s+zapytać/gi, "Minimizer", "„Tylko” umniejsza znaczenie pytania.", "chciałam zapytać"],
    [/chciałem\s+tylko\s+zapytać/gi, "Minimizer", "„Tylko” umniejsza znaczenie pytania.", "chciałem zapytać"],
    [/\btylko\b/gi, "Minimizer", "„Tylko” może niepotrzebnie zmniejszać wagę komunikatu.", ""],
    [/wydaje\s+mi\s+się,?\s+że/gi, "Hedging", "Ta konstrukcja dodaje niepewność.", "uważam, że"],
    [/może\s+mogłaby/gi, "Hedging", "„Może mogłaby” brzmi niepewnie.", "czy mogłaby"],
    [/może\s+mógłby/gi, "Hedging", "„Może mógłby” brzmi niepewnie.", "czy mógłby"],
    [/jeśli\s+to\s+możliwe/gi, "Hedging", "Ta formuła może niepotrzebnie osłabiać prośbę.", ""],
    [/w\s+wolnej\s+chwili/gi, "Vague timeline", "Niejasny termin utrudnia zrozumienie oczekiwania.", "do [konkretnego terminu]"]
  ];

  const issues = [];

  for (const [pattern, type, reason, replacement] of rules) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      issues.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        type,
        reason,
        replacement
      });
    }
  }

  issues.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);

  const result = [];
  for (const issue of issues) {
    if (!result.some(x => issue.start < x.end && issue.end > x.start)) result.push(issue);
  }

  return result.sort((a, b) => a.start - b.start);
}

async function runAnalysis(text) {
  if (!text?.trim()) return { text, issues: [] };
  try {
    return { text, issues: await analyzeText(text) };
  } catch {
    return { text, issues: [], error: true };
  }
}

function getEditors() {
  return [...document.querySelectorAll(
    '[contenteditable="true"],textarea,[contenteditable="true"][role="textbox"]'
  )].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

function addButton(editor) {
  if (editor.dataset.directlyReady) return;
  const parent = editor.parentElement;
  if (!parent) return;

  editor.dataset.directlyReady = "1";

  if (getComputedStyle(parent).position === "static")
    parent.style.position = "relative";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "directly-check-button";
  button.title = "Check my tone";

  const logo = document.createElement("img");
  logo.src = browser.runtime.getURL("logo.png");
  logo.alt = "Directly";
  button.appendChild(logo);

  button.onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    activeEditor = editor;
    analyzeEditor(editor);
  };

  parent.appendChild(button);
}

async function analyzeEditor(editor) {
  activeEditor = editor;

  const text = getText(editor);
  if (!text.trim()) return showSuccess(editor, "Nothing to check yet.");

  const result = await runAnalysis(text);

  if (result.error) return showSuccess(editor, "Could not analyze this text.");
  if (!result.issues.length) return showSuccess(editor, "Looks good. No obvious issues found.");

  activeIssues = result.issues;
  renderText(editor, text, activeIssues);
}

function getText(el) {
  return el instanceof HTMLTextAreaElement ? el.value : el.innerText || "";
}

function appendTextWithBreaks(parent, text) {
  const parts = text.split("\n");

  parts.forEach((part, i) => {
    if (part) parent.append(document.createTextNode(part));
    if (i < parts.length - 1) parent.append(document.createElement("br"));
  });
}

function renderText(editor, text, issues) {
  if (editor instanceof HTMLTextAreaElement) {
    renderTextarea(editor, text, issues);
    return;
  }

  editor.innerHTML = "";
  let cursor = 0;

  for (const issue of issues) {
    if (issue.start > cursor) {
      appendTextWithBreaks(editor, text.slice(cursor, issue.start));
    }

    const span = document.createElement("span");
    span.className = "directly-highlight";
    span.dataset.id = issue.id;
    appendTextWithBreaks(span, text.slice(issue.start, issue.end));

    span.onclick = e => {
      e.stopPropagation();
      showTooltip(issue, span);
    };

    editor.append(span);
    cursor = issue.end;
  }

  if (cursor < text.length) {
    appendTextWithBreaks(editor, text.slice(cursor));
  }

  dispatchInput(editor);
}

function replaceTextRange(root, start, end, replacement) {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT
  );

  const nodes = [];
  let node;

  while ((node = walker.nextNode())) {
    nodes.push(node);
  }

  let position = 0;
  let startNode = null;
  let endNode = null;
  let startOffset = 0;
  let endOffset = 0;

  for (const textNode of nodes) {
    const nextPosition = position + textNode.nodeValue.length;

    if (!startNode && start >= position && start <= nextPosition) {
      startNode = textNode;
      startOffset = start - position;
    }

    if (end >= position && end <= nextPosition) {
      endNode = textNode;
      endOffset = end - position;
      break;
    }

    position = nextPosition;
  }

  if (!startNode || !endNode) return false;

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);

  range.deleteContents();
  range.insertNode(document.createTextNode(replacement));

  return true;
}

function renderTextarea(editor, text, issues) {
  editor.dataset.directlyText = text;
  editor.dataset.directlyIssues = JSON.stringify(issues);

  const rect = editor.getBoundingClientRect();
  const overlay = document.createElement("div");
  overlay.className = "directly-textarea-overlay";
  overlay.style.position = "fixed";
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  overlay.style.pointerEvents = "none";
  overlay.style.whiteSpace = "pre-wrap";
  overlay.style.overflow = "hidden";
  overlay.style.font = getComputedStyle(editor).font;
  overlay.style.lineHeight = getComputedStyle(editor).lineHeight;
  overlay.style.padding = getComputedStyle(editor).padding;
  overlay.style.boxSizing = "border-box";
  overlay.style.color = "transparent";
  overlay.style.zIndex = "999998";

  let html = "";
  let cursor = 0;

  for (const issue of issues) {
    html += escapeHtml(text.slice(cursor, issue.start));
    html += `<span class="directly-highlight" data-id="${issue.id}" style="pointer-events:auto;color:inherit">${escapeHtml(text.slice(issue.start, issue.end))}</span>`;
    cursor = issue.end;
  }

  html += escapeHtml(text.slice(cursor));
  overlay.innerHTML = html;

  document.body.appendChild(overlay);

  overlay.querySelectorAll(".directly-highlight").forEach(span => {
    const issue = issues.find(x => x.id === span.dataset.id);
    span.onclick = e => {
      e.stopPropagation();
      showTooltip(issue, span);
    };
  });

  editor._directlyOverlay?.remove();
  editor._directlyOverlay = overlay;
}

function showTooltip(issue, target) {
  clearTimeout(hideTimer);
  tooltip?.remove();

  tooltip = document.createElement("div");
  tooltip.className = "directly-tooltip";
  tooltip.innerHTML = `
    <div class="directly-tooltip-category">${escapeHtml(issue.type)}</div>
    <button class="directly-tooltip-close">×</button>
    <div class="directly-tooltip-title">Directly suggestion</div>
    <div class="directly-tooltip-reason">${escapeHtml(issue.reason)}</div>
    <div class="directly-tooltip-label">SUGGESTED CHANGE</div>
    <div class="directly-tooltip-change">
      <span class="directly-old">${escapeHtml(issue.text)}</span>
      <span class="directly-new">${issue.replacement ? escapeHtml(issue.replacement) : "delete"}</span>
    </div>
    <div class="directly-tooltip-actions">
      <button class="directly-accept">Accept</button>
      <button class="directly-reject">Reject</button>
    </div>
  `;

  document.body.appendChild(tooltip);

  const r = target.getBoundingClientRect();
  const tr = tooltip.getBoundingClientRect();

  let left = Math.min(r.left, innerWidth - tr.width - 20);
  let top = r.bottom + 8;

  if (top + tr.height > innerHeight - 20) top = r.top - tr.height - 8;

  tooltip.style.left = `${Math.max(20, left)}px`;
  tooltip.style.top = `${Math.max(20, top)}px`;

  tooltip.onmouseenter = () => clearTimeout(hideTimer);
  tooltip.onmouseleave = scheduleHide;

  tooltip.querySelector(".directly-tooltip-close").onclick = removeTooltip;
  tooltip.querySelector(".directly-accept").onclick = () => acceptIssue(issue);
  tooltip.querySelector(".directly-reject").onclick = () => rejectIssue(issue);
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(removeTooltip, 250);
}

function removeTooltip() {
  tooltip?.remove();
  tooltip = null;
}

function acceptIssue(issue) {
  const editor = activeEditor;
  if (!editor) return;

  if (editor instanceof HTMLTextAreaElement) {
    const text = getText(editor);

    if (
      issue.start < 0 ||
      issue.end > text.length ||
      text.slice(issue.start, issue.end) !== issue.text
    ) {
      removeTooltip();
      return;
    }

    const value =
      text.slice(0, issue.start) +
      issue.replacement +
      text.slice(issue.end);

    editor.value = value;
    editor._directlyOverlay?.remove();

    activeIssues = activeIssues.filter(x => x.id !== issue.id);

    if (activeIssues.length) {
      renderTextarea(editor, value, activeIssues);
    }
  } else {
    const highlight = [...editor.querySelectorAll(".directly-highlight")]
      .find(el => el.dataset.id === issue.id);

    if (!highlight) {
      removeTooltip();
      return;
    }

    const replacement = document.createTextNode(issue.replacement || "");
    highlight.replaceWith(replacement);

    activeIssues = activeIssues.filter(x => x.id !== issue.id);
  }

  dispatchInput(editor);
  removeTooltip();
}

function rejectIssue(issue) {
  activeIssues = activeIssues.filter(x => x.id !== issue.id);
  const editor = activeEditor;

  if (editor) renderText(editor, getText(editor), activeIssues);
  removeTooltip();
}

function saveSelection() {
  const sel = window.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed) return;

  const range = sel.getRangeAt(0);
  const node = range.commonAncestorContainer.nodeType === 3
    ? range.commonAncestorContainer.parentElement
    : range.commonAncestorContainer;

  if (!node) return;

  selectionRange = range.cloneRange();
  selectionTarget = node.closest?.('[contenteditable="true"]') || null;
}

async function analyzeSelection(text) {
  if (!text?.trim()) return;

  const result = await runAnalysis(text);

  if (result.error) return;
  if (!result.issues.length) return showSelectionSuccess();

  activeIssues = result.issues;

  if (selectionTarget && selectionRange) {
    activeEditor = selectionTarget;
    renderSelection(selectionRange, text, activeIssues);
  }
}

function renderSelection(range, text, issues) {
  const fragment = document.createDocumentFragment();
  let cursor = 0;

  for (const issue of issues) {
    if (issue.start > cursor) fragment.append(document.createTextNode(text.slice(cursor, issue.start)));

    const span = document.createElement("span");
    span.className = "directly-highlight";
    span.textContent = text.slice(issue.start, issue.end);
    span.onclick = e => {
      e.stopPropagation();
      showTooltip(issue, span);
    };

    fragment.append(span);
    cursor = issue.end;
  }

  if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));

  range.deleteContents();
  range.insertNode(fragment);
  dispatchInput(selectionTarget);
}

function showSelectionSuccess() {
  const el = document.createElement("div");
  el.className = "directly-success";
  el.textContent = "✓ Looks good. No obvious issues found.";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function dispatchInput(el) {
  try {
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  } catch {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function showSuccess(editor, message) {
  const el = document.createElement("div");
  el.className = "directly-success";
  el.textContent = `✓ ${message}`;
  const r = editor.getBoundingClientRect();
  el.style.position = "fixed";
  el.style.left = `${r.left}px`;
  el.style.top = `${r.bottom + 10}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener("selectionchange", saveSelection, true);

browser.runtime.onMessage.addListener(message => {
  if (message?.type === "DIRECTLY_ANALYZE_SELECTION") {
    analyzeSelection(message.text || window.getSelection()?.toString() || "");
  }
});

document.addEventListener("focusin", e => {
  const editor = e.target.closest?.('[contenteditable="true"],textarea');
  if (editor) activeEditor = editor;
}, true);

function init() {
  const observer = new MutationObserver(() => getEditors().forEach(addButton));
  observer.observe(document.body, { childList: true, subtree: true });
  getEditors().forEach(addButton);
}

async function start() {
  await loadSettings();
  if (siteEnabled()) init();
}

start();