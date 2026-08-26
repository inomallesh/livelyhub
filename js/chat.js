import { sendMessage } from "./roomUtils.js";
import { encryptText, decryptText } from "./crypto.js";

const els = {
  popup: document.getElementById("chatPopup"),
  toggleBtn: document.getElementById("chatToggleBtn"),
  closeBtn: document.getElementById("chatCloseBtn"),
  badge: document.getElementById("unreadBadge"),
  scroll: document.getElementById("chatScroll"),
  input: document.getElementById("chatInput"),
  sendBtn: document.getElementById("sendBtn"),
};

let isOpen = false;
let unreadCount = 0;
let knownIds = null; // null until the first render establishes a baseline

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function updateBadge() {
  if (unreadCount > 0) {
    els.badge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
    els.badge.style.display = "flex";
  } else {
    els.badge.style.display = "none";
  }
}

function setOpen(open) {
  isOpen = open;
  els.popup.hidden = !open;
  if (open) {
    unreadCount = 0;
    updateBadge();
    els.scroll.scrollTop = els.scroll.scrollHeight;
    els.input.focus();
  }
}

export function initChat(code, me) {
  const handleSend = async () => {
    const text = els.input.value.trim();
    if (!text) return;
    els.input.value = "";
    const ciphertext = await encryptText(code, text);
    await sendMessage(code, me.userId, me.name, me.color, ciphertext);
  };

  els.sendBtn.addEventListener("click", handleSend);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  els.toggleBtn.addEventListener("click", () => setOpen(!isOpen));
  els.closeBtn.addEventListener("click", () => setOpen(false));
}

export async function renderMessages(messages, code, me) {
  const wasAtBottom =
    els.scroll.scrollHeight - els.scroll.scrollTop - els.scroll.clientHeight < 40;

  // Decrypt every message in parallel before rendering. A single bad/corrupt
  // message shows its own "couldn't decrypt" placeholder rather than
  // breaking the whole chat.
  const decrypted = await Promise.all(
    messages.map(async (msg) => {
      try {
        const text = await decryptText(code, msg.text);
        return { ...msg, text, decryptOk: true };
      } catch {
        return { ...msg, text: "Couldn't decrypt this message", decryptOk: false };
      }
    })
  );

  // Unread tracking: the first render just establishes a baseline (so
  // existing history on join doesn't count as "unread"). After that, any
  // message ID we haven't seen before, from someone else, while the popup
  // is closed, bumps the badge.
  const currentIds = new Set(decrypted.map((m) => m.id));
  if (knownIds === null) {
    knownIds = currentIds;
  } else {
    const newOnes = decrypted.filter((m) => !knownIds.has(m.id));
    if (newOnes.length && !isOpen) {
      unreadCount += newOnes.filter((m) => m.userId !== me.userId).length;
      updateBadge();
    }
    knownIds = currentIds;
  }

  els.scroll.innerHTML = decrypted
    .map((msg) => {
      const mine = msg.userId === me.userId;
      const bodyClass = msg.decryptOk ? "" : ' style="opacity:0.6; font-style:italic;"';
      return `
        <div class="msg-row ${mine ? "mine" : "theirs"}">
          <div class="bubble" style="border-left-color:${msg.color || "var(--border-strong)"};">
            ${!mine ? `<div class="bubble-name" style="color:${msg.color || "inherit"};">${escapeHtml(msg.name)}</div>` : ""}
            <div${bodyClass}>${escapeHtml(msg.text)}</div>
          </div>
        </div>`;
    })
    .join("");

  if (wasAtBottom || messages.length <= 1) {
    els.scroll.scrollTop = els.scroll.scrollHeight;
  }
}
