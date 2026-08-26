import { watchMembers } from "./roomUtils.js";

const els = {
  popup: document.getElementById("membersPopup"),
  toggleBtn: document.getElementById("membersToggleBtn"),
  closeBtn: document.getElementById("membersCloseBtn"),
  onlineCount: document.getElementById("membersOnlineCount"),
  list: document.getElementById("membersList"),
};

let isOpen = false;

function setOpen(open) {
  isOpen = open;
  els.popup.hidden = !open;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatLastSeen(ts) {
  if (!ts) return "";
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function initMembers(code, me) {
  els.toggleBtn.addEventListener("click", () => setOpen(!isOpen));
  els.closeBtn.addEventListener("click", () => setOpen(false));

  watchMembers(code, (members) => {
    const onlineCount = members.filter((m) => m.online).length;
    els.onlineCount.textContent = String(onlineCount);

    els.list.innerHTML = members
      .map((m) => {
        const isMe = m.userId === me.userId;
        const statusText = m.online
          ? "online"
          : `left${m.lastSeenAt ? " · " + formatLastSeen(m.lastSeenAt) : ""}`;
        return `
          <div class="member-row ${m.online ? "" : "member-offline"}">
            <span class="member-avatar-wrap">
              <span class="member-dot" style="background:${m.color || "var(--border-strong)"};"></span>
              ${m.online ? '<span class="online-badge" title="Online"></span>' : ""}
            </span>
            <span class="member-name">${escapeHtml(m.name)}${isMe ? " (you)" : ""}</span>
            <span class="member-status">${statusText}</span>
          </div>`;
      })
      .join("");
  });
}
