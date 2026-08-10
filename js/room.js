import {
  getRoom,
  joinRoom,
  extendRoom,
  renamePresence,
  watchRoom,
  watchMessages,
  watchExpiry,
  getUserId,
  getSavedIdentity,
  saveIdentity,
  avatarPath,
} from "./roomUtils.js";
import { initEditor, onRoomUpdate } from "./editor.js";
import { initChat, renderMessages } from "./chat.js";
import { ensureNotificationPermission } from "./notifications.js";
import { initEmbers } from "./embers.js";

initEmbers();

const params = new URLSearchParams(window.location.search);
const code = params.get("code");

const notFoundView = document.getElementById("notFoundView");
const loadingView = document.getElementById("loadingView");
const roomView = document.getElementById("roomView");

const roomCodeLabel = document.getElementById("roomCodeLabel");
const youAvatar = document.getElementById("youAvatar");
const youDot = document.getElementById("youDot");
const youName = document.getElementById("youName");
const youNameInput = document.getElementById("youNameInput");
const renameIcon = document.getElementById("renameIcon");
const expiryLabel = document.getElementById("expiryLabel");
const extendBtn = document.getElementById("extendBtn");

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
      await renamePresence(code, me.userId, newName);
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
  const presence = await joinRoom(code, userId, chosenName, saved.color, saved.avatar);
  const me = {
    userId,
    name: presence.name,
    color: presence.color,
    avatar: presence.avatar,
  };

  // Reveal room UI
  loadingView.style.display = "none";
  roomView.style.display = "block";
  roomCodeLabel.textContent = `Room ${code}`;
  youName.textContent = `You: ${me.name}`;
  youAvatar.src = avatarPath(me.avatar);
  youDot.style.background = me.color;
  youDot.style.color = me.color;

  initEditor(code, me);
  initChat(code, me);
  initRename(code, me);

  // Ask right after joining — per design decision, on by default rather
  // than gated behind a bell-icon click.
  ensureNotificationPermission();

  watchRoom(code, (data) => onRoomUpdate(data, code, me));
  watchMessages(code, (list) => renderMessages(list, code, me));

  let expiresAt = room.expiresAt;
  watchExpiry(code, (val) => {
    expiresAt = val;
  });

  setInterval(() => {
    expiryLabel.textContent = formatCountdown(expiresAt - Date.now());
  }, 1000);

  extendBtn.addEventListener("click", () => extendRoom(code, 2));
}

main();
