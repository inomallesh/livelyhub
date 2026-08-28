import {
  claimFileLock,
  refreshFileLock,
  releaseFileLock,
  updateFileContent,
  watchFile,
  LOCK_IDLE_TIMEOUT_MS,
  WARNING_WINDOW_MS,
} from "./roomUtils.js";
import { encryptText, decryptText } from "./crypto.js";
import { notifyEditingStarted, clearEditingNotice } from "./notifications.js";
import { loadMonaco } from "./monacoLoader.js";
import { languageFor } from "./languages.js";

const els = {
  tabBar: document.getElementById("tabBar"),
  emptyState: document.getElementById("editorEmptyState"),
  currentFileLabel: document.getElementById("currentFileLabel"),
  splitBtn: document.getElementById("splitBtn"),
  panesWrap: document.getElementById("panesWrap"),
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  doneBtn: document.getElementById("doneBtn"),
};

let monaco = null;
let code = null;
let me = null;

// One "session" per open file: its Monaco model persists across pane
// switches (so undo history/cursor/scroll position survive), plus its own
// Firebase subscription and lock state — independent of which pane (if any)
// currently displays it.
const sessions = new Map(); // fileId -> session
let openOrder = []; // tab order, array of fileId

// Up to two panes, left always exists once initialized, right only when split.
const panes = {
  left: null,
  right: null,
};
let activePaneId = "left";

const listeners = new Set(); // notified with the active pane's fileId whenever it changes

export function onActiveFileChange(fn) {
  listeners.add(fn);
}

export function getActiveFileId() {
  return panes[activePaneId]?.fileId || null;
}

export function getActiveFileName() {
  const fileId = getActiveFileId();
  return fileId ? sessions.get(fileId)?.name : null;
}

export function getActiveFileContent() {
  const session = sessions.get(getActiveFileId());
  return session ? session.model.getValue() : "";
}

export async function initFileEditor(roomCode, meIdentity) {
  code = roomCode;
  me = meIdentity;

  monaco = await loadMonaco();

  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  monaco.editor.defineTheme("lh-dark", { base: "vs-dark", inherit: true, rules: [], colors: {} });
  monaco.editor.defineTheme("lh-light", { base: "vs", inherit: true, rules: [], colors: {} });

  panes.left = createPane("left", isDark);

  els.splitBtn.addEventListener("click", toggleSplit);
  els.doneBtn.addEventListener("click", () => {
    const fileId = getActiveFileId();
    if (fileId) releaseFileLock(code, fileId, me.userId);
  });
}

function createPane(paneId, isDark) {
  const container = document.getElementById(
    paneId === "left" ? "monacoContainerLeft" : "monacoContainerRight"
  );
  const wrap = document.getElementById(paneId === "left" ? "paneLeft" : "paneRight");
  const claimHint = wrap.querySelector(".claim-hint");
  const decryptError = wrap.querySelector(".decrypt-error");

  const editorInstance = monaco.editor.create(container, {
    value: "",
    language: "javascript",
    theme: isDark ? "lh-dark" : "lh-light",
    automaticLayout: true,
    readOnly: true,
    minimap: { enabled: false },
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: 14,
    scrollBeyondLastLine: false,
    padding: { top: 16 },
  });

  const pane = { id: paneId, wrap, container, claimHint, decryptError, editorInstance, fileId: null };

  // Fixed: bind to the DOM node directly (capture phase), so this fires even
  // when Monaco's own read-only guard would otherwise intercept the click
  // before its internal onMouseDown fires.
  container.addEventListener(
    "mousedown",
    () => {
      setActivePane(paneId);
      const fileId = pane.fileId;
      if (!fileId) return;
      const session = sessions.get(fileId);
      if (session && isClaimable(session)) {
        // Claim optimistically: flip editable + treat it as ours locally
        // right away, instead of waiting on the Firebase round-trip. Without
        // this, a fast click-then-type could land while readOnly was still
        // true (Monaco blocks it with its own tooltip) and, separately, our
        // own content-push guard was checking the stale pre-claim lock and
        // silently dropping the keystroke even after readOnly flipped. The
        // real Firebase confirmation still happens in the background and
        // self-corrects moments later via handleFileUpdate if the claim
        // actually lost a race to someone else.
        session.lock = { userId: me.userId, name: me.name, color: me.color, lastActiveAt: Date.now() };
        for (const pid of ["left", "right"]) {
          const p = panes[pid];
          if (p && p.fileId === fileId) {
            p.editorInstance.updateOptions({ readOnly: false });
            updatePaneChrome(p, session);
          }
        }
        if (getActiveFileId() === fileId) renderSharedStatus();
        scheduleLockTimers(fileId, session);

        claimFileLock(code, fileId, me.userId, me.color);
      }
    },
    true // capture phase — runs before Monaco's internal handling
  );

  editorInstance.onDidChangeModelContent(() => {
    const session = sessions.get(pane.fileId);
    if (!session || session.applyingRemoteChange) return;
    handleLocalEdit(pane.fileId, session);
  });

  return pane;
}

