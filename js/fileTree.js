import {
  watchFiles,
  createFile,
  renameFile,
  deleteFile,
} from "./roomUtils.js";
import { openFile, closeFile, getActiveFileId, onActiveFileChange } from "./fileEditor.js";

const els = {
  tree: document.getElementById("fileTree"),
  newFileBtn: document.getElementById("newFileBtn"),
  newFolderBtn: document.getElementById("newFolderBtn"),
  toastHost: document.getElementById("toastHost"),
};

let code = null;
let me = null;
let files = []; // flat list from Firebase
let expanded = new Set(); // folder IDs currently expanded (local UI state)
let selectedFolderId = null; // where "New File"/"New Folder" create into
let knownLockOwners = null; // fileId -> userId|null, for toast baseline
let currentOpenFileId = null;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function childrenOf(parentId) {
  return files
    .filter((f) => (f.parentId || null) === parentId)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function renderNode(file, depth) {
  const isFolder = file.type === "folder";
  const isOpen = file.fileId === currentOpenFileId;
  const isExpanded = expanded.has(file.fileId);
  const lock = file.activeEditor;

  const indent = 10 + depth * 16;
  const icon = isFolder
    ? isExpanded
      ? "▾"
      : "▸"
    : "";

  let html = `
    <div class="tree-row ${isOpen ? "tree-row-active" : ""}" data-id="${file.fileId}" data-type="${file.type}" style="padding-left:${indent}px;">
      <span class="tree-icon">${icon}</span>
      <span class="tree-name">${escapeHtml(file.name)}</span>
      ${lock ? `<span class="tree-lock-dot" style="background:${lock.color};" title="${escapeHtml(lock.name)} is editing"></span>` : ""}
      <span class="tree-actions">
        <button class="tree-action-btn" data-action="rename" title="Rename">✎</button>
        <button class="tree-action-btn" data-action="delete" title="Delete">🗑</button>
      </span>
    </div>`;

  if (isFolder && isExpanded) {
    html += childrenOf(file.fileId).map((child) => renderNode(child, depth + 1)).join("");
  }

  return html;
}

function render() {
  els.tree.innerHTML = childrenOf(null).map((f) => renderNode(f, 0)).join("");
}

function checkForNewLocks() {
  const current = new Map(files.map((f) => [f.fileId, f.activeEditor?.userId || null]));

  if (knownLockOwners === null) {
    knownLockOwners = current;
    return;
  }

  for (const file of files) {
    const prevOwner = knownLockOwners.get(file.fileId) || null;
    const newOwner = file.activeEditor?.userId || null;
    const isDifferentFileThanOpen = file.fileId !== currentOpenFileId;

    if (newOwner && newOwner !== prevOwner && newOwner !== me.userId && isDifferentFileThanOpen) {
      showToast(file);
    }
  }

  knownLockOwners = current;
}

function showToast(file) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `
    <span class="toast-dot" style="background:${file.activeEditor.color};"></span>
    <span>${escapeHtml(file.activeEditor.name)} started editing <strong>${escapeHtml(file.name)}</strong></span>
  `;
  toast.addEventListener("click", () => {
    openFile(file.fileId, file.name);
    toast.remove();
  });
  els.toastHost.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 250);
  }, 5000);
}

async function handleTreeClick(e) {
  const actionBtn = e.target.closest(".tree-action-btn");
  const row = e.target.closest(".tree-row");
  if (!row) return;
  const fileId = row.dataset.id;
  const file = files.find((f) => f.fileId === fileId);
  if (!file) return;

  if (actionBtn) {
    e.stopPropagation();
    const action = actionBtn.dataset.action;
    if (action === "rename") {
      const newName = prompt("Rename to:", file.name);
      if (newName && newName.trim() && newName.trim() !== file.name) {
        await renameFile(code, fileId, newName.trim());
      }
    } else if (action === "delete") {
      const label = file.type === "folder" ? "this folder and everything in it" : "this file";
      if (confirm(`Delete ${label}? This can't be undone.`)) {
        if (fileId === currentOpenFileId) {
          const { closeFile } = await import("./fileEditor.js");
          closeFile();
        }
        await deleteFile(code, fileId);
      }
    }
    return;
  }

  if (file.type === "folder") {
    if (expanded.has(fileId)) expanded.delete(fileId);
    else expanded.add(fileId);
    selectedFolderId = fileId;
    render();
  } else {
    selectedFolderId = file.parentId || null;
    openFile(fileId, file.name);
  }
}

export function initFileTree(roomCode, meIdentity) {
  code = roomCode;
  me = meIdentity;

  els.tree.addEventListener("click", handleTreeClick);

  els.newFileBtn.addEventListener("click", async () => {
    const name = prompt("File name (with extension, e.g. utils.py):");
    if (!name || !name.trim()) return;
    const fileId = await createFile(code, selectedFolderId, name.trim(), "file");
    if (selectedFolderId) expanded.add(selectedFolderId);
    openFile(fileId, name.trim());
  });

  els.newFolderBtn.addEventListener("click", async () => {
    const name = prompt("Folder name:");
    if (!name || !name.trim()) return;
    const folderId = await createFile(code, selectedFolderId, name.trim(), "folder");
    expanded.add(folderId);
    if (selectedFolderId) expanded.add(selectedFolderId);
    render();
  });

  onActiveFileChange((fileId) => {
    currentOpenFileId = fileId;
    render();
  });

  watchFiles(code, (list) => {
    files = list;
    checkForNewLocks();
    render();

    // Auto-open the first file on initial load if nothing is open yet.
    if (currentOpenFileId === null && getActiveFileId() === null) {
      const firstFile = files.find((f) => f.type === "file");
      if (firstFile) openFile(firstFile.fileId, firstFile.name);
    }
  });
}

export function getFiles() {
  return files;
}
