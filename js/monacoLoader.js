// js/monacoLoader.js
//
// Monaco (the real VS Code editor engine) ships as an AMD module, not an ES
// module, so it's loaded via its own require.js-based loader script rather
// than a normal <script type="module"> import. This file loads that loader
// once and resolves a promise with the `monaco` namespace once it's ready.

const MONACO_VERSION = "0.45.0";
const BASE_URL = `https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/${MONACO_VERSION}/min/vs`;

let monacoPromise = null;

export function loadMonaco() {
  if (monacoPromise) return monacoPromise;

  monacoPromise = new Promise((resolve, reject) => {
    const loaderScript = document.createElement("script");
    loaderScript.src = `${BASE_URL}/loader.js`;
    loaderScript.onload = () => {
      // eslint-disable-next-line no-undef
      require.config({ paths: { vs: BASE_URL } });
      // eslint-disable-next-line no-undef
      require(["vs/editor/editor.main"], () => {
        resolve(window.monaco);
      });
    };
    loaderScript.onerror = () => reject(new Error("Failed to load Monaco editor from CDN."));
    document.head.appendChild(loaderScript);
  });

  return monacoPromise;
}