function isClaimable(session) {
  if (session.decryptFailed) return false;
  if (!session.lock) return true;
  return Date.now() - session.lock.lastActiveAt > LOCK_IDLE_TIMEOUT_MS;
}

function setActivePane(paneId) {
  if (!panes[paneId]) return;
  activePaneId = paneId;
  panes.left.wrap.classList.toggle("pane-active", paneId === "left");
  if (panes.right) panes.right.wrap.classList.toggle("pane-active", paneId === "right");
  renderSharedStatus();
  listeners.forEach((fn) => fn(getActiveFileId()));
}

// -------------------- Opening / closing / switching files --------------------

export async function openFile(fileId, fileName, { split = false } = {}) {
  if (!sessions.has(fileId)) {
    const lang = languageFor(fileName);
    const model = monaco.editor.createModel("", lang.monacoId);
    const session = {
      name: fileName,
      model,
      lock: null,
      decryptFailed: false,
      applyingRemoteChange: false,
      warnTimer: null,
      releaseTimer: null,
      unwatch: null,
    };
    sessions.set(fileId, session);
    session.unwatch = watchFile(code, fileId, (file) => handleFileUpdate(fileId, session, file));
    openOrder.push(fileId);
  }

  let targetPaneId = split ? "right" : activePaneId;
  if (split && !panes.right) {
    panes.right = createPane("right", document.documentElement.getAttribute("data-theme") !== "light");
    els.panesWrap.classList.add("split-active");
    els.splitBtn.classList.add("active-toggle");
  }

  showFileInPane(targetPaneId, fileId);
  setActivePane(targetPaneId);
  renderTabs();
}

function showFileInPane(paneId, fileId) {
  const pane = panes[paneId];
  const session = sessions.get(fileId);
  if (!pane || !session) return;

  pane.fileId = fileId;
  pane.editorInstance.setModel(session.model);
  pane.editorInstance.updateOptions({ readOnly: !isMine(session) });
  updatePaneChrome(pane, session);

  els.emptyState.style.display = "none";
  els.panesWrap.style.display = "flex";
  els.currentFileLabel.textContent = session.name;
}

function isMine(session) {
  return session.lock?.userId === me.userId;
}

