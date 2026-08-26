import {
  getRoom,
  joinRoom,
  extendRoom,
  MAX_ROOM_LIFETIME_MS,
  renameMember,
  watchMessages,
  watchExpiry,
  getUserId,
  getSavedIdentity,
  saveIdentity,
} from "./roomUtils.js";
import { initFileEditor, setEditorTheme } from "./fileEditor.js";
import { initFileTree } from "./fileTree.js";
import { initRunner } from "./runner.js";
import { downloadCurrentFile, downloadProjectZip } from "./download.js";
import { initChat, renderMessages } from "./chat.js";
import { initMembers } from "./members.js";
import { ensureNotificationPermission } from "./notifications.js";
import { initThemeToggle } from "./theme.js";
import { initMenu } from "./menu.js";

const params = new URLSearchParams(window.location.search);
const code = params.get("code");

const notFoundView = document.getElementById("notFoundView");
const loadingView = document.getElementById("loadingView");
const roomView = document.getElementById("roomView");

const roomCodeLabel = document.getElementById("roomCodeLabel");
const youDot = document.getElementById("youDot");
const youName = document.getElementById("youName");
const youNameInput = document.getElementById("youNameInput");
const renameIcon = document.getElementById("renameIcon");
const expiryLabel = document.getElementById("expiryLabel");
const extendBtn = document.getElementById("extendBtn");
const downloadFileBtn = document.getElementById("downloadFileBtn");
const downloadZipBtn = document.getElementById("downloadZipBtn");

function formatCountdown(ms) {
  if (ms === null || ms === undefined) return "...";
  if (ms <= 0) return "expired";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${h}h ${m}m left`;
}

function initRename(code, me) {
  const startEdit = () => {
    youNameInput.value = me.name;
    youName.style.display = "none";
    renameIcon.style.display = "none";
    youNameInput.style.display = "inline-block";
    youNameInput.focus();
    youNameInput.select();
  };

  const commit = async () => {
    const newName = youNameInput.value.trim().slice(0, 24);
    youNameInput.style.display = "none";
    youName.style.display = "inline";
    renameIcon.style.display = "inline-block";
    if (newName && newName !== me.name) {
      me.name = newName;
      youName.textContent = `You: ${newName}`;
      saveIdentity({ name: newName });
      await renameMember(code, me.userId, newName);
    }
  };

  youName.addEventListener("click", startEdit);
  renameIcon.addEventListener("click", startEdit);
  youNameInput.addEventListener("blur", commit);
  youNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") youNameInput.blur();
    if (e.key === "Escape") {
      youNameInput.value = me.name;
      youNameInput.blur();
    }
  });
}

async function main() {
  if (!code || !/^\d{6}$/.test(code)) {
    loadingView.style.display = "none";
    notFoundView.style.display = "flex";
    return;
  }

  const room = await getRoom(code);
  if (!room) {
    loadingView.style.display = "none";
    notFoundView.style.display = "flex";
    return;
  }

  const userId = getUserId();
  const saved = getSavedIdentity();
  const chosenName = saved.name || `Guest-${userId.slice(2, 6)}`;
  const presence = await joinRoom(code, userId, chosenName);
  const me = {
    userId,
    name: presence.name,
    color: presence.color,
  };

  // Reveal room UI (Monaco needs the container visible/measurable before
  // .create(), so we show the shell first, then load the editor).
  loadingView.style.display = "none";
  roomView.style.display = "flex";
  roomCodeLabel.textContent = `Room ${code}`;
  youName.textContent = `You: ${me.name}`;
  youDot.style.background = me.color;
  youDot.style.color = me.color;

  const themeToggleBtn = document.getElementById("themeToggle");
  initThemeToggle(themeToggleBtn);
  // Keep Monaco's own theme in sync with our light/dark toggle.
  const observer = new MutationObserver(() => {
    setEditorTheme(document.documentElement.getAttribute("data-theme") !== "light");
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  await initFileEditor(code, me);
  initFileTree(code, me);
  initRunner();
  initChat(code, me);
  initMembers(code, me);
  initRename(code, me);
  initMenu("menuToggleBtn", "menuPopup");

  downloadFileBtn.addEventListener("click", () => downloadCurrentFile());
  downloadZipBtn.addEventListener("click", () => downloadProjectZip(code, code));

  // Ask right after joining — per design decision, on by default rather
  // than gated behind a bell-icon click.
  ensureNotificationPermission();

  watchMessages(code, (list) => renderMessages(list, code, me));

  let expiresAt = room.expiresAt;
  const createdAt = room.createdAt || Date.now();

  function refreshExtendBtn() {
    const capped = expiresAt >= createdAt + MAX_ROOM_LIFETIME_MS;
    extendBtn.disabled = capped;
    extendBtn.textContent = capped ? "Max reached" : "+2h";
    extendBtn.title = capped
      ? "Rooms can't be extended past 7 days total"
      : "Extend this room by 2 hours";
  }

  watchExpiry(code, (val) => {
    expiresAt = val;
    refreshExtendBtn();
  });

  refreshExtendBtn();

  setInterval(() => {
    expiryLabel.textContent = formatCountdown(expiresAt - Date.now());
  }, 1000);

  extendBtn.addEventListener("click", async () => {
    extendBtn.disabled = true;
    await extendRoom(code, 2);
  });
}

main();
