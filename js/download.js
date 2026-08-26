import { getActiveFileContent, getActiveFileName } from "./fileEditor.js";
import { getFiles } from "./fileTree.js";
import { decryptText } from "./crypto.js";

let jszipPromise = null;

function loadJSZipOnce() {
  if (jszipPromise) return jszipPromise;
  jszipPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
    script.onload = () => resolve(window.JSZip);
    script.onerror = () => reject(new Error("Failed to load the zip library."));
    document.head.appendChild(script);
  });
  return jszipPromise;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCurrentFile() {
  const name = getActiveFileName();
  if (!name) return;
  const content = getActiveFileContent();
  const blob = new Blob([content], { type: "text/plain" });
  triggerDownload(blob, name);
}

function pathFor(file, allFiles) {
  const parts = [file.name];
  let parentId = file.parentId;
  while (parentId) {
    const parent = allFiles.find((f) => f.fileId === parentId);
    if (!parent) break;
    parts.unshift(parent.name);
    parentId = parent.parentId;
  }
  return parts.join("/");
}

export async function downloadProjectZip(code, roomCodeLabel) {
  const JSZip = await loadJSZipOnce();
  const zip = new JSZip();
  const allFiles = getFiles();

  const fileNodes = allFiles.filter((f) => f.type === "file");
  await Promise.all(
    fileNodes.map(async (file) => {
      let content = "";
      try {
        content = await decryptText(code, file.content || "");
      } catch {
        content = "// Couldn't decrypt this file";
      }
      zip.file(pathFor(file, allFiles), content);
    })
  );

  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, `livelyhub-${roomCodeLabel}.zip`);
}