export function closeTab(fileId) {
  const session = sessions.get(fileId);
  if (!session) return;

  if (isMine(session)) releaseFileLock(code, fileId, me.userId);
  if (session.unwatch) session.unwatch();
  clearTimeout(session.warnTimer);
  clearTimeout(session.releaseTimer);
  session.model.dispose();
  sessions.delete(fileId);
  openOrder = openOrder.filter((id) => id !== fileId);

  // If either pane was showing this file, move it to another open tab (or empty).
  for (const paneId of ["left", "right"]) {
    const pane = panes[paneId];
    if (pane && pane.fileId === fileId) {
      const next = openOrder[openOrder.length - 1] || null;
      if (next) {
        showFileInPane(paneId, next);
      } else if (paneId === "right") {
        collapseSplit();
      } else {
        pane.fileId = null;
        els.emptyState.style.display = "flex";
        els.panesWrap.style.display = "none";
        els.currentFileLabel.textContent = "No file open";
      }
    }
  }

  if (activePaneId === "right" && !panes.right) activePaneId = "left";
  renderTabs();
  renderSharedStatus();
  listeners.forEach((fn) => fn(getActiveFileId()));
}

function toggleSplit() {
  if (panes.right) {
    collapseSplit();
  } else if (openOrder.length > 0) {
    // Split the currently-active file's neighboring tab into a new right pane,
    // falling back to the same file if it's the only tab open.
    const currentId = getActiveFileId();
    const other = openOrder.find((id) => id !== currentId) || currentId;
    const session = sessions.get(other);
    openFile(other, session.name, { split: true });
  }
}

function collapseSplit() {
  if (!panes.right) return;
  panes.right.editorInstance.dispose();
  panes.right = null;
  els.panesWrap.classList.remove("split-active");
  els.splitBtn.classList.remove("active-toggle");
  activePaneId = "left";
  renderSharedStatus();
  listeners.forEach((fn) => fn(getActiveFileId()));
}

// -------------------- Remote updates (content + lock) --------------------

async function handleFileUpdate(fileId, session, file) {
  if (!file) return; // deleted out from under us — tab stays but is now stale; closing is manual

  const iAmEditor = file.activeEditor?.userId === me.userId;
  if (!iAmEditor) {
    try {
      const plaintext = await decryptText(code, file.content || "");
      if (session.model.getValue() !== plaintext) {
        session.applyingRemoteChange = true;
        session.model.setValue(plaintext);
        session.applyingRemoteChange = false;
      }
      session.decryptFailed = false;
    } catch {
      session.decryptFailed = true;
    }
  }

  const newOwner = file.activeEditor?.userId || null;
  const previousOwner = session.lock?.userId || null;
  const shownInActivePane = getActiveFileId() === fileId;
  if (newOwner !== previousOwner) {
    if (newOwner && newOwner !== me.userId && shownInActivePane) {
      notifyEditingStarted(file.activeEditor.name || "Someone");
    }
    if ((!newOwner || newOwner === me.userId) && shownInActivePane) {
      clearEditingNotice();
    }
  }

  session.lock = file.activeEditor || null;

  // Update readOnly + border state on whichever pane(s) currently show this file.
  for (const paneId of ["left", "right"]) {
    const pane = panes[paneId];
    if (pane && pane.fileId === fileId) {
      pane.editorInstance.updateOptions({ readOnly: !isMine(session) });
      updatePaneChrome(pane, session);
    }
  }

  scheduleLockTimers(fileId, session);
  renderTabs();
  if (shownInActivePane) renderSharedStatus();
}

function scheduleLockTimers(fileId, session) {
  clearTimeout(session.warnTimer);
  clearTimeout(session.releaseTimer);
  if (!session.lock) return;

  const elapsed = Date.now() - session.lock.lastActiveAt;
  const remaining = LOCK_IDLE_TIMEOUT_MS - elapsed;
  if (remaining <= 0) return;

  const warnIn = Math.max(remaining - WARNING_WINDOW_MS, 0);
  session.warnTimer = setTimeout(() => {
    for (const paneId of ["left", "right"]) {
      const pane = panes[paneId];
      if (pane && pane.fileId === fileId) updatePaneChrome(pane, session, true);
    }
    if (getActiveFileId() === fileId) renderSharedStatus(true);
  }, warnIn);

  session.releaseTimer = setTimeout(() => {
    for (const paneId of ["left", "right"]) {
      const pane = panes[paneId];
      if (pane && pane.fileId === fileId) updatePaneChrome(pane, session);
    }
    if (getActiveFileId() === fileId) renderSharedStatus();
  }, remaining);
}

