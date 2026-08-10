import { sendMessage } from "./roomUtils.js";
import { encryptText, decryptText } from "./crypto.js";
import { avatarPath } from "./roomUtils.js";

const els = {
  scroll: document.getElementById("chatScroll"),
  input: document.getElementById("chatInput"),
  sendBtn: document.getElementById("sendBtn"),
};

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
    const ciphertext = await encryptText(code, text);
    await sendMessage(code, me.userId, me.name, me.color, me.avatar, ciphertext);
  };

  els.sendBtn.addEventListener("click", handleSend);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
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

  els.scroll.innerHTML = decrypted
    .map((msg) => {
      const mine = msg.userId === me.userId;
      const bodyClass = msg.decryptOk ? "" : ' style="opacity:0.6; font-style:italic;"';
      const avatarImg = `<img class="bubble-avatar" src="${avatarPath(msg.avatar || 1)}" alt="" />`;
      return `
        <div class="msg-row ${mine ? "mine" : "theirs"}">
          ${!mine ? avatarImg : ""}
          <div class="bubble">
            ${!mine ? `<div class="bubble-name">${escapeHtml(msg.name)}</div>` : ""}
            <div${bodyClass}>${escapeHtml(msg.text)}</div>
          </div>
          ${mine ? avatarImg : ""}
        </div>`;
    })
    .join("");

  if (wasAtBottom || messages.length <= 1) {
    els.scroll.scrollTop = els.scroll.scrollHeight;
  }
}
