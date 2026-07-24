import {
  getRoom,
  joinRoom,
  extendRoom,
  watchRoom,
  watchMessages,
  watchExpiry,
  getUserId,
} from "./roomUtils.js";
import { initEditor, onRoomUpdate } from "./editor.js";
import { initChat, renderMessages } from "./chat.js";

const params = new URLSearchParams(window.location.search);
const code = params.get("code");

const notFoundView = document.getElementById("notFoundView");
const loadingView = document.getElementById("loadingView");
const roomView = document.getElementById("roomView");

const roomCodeLabel = document.getElementById("roomCodeLabel");
const youDot = document.getElementById("youDot");
const youName = document.getElementById("youName");
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
  const guessedName = `Guest-${userId.slice(2, 6)}`;
  const presence = await joinRoom(code, userId, guessedName);
  const me = { userId, name: presence.name, color: presence.color };

  // Reveal room UI
  loadingView.style.display = "none";
  roomView.style.display = "block";
  roomCodeLabel.textContent = `Room ${code}`;
  youName.textContent = `You: ${me.name}`;
  youDot.style.background = me.color;
  youDot.style.color = me.color;

  initEditor(code, me);
  initChat(code, me);

  watchRoom(code, (data) => onRoomUpdate(data, me));
  watchMessages(code, (list) => renderMessages(list, me));

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