// -------------------- Rendering --------------------

function updatePaneChrome(pane, session, amberWarn = false) {
  pane.wrap.classList.remove("state-green", "state-red", "state-amber");
  pane.claimHint.classList.remove("visible");
  pane.decryptError.style.display = session.decryptFailed ? "flex" : "none";
  pane.container.style.visibility = session.decryptFailed ? "hidden" : "visible";

  if (session.decryptFailed) return;

  if (!session.lock) {
    pane.wrap.classList.add("state-green");
    pane.claimHint.classList.add("visible");
    return;
  }

  const elapsed = Date.now() - session.lock.lastActiveAt;
  if (elapsed > LOCK_IDLE_TIMEOUT_MS) {
    pane.wrap.classList.add("state-green");
    pane.claimHint.classList.add("visible");
    return;
  }

  pane.wrap.classList.add(amberWarn ? "state-amber" : "state-red");
}

function renderSharedStatus(amberWarn = false) {
  const fileId = getActiveFileId();
  const session = sessions.get(fileId);
  els.doneBtn.classList.remove("visible");

  if (!session) {
    els.statusDot.style.background = "transparent";
    els.statusText.textContent = "";
    return;
  }

  if (session.decryptFailed) {
    els.statusDot.style.background = "var(--red)";
    els.statusText.textContent = "Couldn't decrypt this file";
    return;
  }

  if (!session.lock || Date.now() - session.lock.lastActiveAt > LOCK_IDLE_TIMEOUT_MS) {
    els.statusDot.style.background = "var(--green)";
    els.statusText.textContent = "Open — click to claim";
    return;
  }

  const mine = isMine(session);
  els.statusDot.style.background = amberWarn ? "var(--amber)" : "var(--red)";
  if (mine) {
    els.statusText.textContent = amberWarn
      ? "Keep typing or you'll lose the pen..."
      : "You're editing";
    els.doneBtn.classList.add("visible");
  } else {
    els.statusText.textContent = `${session.lock.name || "Someone"} is editing`;
  }
}

function renderTabs() {
  els.tabBar.innerHTML = openOrder
    .map((fileId) => {
      const session = sessions.get(fileId);
      if (!session) return "";
      const isActive = getActiveFileId() === fileId;
      const lockDot = session.lock && !isMine(session)
        ? `<span class="tab-lock-dot" style="background:${session.lock.color};"></span>`
        : "";
      return `
        <div class="tab-chip ${isActive ? "tab-chip-active" : ""}" data-id="${fileId}">
          <span class="tab-name">${escapeHtml(session.name)}</span>
          ${lockDot}
          <button class="tab-close-btn" data-action="close" data-id="${fileId}" title="Close tab">✕</button>
        </div>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

els.tabBar.addEventListener("click", (e) => {
  const closeBtn = e.target.closest(".tab-close-btn");
  if (closeBtn) {
    e.stopPropagation();
    closeTab(closeBtn.dataset.id);
    return;
  }
  const chip = e.target.closest(".tab-chip");
  if (chip) {
    const fileId = chip.dataset.id;
    const session = sessions.get(fileId);
    if (session) showFileInPane(activePaneId, fileId);
    renderTabs();
    renderSharedStatus();
    listeners.forEach((fn) => fn(getActiveFileId()));
  }
});

export function setEditorTheme(isDark) {
  if (!monaco) return;
  monaco.editor.setTheme(isDark ? "lh-dark" : "lh-light");
}

async function handleLocalEdit(fileId, session) {
  if (!isMine(session)) return;
  const ciphertext = await encryptText(code, session.model.getValue());
  await updateFileContent(code, fileId, ciphertext);
  await refreshFileLock(code, fileId, me.userId);
}
