import { createRoom, getRoom, saveIdentity, getSavedIdentity } from "./roomUtils.js";
import { initThemeToggle } from "./theme.js";
import { initMenu } from "./menu.js";

initThemeToggle(document.getElementById("themeToggle"));
initMenu("menuToggleBtn", "menuPopup");

const createBtn = document.getElementById("createBtn");
const createBtnLabel = document.getElementById("createBtnLabel");
const joinBtn = document.getElementById("joinBtn");
const joinInput = document.getElementById("joinInput");
const errorMsg = document.getElementById("errorMsg");
const nameInput = document.getElementById("nameInput");

const saved = getSavedIdentity();
nameInput.value = saved.name;

nameInput.addEventListener("input", () => {
  saveIdentity({ name: nameInput.value.trim() });
});

function showError(text) {
  errorMsg.textContent = text;
  errorMsg.style.display = "block";
  // restart the shake animation on repeated errors
  errorMsg.style.animation = "none";
  void errorMsg.offsetWidth;
  errorMsg.style.animation = "";
}

function hideError() {
  errorMsg.style.display = "none";
}

function setLoading(isLoading) {
  createBtn.disabled = isLoading;
  joinBtn.disabled = isLoading;
  createBtnLabel.innerHTML = isLoading
    ? '<span class="spinner"></span>Creating...'
    : "Create a room";
}

createBtn.addEventListener("click", async () => {
  hideError();
  setLoading(true);
  try {
    const code = await createRoom();
    window.location.href = `room.html?code=${code}`;
  } catch (e) {
    showError(e.message || "Something went wrong. Try again.");
    setLoading(false);
  }
});

joinInput.addEventListener("input", () => {
  joinInput.value = joinInput.value.replace(/\D/g, "").slice(0, 6);
});

joinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinBtn.click();
});

joinBtn.addEventListener("click", async () => {
  hideError();
  const code = joinInput.value.trim();
  if (!/^\d{6}$/.test(code)) {
    showError("Enter a valid 6-digit room code.");
    return;
  }
  joinBtn.disabled = true;
  try {
    const room = await getRoom(code);
    if (!room) {
      showError("That room doesn't exist or has expired.");
      joinBtn.disabled = false;
      return;
    }
    window.location.href = `room.html?code=${code}`;
  } catch (e) {
    showError(e.message || "Something went wrong. Try again.");
    joinBtn.disabled = false;
  }
});
