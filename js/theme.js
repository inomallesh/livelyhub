// js/theme.js
//
// Light/dark theme toggle. Applied via a data-theme attribute on <html>,
// read by css/styles.css. Call applyStoredTheme() as early as possible
// (each HTML file does this with a small inline script in <head>, before
// the stylesheet paints) to avoid a flash of the wrong theme.

const STORAGE_KEY = "lh_theme";

export function applyStoredTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  const theme = stored || "dark"; // dark is the default, IDE-style
  document.documentElement.setAttribute("data-theme", theme);
  return theme;
}

export function initThemeToggle(buttonEl) {
  updateIcon(buttonEl);
  buttonEl.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(STORAGE_KEY, next);
    updateIcon(buttonEl);
  });
}

function updateIcon(buttonEl) {
  const theme = document.documentElement.getAttribute("data-theme");
  // Sun icon when in dark mode (click to go light), moon icon when in light
  // mode (click to go dark) — the icon shown is what clicking it leads to.
  buttonEl.innerHTML =
    theme === "dark"
      ? `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.6"/><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
