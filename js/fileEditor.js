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
  panel: document.getElementById("editorPanel"),
  container: document.getElementById("monacoContainer"),
  claimHint: document.getElementById("claimHint"),
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  doneBtn: document.getElementById("doneBtn"),
  decryptError: document.getElementById("decryptError"),
  currentFileLabel: document.getElementById("currentFileLabel"),
  emptyState: document.getElementById("editorEmptyState"),
};

let monaco = null;
let editorInstance = null;
let code = null;
let me = null;

let activeFileId = null;
let activeFileName = null;
let unwatchFile = null;
let warnTimer = null;
let releaseTimer = null;
let activeEditorLock = null;
let decryptFailed = false;
let applyingRemoteChange = false;

const listeners = new Set(); // notified with (fileId) whenever the open file changes

export function onActiveFileChange(fn) {
  listeners.add(fn);
}

export function getActiveFileId() {
  return activeFileId;
}

export function getActiveFileName() {
  return activeFileName;
}

export function getActiveFileContent() {
  return editorInstance ? editorInstance.getValue() : "";
}

export async function initFileEditor(roomCode, meIdentity) {
  code = roomCode;
  me = meIdentity;

  monaco = await loadMonaco();

  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  monaco.editor.defineTheme("lh-dark", { base: "vs-dark", inherit: true, rules: [], colors: {} });
  monaco.editor.defineTheme("lh-light", { base: "vs", inherit: true, rules: [], colors: {} });

  editorInstance = monaco.editor.create(els.container, {
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

  editorInstance.onDidChangeModelContent(() => {
    if (applyingRemoteChange) return;
    handleLocalEdit();
  });

  editorInstance.onMouseDown(() => {
    if (isClaimable()) handleClaimClick();
  });

  els.doneBtn.addEventListener("click", () => {
    if (activeFileId) releaseFileLock(code, activeFileId, me.userId);
  });
}

export function setEditorTheme(isDark) {
  if (!monaco) return;
  monaco.editor.setTheme(isDark ? "lh-dark" : "lh-light");
}

export async function openFile(fileId, fileName) {
  if (activeFileId === fileId) return;

  // Release our own lock on whatever file we're leaving, if we held it.
  if (activeFileId && activeEditorLock?.userId === me.userId) {
    releaseFileLock(code, activeFileId, me.userId);
  }
  if (unwatchFile) unwatchFile();

  activeFileId = fileId;
  activeFileName = fileName;
  activeEditorLock = null;
  decryptFailed = false;

  els.panel.style.display = "flex";
  els.emptyState.style.display = "none";
  els.currentFileLabel.textContent = fileName;

  const lang = languageFor(fileName);
  const model = editorInstance.getModel();
  monaco.editor.setModelLanguage(model, lang.monacoId);

  editorInstance.updateOptions({ readOnly: true });
  applyingRemoteChange = true;
  editorInstance.setValue("");
  applyingRemoteChange = false;

  unwatchFile = watchFile(code, fileId, (file) => handleFileUpdate(file));

  listeners.forEach((fn) => fn(fileId));
}

export function closeFile() {
  if (activeFileId && activeEditorLock?.userId === me?.userId) {
    releaseFileLock(code, activeFileId, me.userId);
  }
  if (unwatchFile) unwatchFile();
  activeFileId = null;
  activeFileName = null;
  activeEditorLock = null;
  els.panel.style.display = "none";
  els.emptyState.style.display = "flex";
  listeners.forEach((fn) => fn(null));
}

async function handleFileUpdate(file) {
  if (!file) return; // file was deleted out from under us

  const iAmEditor = file.activeEditor?.userId === me.userId;
  if (!iAmEditor) {
    try {
      const plaintext = await decryptText(code, file.content || "");
      if (editorInstance.getValue() !== plaintext) {
        applyingRemoteChange = true;
        editorInstance.setValue(plaintext);
        applyingRemoteChange = false;
      }
      hideDecryptError();
    } catch {
      showDecryptError();
    }
  }

  const newOwner = file.activeEditor?.userId || null;
  const previousOwner = activeEditorLock?.userId || null;
  if (newOwner !== previousOwner) {
    if (newOwner && newOwner !== me.userId) {
      notifyEditingStarted(file.activeEditor.name || "Someone");
    }
    if (!newOwner || newOwner === me.userId) {
      clearEditingNotice();
    }
  }

  activeEditorLock = file.activeEditor || null;
  render();
}

function showDecryptError() {
  decryptFailed = true;
  els.decryptError.style.display = "flex";
  editorInstance.updateOptions({ readOnly: true });
  els.container.style.visibility = "hidden";
}

function hideDecryptError() {
  if (!decryptFailed) return;
  decryptFailed = false;
  els.decryptError.style.display = "none";
  els.container.style.visibility = "visible";
}

function isClaimable() {
  return els.claimHint.classList.contains("visible") && !decryptFailed;
}

function render() {
  clearTimeout(warnTimer);
  clearTimeout(releaseTimer);

  const iAmEditor = activeEditorLock?.userId === me.userId;
  editorInstance.updateOptions({ readOnly: !iAmEditor });

  if (!activeEditorLock) {
    setState("green");
    return;
  }

  const elapsed = Date.now() - activeEditorLock.lastActiveAt;
  const remaining = LOCK_IDLE_TIMEOUT_MS - elapsed;

  if (remaining <= 0) {
    setState("green");
    return;
  }

  setState(iAmEditor ? "red-mine" : "red-other");

  const warnIn = Math.max(remaining - WARNING_WINDOW_MS, 0);
  warnTimer = setTimeout(() => setState(iAmEditor ? "amber-mine" : "amber-other"), warnIn);
  releaseTimer = setTimeout(() => setState("green"), remaining);
}

function setState(state) {
  els.panel.classList.remove("state-green", "state-red", "state-amber");
  els.claimHint.classList.remove("visible");
  els.doneBtn.classList.remove("visible");

  const iAmEditor = state.endsWith("-mine");

  if (state === "green") {
    els.panel.classList.add("state-green");
    els.claimHint.classList.add("visible");
    els.statusDot.style.background = "var(--green)";
    els.statusText.textContent = "Open — click to claim";
    return;
  }

  const isAmber = state.startsWith("amber");
  els.panel.classList.add(isAmber ? "state-amber" : "state-red");
  els.statusDot.style.background = isAmber ? "var(--amber)" : "var(--red)";

  if (iAmEditor) {
    els.statusText.textContent = isAmber
      ? "Keep typing or you'll lose the pen..."
      : "You're editing";
    els.doneBtn.classList.add("visible");
  } else {
    const name = activeEditorLock?.name || "Someone";
    els.statusText.textContent = `${name} is editing`;
  }
}

async function handleClaimClick() {
  if (!activeFileId) return;
  await claimFileLock(code, activeFileId, me.userId, me.color);
}

async function handleLocalEdit() {
  const iAmEditor = activeEditorLock?.userId === me.userId;
  if (!iAmEditor || !activeFileId) return;
  const ciphertext = await encryptText(code, editorInstance.getValue());
  await updateFileContent(code, activeFileId, ciphertext);
  await refreshFileLock(code, activeFileId, me.userId);
}
