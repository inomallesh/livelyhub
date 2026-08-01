import {
  claimLock,
  refreshLock,
  releaseLock,
  updateContent,
  LOCK_IDLE_TIMEOUT_MS,
  WARNING_WINDOW_MS,
} from "./roomUtils.js";

const els = {
  panel: document.getElementById("editorPanel"),
  inner: document.getElementById("editorInner"),
  textarea: document.getElementById("lhTextarea"),
  claimHint: document.getElementById("claimHint"),
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  doneBtn: document.getElementById("doneBtn"),
};

let warnTimer = null;
let releaseTimer = null;
let activeEditor = null;

const TAB_SPACES = "   "; // 3 spaces

export function initEditor(code, me) {
  // Clicking anywhere in the editor area — including directly on the
  // textarea itself — attempts to claim the lock. handleClaimClick no-ops
  // unless the lock is actually open, so this is always safe.
  els.inner.addEventListener("click", () => handleClaimClick(code, me));

  els.textarea.addEventListener("input", () => handleType(code, me));
  els.textarea.addEventListener("keydown", (e) => handleKeydown(e, code, me));
  els.doneBtn.addEventListener("click", () => releaseLock(code, me.userId));
}

function handleKeydown(e, code, me) {
  if (e.key !== "Tab") return;
  e.preventDefault(); // stop focus from shifting to the next button/element

  const iAmEditor = activeEditor?.userId === me.userId;
  if (!iAmEditor) return; // read-only — nothing to insert

  const ta = els.textarea;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const value = ta.value;

  ta.value = value.slice(0, start) + TAB_SPACES + value.slice(end);
  const newPos = start + TAB_SPACES.length;
  ta.selectionStart = ta.selectionEnd = newPos;

  handleType(code, me);
}

export function onRoomUpdate(room, me) {
  if (!room) return;
  // Only overwrite the textarea if the user isn't the one currently typing,
  // to avoid clobbering their cursor position mid-edit.
  const iAmEditor = room.activeEditor?.userId === me.userId;
  if (!iAmEditor && els.textarea.value !== (room.content || "")) {
    els.textarea.value = room.content || "";
  }

  activeEditor = room.activeEditor || null;
  render(me);
}

function render(me) {
  clearTimeout(warnTimer);
  clearTimeout(releaseTimer);

  const iAmEditor = activeEditor?.userId === me.userId;
  els.textarea.readOnly = !iAmEditor;

  if (!activeEditor) {
    setState("green", me);
    return;
  }

  const elapsed = Date.now() - activeEditor.lastActiveAt;
  const remaining = LOCK_IDLE_TIMEOUT_MS - elapsed;

  if (remaining <= 0) {
    setState("green", me);
    return;
  }

  setState(iAmEditor ? "red-mine" : "red-other", me);

  const warnIn = Math.max(remaining - WARNING_WINDOW_MS, 0);
  warnTimer = setTimeout(() => {
    setState(iAmEditor ? "amber-mine" : "amber-other", me);
  }, warnIn);

  releaseTimer = setTimeout(() => {
    setState("green", me);
  }, remaining);
}

function setState(state, me) {
  els.panel.classList.remove("state-green", "state-red", "state-amber");
  els.inner.classList.remove("claimable");
  els.claimHint.classList.remove("visible");
  els.doneBtn.classList.remove("visible");

  const iAmEditor = state.endsWith("-mine");

  if (state === "green") {
    els.panel.classList.add("state-green");
    els.inner.classList.add("claimable");
    els.claimHint.classList.add("visible");
    els.statusDot.style.color = "var(--accent-green)";
    els.statusDot.style.background = "var(--accent-green)";
    els.statusText.textContent = "Open — click to claim";
    els.textarea.placeholder = "Click here to start writing...";
    return;
  }

  const isAmber = state.startsWith("amber");
  els.panel.classList.add(isAmber ? "state-amber" : "state-red");

  const color = isAmber ? "var(--accent-amber)" : "var(--accent-red)";
  els.statusDot.style.color = color;
  els.statusDot.style.background = color;

  if (iAmEditor) {
    els.statusText.textContent = isAmber
      ? "Keep typing or you'll lose the pen..."
      : "You're editing";
    els.doneBtn.classList.add("visible");
    els.textarea.placeholder = "You have the pen — start typing...";
  } else {
    const name = activeEditor?.name || "Someone";
    els.statusText.textContent = `${name} is editing`;
    els.textarea.placeholder = `${name} is writing...`;
  }
}

async function handleClaimClick(code, me) {
  const isClaimable = els.inner.classList.contains("claimable");
  if (!isClaimable) return;
  const won = await claimLock(code, me.userId, me.name, me.color);
  if (won) {
    els.textarea.focus();
  }
}

async function handleType(code, me) {
  const iAmEditor = activeEditor?.userId === me.userId;
  if (!iAmEditor) return;
  await updateContent(code, els.textarea.value);
  await refreshLock(code, me.userId);
}
