import { sendMessage } from "./roomUtils.js";

const els = {
  scroll: document.getElementById("chatScroll"),
  input: document.getElementById("chatInput"),
  sendBtn: document.getElementById("sendBtn"),
};

function textColorFor(bgHex) {
  const hex = bgHex.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150 ? "#141414" : "#fff";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function initChat(code, me) {
  const handleSend = async () => {
    const text = els.input.value.trim();
    if (!text) return;
    els.input.value = "";
    await sendMessage(code, me.userId, me.name, me.color, text);
  };

  els.sendBtn.addEventListener("click", handleSend);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
}

export function renderMessages(messages, me) {
  const wasAtBottom =
    els.scroll.scrollHeight - els.scroll.scrollTop - els.scroll.clientHeight < 40;

  els.scroll.innerHTML = messages
    .map((msg) => {
      const mine = msg.userId === me.userId;
      const bg = msg.color || "#888";
      const fg = textColorFor(bg);
      return `
        <div class="msg-row ${mine ? "mine" : "theirs"}">
          <div class="bubble" style="background:${bg}; color:${fg};">
            ${!mine ? `<div class="bubble-name">${escapeHtml(msg.name)}</div>` : ""}
            <div>${escapeHtml(msg.text)}</div>
          </div>
        </div>`;
    })
    .join("");

  if (wasAtBottom || messages.length <= 1) {
    els.scroll.scrollTop = els.scroll.scrollHeight;
  }
}
