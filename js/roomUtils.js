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
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// A larger palette than before, deliberately spread across hue AND
// lightness (not just hue) so adjacent picks don't read as near-duplicates
// at a glance — e.g. avoids having two similar mid-tone blues back to back.
// Works against both the dark and light theme backgrounds.
export const COLOR_PALETTE = [
  "#e6455e", // red
  "#f2994a", // orange
  "#e8c547", // yellow
  "#7ed957", // lime green
  "#2fbf71", // green
  "#2dd4bf", // teal
  "#38bdf8", // sky blue
  "#4f7df3", // blue
  "#7c6cf0", // indigo
  "#b06cf0", // violet
  "#e05fd0", // magenta
  "#f0568f", // pink
  "#c47b3f", // brown
  "#9aa5b1", // cool gray
  "#5fd6c4", // aqua
  "#f28b82", // coral
  "#a3e635", // chartreuse
  "#60a5fa", // light blue
];

const SESSION_LENGTH_MS = 6 * 60 * 60 * 1000; // 6 hours
export const MAX_ROOM_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, hard ceiling
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
      const firstFileId = push(ref(db, `rooms/${code}/files`)).key;
      await set(roomRef, {
        createdAt: now,
        expiresAt: now + SESSION_LENGTH_MS,
        files: {
          [firstFileId]: {
            name: "main.js",
            parentId: null,
            type: "file",
            content: "",
            createdAt: now,
          },
        },
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
  const roomRef = ref(db, `rooms/${code}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) return { expiresAt: null, capped: false };

  const room = snapshot.val();
  const createdAt = room.createdAt || Date.now();
  const currentExpiry = room.expiresAt || Date.now();
  const hardCeiling = createdAt + MAX_ROOM_LIFETIME_MS;

  const base = Math.max(currentExpiry, Date.now());
  const proposed = base + additionalHours * 60 * 60 * 1000;
  const newExpiry = Math.min(proposed, hardCeiling);

  await set(ref(db, `rooms/${code}/expiresAt`), newExpiry);
  return { expiresAt: newExpiry, capped: newExpiry >= hardCeiling };
}

export async function joinRoom(code, userId, displayName) {
  const membersRef = ref(db, `rooms/${code}/members`);
  const name = displayName || `Guest-${userId.slice(2, 6)}`;

  // Use a transaction so two people joining at nearly the same moment can't
  // both read "blue is free" and both write blue — Firebase re-runs this
  // function against the latest data if another write landed in between.
  const result = await runTransaction(membersRef, (existing) => {
    const current = existing || {};
    const usedColors = new Set(
      Object.entries(current)
        .filter(([uid, u]) => uid !== userId && u.online) // only currently-online members compete for colors
        .map(([, u]) => u.color)
    );

    const alreadyHere = current[userId];
    const availableColor =
      alreadyHere?.color ||
      COLOR_PALETTE.find((c) => !usedColors.has(c)) ||
      COLOR_PALETTE[Object.keys(current).length % COLOR_PALETTE.length];

    current[userId] = {
      name,
      color: availableColor,
      online: true,
      joinedAt: alreadyHere?.joinedAt || Date.now(), // keep the original join time across rejoins
      lastSeenAt: Date.now(),
    };
    return current;
  });

  const memberData = result.snapshot.val()[userId];

  // On disconnect, don't delete the record — just mark it offline, so the
  // members list can still show "left" rather than losing all history of
  // who was here.
  const myMemberRef = ref(db, `rooms/${code}/members/${userId}`);
  onDisconnect(myMemberRef).update({
    online: false,
    lastSeenAt: serverTimestamp(),
  });

  return memberData;
}

// --------------------------------------------------------------------------
// File tree: each file/folder is a node under rooms/{code}/files/{fileId},
// with parentId pointing at another file's ID (or null for top-level).
// Each FILE (not folder) has its own content string and its own
// activeEditor lock — this is what lets two people edit two different files
// in the same room at the same time, instead of one lock for the whole room.
// --------------------------------------------------------------------------

export function watchFiles(code, callback) {
  const filesRef = ref(db, `rooms/${code}/files`);
  return onValue(filesRef, (snap) => {
    const data = snap.val() || {};
    const list = Object.entries(data).map(([fileId, f]) => ({ fileId, ...f }));
    callback(list);
  });
}

export async function createFile(code, parentId, name, type) {
  const filesRef = ref(db, `rooms/${code}/files`);
  const newFileRef = push(filesRef);
  const node = {
    name,
    parentId: parentId || null,
    type, // "file" | "folder"
    createdAt: Date.now(),
  };
  if (type === "file") node.content = "";
  await set(newFileRef, node);
  return newFileRef.key;
}

export async function renameFile(code, fileId, newName) {
  await set(ref(db, `rooms/${code}/files/${fileId}/name`), newName);
}

export async function deleteFile(code, fileId) {
  const filesRef = ref(db, `rooms/${code}/files`);
  const snapshot = await get(filesRef);
  const all = snapshot.exists() ? snapshot.val() : {};

  // Cascade: deleting a folder deletes everything nested under it too.
  const toDelete = new Set([fileId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, node] of Object.entries(all)) {
      if (toDelete.has(node.parentId) && !toDelete.has(id)) {
        toDelete.add(id);
        changed = true;
      }
    }
  }

  const updates = {};
  for (const id of toDelete) updates[`rooms/${code}/files/${id}`] = null;
  await update(ref(db), updates);
}

export async function claimFileLock(code, fileId, userId, name, color) {
  const lockRef = ref(db, `rooms/${code}/files/${fileId}/activeEditor`);
  const result = await runTransaction(lockRef, (current) => {
    const now = Date.now();
    const isFree = !current || now - current.lastActiveAt > LOCK_IDLE_TIMEOUT_MS;
    if (isFree) return { userId, name, color, lastActiveAt: now };
    return current;
  });
  return result.committed && result.snapshot.val()?.userId === userId;
}

export async function refreshFileLock(code, fileId, userId) {
  const lockRef = ref(db, `rooms/${code}/files/${fileId}/activeEditor`);
  await runTransaction(lockRef, (current) => {
    if (current && current.userId === userId) {
      return { ...current, lastActiveAt: Date.now() };
    }
    return current;
  });
}

export async function releaseFileLock(code, fileId, userId) {
  const lockRef = ref(db, `rooms/${code}/files/${fileId}/activeEditor`);
  await runTransaction(lockRef, (current) => {
    if (current && current.userId === userId) return null;
    return current;
  });
}

export async function updateFileContent(code, fileId, content) {
  await set(ref(db, `rooms/${code}/files/${fileId}/content`), content);
}

export function watchFile(code, fileId, callback) {
  const fileRef = ref(db, `rooms/${code}/files/${fileId}`);
  return onValue(fileRef, (snap) => callback(snap.val()));
}

export async function renameMember(code, userId, newName) {
  const nameRef = ref(db, `rooms/${code}/members/${userId}/name`);
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

export function watchMembers(code, callback) {
  const membersRef = ref(db, `rooms/${code}/members`);
  return onValue(membersRef, (snap) => {
    const data = snap.val() || {};
    const list = Object.entries(data).map(([userId, m]) => ({ userId, ...m }));
    // Online members first (most recently joined first), then everyone
    // who's left, most-recently-seen first.
    list.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      if (a.online) return (b.joinedAt || 0) - (a.joinedAt || 0);
      return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
    });
    callback(list);
  });
}

export async function sendMessage(code, userId, name, color, text) {
  const messagesRef = ref(db, `rooms/${code}/messages`);
  const newMsgRef = push(messagesRef);
  await set(newMsgRef, { userId, name, color, text, timestamp: Date.now() });
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

// Identity chosen on the home page (name only — color is auto-assigned),
// persisted so it carries over from index.html into room.html.
export function saveIdentity({ name }) {
  if (name !== undefined) localStorage.setItem("lh_name", name);
}

export function getSavedIdentity() {
  return {
    name: localStorage.getItem("lh_name") || "",
  };
}
