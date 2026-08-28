const CONTENT = {
  about: {
    title: "About livelyhub",
    body: `
      <p>livelyhub is a shared, live coding room. Create a room, share the
      6-digit code, and everyone who joins can browse the same file tree,
      write code together, and chat — all without accounts or sign-up.</p>
      <p>Only one person can edit a given file at a time (a colored border
      shows who), and rooms automatically expire after 6 hours by default,
      extendable up to 7 days total.</p>
    `,
  },
  "how-to-use": {
    title: "How to use",
    body: `
      <ol>
        <li>Enter a name and click <strong>Create a room</strong>, or join an
        existing room with its 6-digit code.</li>
        <li>Use the file tree on the left to open, create, rename, or delete
        files and folders.</li>
        <li>Click anywhere in an open file to claim it — the border turns
        red while you're editing, amber when you're about to lose it from
        inactivity, and green when it's free for anyone to claim.</li>
        <li>Click <strong>Done</strong> to release a file immediately instead
        of waiting out the idle timeout.</li>
        <li>Use <strong>Run</strong> to execute JavaScript, HTML, CSS, or
        Python directly in your browser — Java, C, and C++ get syntax
        highlighting only, no execution.</li>
        <li>Download the current file or the whole project as a .zip from
        the toolbar.</li>
        <li>Open the members list or chat from the top bar to see who's here
        and talk without interrupting the file you're viewing.</li>
      </ol>
    `,
  },
  support: {
    title: "Support",
    body: `
      <p>Running into a bug or something not working as expected? A few
      things worth checking first:</p>
      <ul>
        <li>Make sure you're not opening <code>index.html</code> directly as
        a local file — livelyhub needs to be served over http(s).</li>
        <li>Refreshing the page keeps your name and identity, but a genuinely
        stuck lock should release itself after a few seconds of inactivity.</li>
        <li>Rooms expire automatically after 6 hours (extendable) — if a
        room code stops working, it may simply have expired.</li>
      </ul>
      <p>For anything else, use Contact developer to reach out directly.</p>
    `,
  },
  contact: {
    title: "Contact developer",
    body: `
      <p>This is an independent project. If you'd like to get in touch about
      a bug, a feature idea, or anything else, add your preferred contact
      details here (email, GitHub, etc.) — this section is a placeholder for
      you to fill in with your own information.</p>
    `,
  },
};

export function initMenu(menuBtnId, popupId) {
  const menuBtn = document.getElementById(menuBtnId);
  const popup = document.getElementById(popupId);
  if (!menuBtn || !popup) return;

  popup.innerHTML = `
    <div class="menu-popup-inner">
      <div class="menu-tabs">
        ${Object.entries(CONTENT)
          .map(
            ([key, section], i) =>
              `<button class="menu-tab ${i === 0 ? "menu-tab-active" : ""}" data-key="${key}">${section.title}</button>`
          )
          .join("")}
      </div>
      <div class="menu-panel-body">
        <button class="icon-btn menu-close-btn" aria-label="Close menu">✕</button>
        <div id="menuContent"></div>
      </div>
    </div>
  `;

  const content = popup.querySelector("#menuContent");
  const tabs = popup.querySelectorAll(".menu-tab");
  const closeBtn = popup.querySelector(".menu-close-btn");

  function showSection(key) {
    const section = CONTENT[key];
    content.innerHTML = `<h3>${section.title}</h3>${section.body}`;
    tabs.forEach((t) => t.classList.toggle("menu-tab-active", t.dataset.key === key));
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => showSection(tab.dataset.key)));
  showSection(Object.keys(CONTENT)[0]);

  const setOpen = (open) => {
    popup.hidden = !open;
  };

  menuBtn.addEventListener("click", () => setOpen(popup.hidden));
  closeBtn.addEventListener("click", () => setOpen(false));
  popup.addEventListener("click", (e) => {
    if (e.target === popup) setOpen(false);
  });
}
