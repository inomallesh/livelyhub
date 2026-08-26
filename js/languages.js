// js/languages.js
//
// Central place mapping file extensions to Monaco's language IDs and to
// whether livelyhub can actually run that language client-side. Per the
// project's decision: JS/HTML/CSS/Python run in the browser (sandboxed,
// no server); Java/C/C++ get syntax highlighting only — real execution for
// compiled languages needs a proper sandboxed backend, which this project
// deliberately doesn't build itself.

export const LANGUAGES = {
  js: { monacoId: "javascript", label: "JavaScript", canRun: true },
  html: { monacoId: "html", label: "HTML", canRun: true },
  css: { monacoId: "css", label: "CSS", canRun: true },
  py: { monacoId: "python", label: "Python", canRun: true },
  java: { monacoId: "java", label: "Java", canRun: false },
  c: { monacoId: "c", label: "C", canRun: false },
  cpp: { monacoId: "cpp", label: "C++", canRun: false },
  txt: { monacoId: "plaintext", label: "Plain text", canRun: false },
};

export function extensionOf(filename) {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return "txt";
  return filename.slice(dot + 1).toLowerCase();
}

export function languageFor(filename) {
  const ext = extensionOf(filename);
  return LANGUAGES[ext] || LANGUAGES.txt;
}
