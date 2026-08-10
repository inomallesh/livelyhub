// js/roomUtils.js
import { db } from "./firebase-config.js";
import {
  ref,
  get,
  set,
  update,
  push,
  runTransaction,
  onDisconnect,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Fixed palette so every user's color stays visually distinct. Still used
// internally for the lock/cursor identity accent, even though the home page
// no longer shows a manual color picker (auto-assigned now — avatar is the
// primary identity marker per the new design).
export const COLOR_PALETTE = [
  "#0A84FF", // blue
  "#BF5AF2", // purple
  "#FF375F", // pink
  "#32D74B", // green
  "#FF9F0A", // orange
  "#64D2FF", // teal
  "#FFD60A", // yellow
  "#FF453A", // red
  "#5E5CE6", // indigo
  "#AC8E68", // brown
];

// Avatar art lives at assets/avatars/avatar-01.jpg ... avatar-21.jpg
export const AVATAR_COUNT = 21;
export function avatarPath(id) {
  const n = String(id).padStart(2, "0");
  return `assets/avatars/avatar-${n}.jpg`;
}

const SESSION_LENGTH_MS = 6 * 60 * 60 * 1000; // 6 hours
export const LOCK_IDLE_TIMEOUT_MS = 5000; // 5 seconds idle before claimable
export const WARNING_WINDOW_MS = 1500; // amber pulse window before release

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createRoom() {
  let attempts = 0;
  while (attempts < 10) {
    const code = generateCode();
    const roomRef = ref(db, `rooms/${code}`);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) {
      const now = Date.now();
      await set(roomRef, {
        content: "",
        createdAt: now,
        expiresAt: now + SESSION_LENGTH_MS,
        activeEditor: null,
      });
      return code;
    }
    attempts++;
  }
  throw new Error("Could not generate a unique room code — try again.");
}

export async function getRoom(code) {
  const roomRef = ref(db, `rooms/${code}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) return null;

  const room = snapshot.val();
  if (room.expiresAt && Date.now() > room.expiresAt) {
    await set(roomRef, null);
    return null;
  }
  return room;
}

export async function extendRoom(code, additionalHours = 2) {
  const expiryRef = ref(db, `rooms/${code}/expiresAt`);
  const snapshot = await get(expiryRef);
  const current = snapshot.exists() ? snapshot.val() : Date.now();
  const base = Math.max(current, Date.now());
  await set(expiryRef, base + additionalHours * 60 * 60 * 1000);
}

export async function joinRoom(code, userId, displayName, preferredColor, avatarId) {
  const presenceRef = ref(db, `rooms/${code}/presence`);
  const name = displayName || `Guest-${userId.slice(2, 6)}`;

  // Use a transaction so two people joining at nearly the same moment can't
  // both read "blue is free" and both write blue — Firebase re-runs this
  // function against the latest data if another write landed in between.
  const result = await runTransaction(presenceRef, (existing) => {
    const current = existing || {};
    const usedColors = new Set(
      Object.entries(current)
        .filter(([uid]) => uid !== userId) // don't let a stale entry for myself block my own color
        .map(([, u]) => u.color)
    );

    const availableColor =
      (preferredColor && !usedColors.has(preferredColor) && preferredColor) ||
      COLOR_PALETTE.find((c) => !usedColors.has(c)) ||
      COLOR_PALETTE[Object.keys(current).length % COLOR_PALETTE.length];

    current[userId] = {
      name,
      color: availableColor,
      avatar: avatarId || 1,
      joinedAt: Date.now(),
    };
    return current;
  });

  const presenceData = result.snapshot.val()[userId];

  const myPresenceRef = ref(db, `rooms/${code}/presence/${userId}`);
  onDisconnect(myPresenceRef).remove();

  return presenceData;
}

export async function claimLock(code, userId, name, color, avatar) {
  const lockRef = ref(db, `rooms/${code}/activeEditor`);
  const result = await runTransaction(lockRef, (current) => {
    const now = Date.now();
    const isFree = !current || now - current.lastActiveAt > LOCK_IDLE_TIMEOUT_MS;
    if (isFree) return { userId, name, color, avatar, lastActiveAt: now };
    return current;
  });
  return result.committed && result.snapshot.val()?.userId === userId;
}

export async function refreshLock(code, userId) {
  const lockRef = ref(db, `rooms/${code}/activeEditor`);
  await runTransaction(lockRef, (current) => {
    if (current && current.userId === userId) {
      return { ...current, lastActiveAt: Date.now() };
    }
    return current;
  });
}

export async function releaseLock(code, userId) {
  const lockRef = ref(db, `rooms/${code}/activeEditor`);
  await runTransaction(lockRef, (current) => {
    if (current && current.userId === userId) return null;
    return current;
  });
}

export async function updateContent(code, content) {
  await update(ref(db, `rooms/${code}`), { content });
}

export async function renamePresence(code, userId, newName) {
  const nameRef = ref(db, `rooms/${code}/presence/${userId}/name`);
  await set(nameRef, newName);

  // If this user currently holds the write lock, keep the lock's stored
  // name in sync too, so other users' "X is editing" label updates live.
  const lockRef = ref(db, `rooms/${code}/activeEditor`);
  await runTransaction(lockRef, (current) => {
    if (current && current.userId === userId) {
      return { ...current, name: newName };
    }
    return current;
  });
}

export async function sendMessage(code, userId, name, color, avatar, text) {
  const messagesRef = ref(db, `rooms/${code}/messages`);
  const newMsgRef = push(messagesRef);
  await set(newMsgRef, { userId, name, color, avatar, text, timestamp: Date.now() });
}

export function watchRoom(code, callback) {
  const roomRef = ref(db, `rooms/${code}`);
  return onValue(roomRef, (snap) => callback(snap.val()));
}

export function watchMessages(code, callback) {
  const messagesRef = ref(db, `rooms/${code}/messages`);
  return onValue(messagesRef, (snap) => {
    const data = snap.val() || {};
    const list = Object.entries(data)
      .map(([id, msg]) => ({ id, ...msg }))
      .sort((a, b) => a.timestamp - b.timestamp);
    callback(list);
  });
}

export function watchExpiry(code, callback) {
  const expiryRef = ref(db, `rooms/${code}/expiresAt`);
  return onValue(expiryRef, (snap) => callback(snap.val()));
}

export function getUserId() {
  let id = sessionStorage.getItem("lh_userId");
  if (!id) {
    id = "u_" + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem("lh_userId", id);
  }
  return id;
}

// Identity chosen on the home page (name + preferred color), persisted so it
// carries over from index.html into room.html.
// Identity chosen on the home page (name + avatar, color auto-assigned),
// persisted so it carries over from index.html into room.html.
export function saveIdentity({ name, color, avatar }) {
  if (name !== undefined) localStorage.setItem("lh_name", name);
  if (color !== undefined) localStorage.setItem("lh_color", color);
  if (avatar !== undefined) localStorage.setItem("lh_avatar", String(avatar));
}

export function getSavedIdentity() {
  return {
    name: localStorage.getItem("lh_name") || "",
    color: localStorage.getItem("lh_color") || COLOR_PALETTE[0],
    avatar: Number(localStorage.getItem("lh_avatar")) || 1,
  };
}
