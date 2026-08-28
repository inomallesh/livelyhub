import { getActiveFileContent, getActiveFileName, onActiveFileChange } from "./fileEditor.js";
import { languageFor, extensionOf } from "./languages.js";

const els = {
  runBtn: document.getElementById("runBtn"),
  outputPopup: document.getElementById("outputPopup"),
  outputBody: document.getElementById("outputBody"),
  outputTitle: document.getElementById("outputTitle"),
  outputCloseBtn: document.getElementById("outputCloseBtn"),
};

let pyodidePromise = null;

function setOutputOpen(open) {
  els.outputPopup.hidden = !open;
}

function clearOutput() {
  els.outputBody.innerHTML = "";
}

function appendLine(text, kind = "log") {
  const line = document.createElement("div");
  line.className = `output-line output-${kind}`;
  line.textContent = text;
  els.outputBody.appendChild(line);
  els.outputBody.scrollTop = els.outputBody.scrollHeight;
}

function appendPreviewFrame() {
  const frame = document.createElement("iframe");
  frame.className = "output-preview-frame";
  frame.setAttribute("sandbox", "allow-scripts");
  els.outputBody.appendChild(frame);
  return frame;
}

// -------------------- JavaScript: sandboxed iframe, console captured --------------------

function runJS(code) {
  const frame = document.createElement("iframe");
  frame.style.display = "none";
  frame.setAttribute("sandbox", "allow-scripts");
  document.body.appendChild(frame);

  const listener = (event) => {
    if (event.source !== frame.contentWindow) return;
    const { kind, args } = event.data || {};
    if (kind === "log" || kind === "error" || kind === "warn") {
      appendLine(args.join(" "), kind === "error" ? "error" : "log");
    }
  };
  window.addEventListener("message", listener);

  const bootstrap = `
    <script>
      ["log", "error", "warn"].forEach((method) => {
        const original = console[method];
        console[method] = (...args) => {
          window.parent.postMessage({ kind: method, args: args.map(String) }, "*");
          original.apply(console, args);
        };
      });
      window.onerror = (msg) => {
        window.parent.postMessage({ kind: "error", args: [String(msg)] }, "*");
      };
      try {
        ${code}
      } catch (err) {
        window.parent.postMessage({ kind: "error", args: [String(err)] }, "*");
      }
    <\/script>
  `;
  frame.srcdoc = bootstrap;

  setTimeout(() => {
    window.removeEventListener("message", listener);
    frame.remove();
  }, 5000);
}

// -------------------- HTML / CSS: live preview iframe --------------------

function runHTML(code) {
  const frame = appendPreviewFrame();
  frame.srcdoc = code;
}

function runCSS(code) {
  const frame = appendPreviewFrame();
  frame.srcdoc = `
    <html>
      <head><style>${code}</style></head>
      <body>
        <h1>Sample heading</h1>
        <p>Sample paragraph text to preview your styles against.</p>
        <button>Sample button</button>
        <div class="box" style="width:80px;height:80px;background:#8884;margin-top:12px;">.box</div>
      </body>
    </html>`;
}

// -------------------- Python: Pyodide (WebAssembly), lazy-loaded --------------------

function loadPyodideOnce() {
  if (pyodidePromise) return pyodidePromise;

  pyodidePromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
    script.onload = async () => {
      try {
        // eslint-disable-next-line no-undef
        const pyodide = await loadPyodide();
        resolve(pyodide);
      } catch (err) {
        reject(err);
      }
    };
    script.onerror = () => reject(new Error("Failed to load the Python runtime."));
    document.head.appendChild(script);
  });

  return pyodidePromise;
}

async function runPython(code) {
  appendLine("Loading Python runtime (first run only, ~15-20s)...", "info");
  try {
    const pyodide = await loadPyodideOnce();
    clearOutput();
    pyodide.setStdout({ batched: (msg) => appendLine(msg, "log") });
    pyodide.setStderr({ batched: (msg) => appendLine(msg, "error") });
    await pyodide.runPythonAsync(code);
  } catch (err) {
    appendLine(String(err), "error");
  }
}

// -------------------- Dispatch --------------------

export function initRunner() {
  els.runBtn.addEventListener("click", handleRun);
  els.outputCloseBtn.addEventListener("click", () => setOutputOpen(false));

  onActiveFileChange(() => updateRunButtonState());
  updateRunButtonState();
}

function updateRunButtonState() {
  const name = getActiveFileName();
  if (!name) {
    els.runBtn.disabled = true;
    els.runBtn.title = "Open a file first";
    return;
  }
  const lang = languageFor(name);
  els.runBtn.disabled = !lang.canRun;
  els.runBtn.title = lang.canRun
    ? `Run ${lang.label}`
    : `Running ${lang.label} isn't supported — syntax highlighting only`;
}

async function handleRun() {
  const name = getActiveFileName();
  if (!name) return;
  const lang = languageFor(name);
  if (!lang.canRun) return;

  const code = getActiveFileContent();
  els.outputTitle.textContent = `Output — ${name}`;
  clearOutput();
  setOutputOpen(true);

  const ext = extensionOf(name);
  if (ext === "js") runJS(code);
  else if (ext === "html") runHTML(code);
  else if (ext === "css") runCSS(code);
  else if (ext === "py") await runPython(code);
}
