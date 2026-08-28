# livelyhub

A shared, live-collaborative mini-IDE. Create a room, share the 6-digit
code, and everyone who joins gets the same file tree, can open and edit
files (one person per file at a time), chat, run code, and download the
project. No accounts, no backend of your own beyond Firebase.

No React, no Next.js, no bundler for the app code itself — everything loads
as browser-native ES modules or via CDN `<script>` tags (Firebase, Monaco,
Pyodide, JSZip). The one exception is `build-config.js`, a small Node script
that injects your Firebase credentials from environment variables at deploy
time — see Setup.

## Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Realtime Database** (not Firestore).
3. **Local dev**: copy `.env.example` to `.env.local`, fill in your real
   Firebase config values (Project Settings > General > Your apps > SDK
   setup), then run:
   ```bash
   node --env-file=.env.local build-config.js   # Node 20.6+
   ```
   This writes `js/firebase-config.js` — it's gitignored, never committed
   with real values in it.
4. **Serve over http(s)** — don't open `index.html` directly via `file://`;
   ES modules are blocked there. Any of:
   ```bash
   python3 -m http.server 5500
   # or
   npx serve .
   ```
5. **Deploy to Vercel:**
   - Framework Preset: "Other"
   - Build Command: `npm run build` (or `node build-config.js`)
   - Output Directory: `.`
   - Add the 7 variables from `.env.example` in Project Settings >
     Environment Variables.
6. **Restrict your Firebase API key** in Google Cloud Console (Credentials >
   your browser key > HTTP referrers) to your actual domain — see "On
   securing the Firebase config" below for why this matters more than
   hiding the key.

## Firebase Realtime Database rules (starting point)

```json
{
  "rules": {
    "rooms": {
      "$roomCode": {
        ".read": true,
        ".write": true,
        ".validate": "$roomCode.matches(/^[0-9]{6}$/)"
      }
    }
  }
}
```

## File map

```
index.html               Landing page — name field, create/join a room, menu
room.html                  The room — sidebar file tree + Monaco editor + toolbar
css/styles.css                VS Code-inspired light/dark theme, IDE layout
build-config.js                 Generates js/firebase-config.js from env vars
.env.example                      Template of required env var names (no values)

js/firebase-config.js               Auto-generated, gitignored
js/roomUtils.js                       Firebase logic: rooms, files, locks, members, chat
js/languages.js                         Extension → Monaco language + "can run" map
js/monacoLoader.js                        Loads the Monaco editor engine from CDN
js/fileEditor.js                            Monaco instance, per-file lock/claim/states
js/fileTree.js                                Sidebar: file CRUD, lock badges, toasts
js/runner.js                                    JS/HTML/CSS/Python execution, output window
js/download.js                                    Current-file and whole-project .zip download
js/chat.js                                          Popup chat, unread badge
js/members.js                                         Members list, online/offline status
js/notifications.js                                     "Someone's editing" browser alerts
js/theme.js                                               Light/dark toggle
js/menu.js                                                  About/How to use/Support/Contact popup
js/crypto.js                                                  Per-file content + chat encryption
js/room.js                                                      Orchestrates room.html
```

## Multiple open files: tabs + VS Code-style split panes

Clicking a file in the sidebar opens it as a tab (`js/fileEditor.js`) rather
than replacing whatever's already open. Each open file gets its own Monaco
model that persists across switches — undo history, cursor position, and
scroll position all survive tab-switching, exactly like a real editor.

Click the split icon in the toolbar to open a second pane side by side
(splits in your next open tab by default). Each pane tracks its own file's
lock state independently — the border color, claim hint, and read-only
state are always accurate to whatever that specific pane is showing, even
if the other pane is showing a file locked by someone else. The shared
status bar at the bottom (and the Done button) reflects whichever pane you
last clicked into. Closing a pane's last tab collapses the split back to a
single pane.

## Sidebar toggle

The icon at the left of the toolbar slides the file tree closed/open
(`#ideBody.sidebar-collapsed`, a pure CSS width transition) — useful for
reclaiming horizontal space while writing.

## Fixed: click-to-claim not registering in Monaco

Earlier, clicking a claimable (green) file sometimes did nothing — Monaco's
own "Cannot edit in read-only editor" tooltip was intercepting the click
before our claim handler saw it. Fixed by binding the claim-attempt listener
directly to the editor's DOM container in the capture phase, so it fires
before Monaco's internal read-only handling gets a chance to swallow it.

## Architecture: per-file locking, not one lock for the whole room

Each file in the tree has its OWN content string and its OWN write lock —
not one lock for the entire room. Two people can genuinely edit two
different files in the same room at the same time. The claim/release/idle-
timeout/amber-warning behavior is identical to before, just scoped to
whichever file is open (`rooms/{code}/files/{fileId}/activeEditor` instead
of a single `rooms/{code}/activeEditor`).

Folders and files live in a flat `rooms/{code}/files/{fileId}` map, each
node carrying a `parentId` pointing at its folder (or `null` for top-level)
— the sidebar builds the visual tree from that.

## The editor: Monaco

Monaco is the actual VS Code editor engine, loaded via its own AMD loader
script (`js/monacoLoader.js`) rather than an ES module import — that's just
how Monaco ships. It gives real syntax highlighting for JavaScript, HTML,
CSS, Python, Java, C, and C++ out of the box, and its own Dark+/Light+
themes, which `js/room.js` keeps in sync with the app's light/dark toggle.

## Awareness: file tree badges + toasts

`js/fileTree.js` shows a colored dot next to any file someone else
currently has locked (always visible), and pops a dismissible toast in the
corner when a file you're NOT currently viewing gets newly claimed —
clicking the toast jumps you straight to that file. The very first batch of
files on load doesn't trigger toasts (only genuinely new claims after that).

## Code execution

Run button in the toolbar, enabled only for JavaScript, HTML, CSS, and
Python — all sandboxed and running entirely in your own browser:
- **JavaScript** runs in a sandboxed, hidden iframe; `console.log/warn/error`
  and uncaught errors are captured and shown in the floating output window.
- **HTML** renders live in a preview iframe inside the output window.
- **CSS** is wrapped in a small sample page so you can see it applied.
- **Python** runs via Pyodide (real Python compiled to WebAssembly),
  lazy-loaded on first use — expect a one-time ~15-20s load the first time
  anyone runs Python in a session, since it's a genuinely large download.

**Java, C, and C++ deliberately do not execute** — they get full syntax
highlighting only. Real compilation/execution for these needs a proper
sandboxed backend (something like the Piston API), which this project
intentionally doesn't build itself: safely running arbitrary code submitted
by anyone with a room code is a serious, dedicated security problem, not
something to bolt on casually. If you want this later, routing through a
vetted third-party execution API is the direction — worth a fresh
conversation about the tradeoffs (code leaving the browser, rate limits,
an external dependency) before building it.

## Downloads

- **Current file**: downloads the open file's content with its own filename.
- **Whole project**: `js/download.js` lazy-loads JSZip from CDN, decrypts
  every file, rebuilds the folder structure from each file's `parentId`
  chain, and downloads a `.zip` named after the room code.

## Content encryption

File content and chat message text are encrypted client-side (AES-GCM)
before being written to Firebase; room metadata (files list structure,
expiry, presence, locks) stays plain text so the UI can read it instantly.
The key is derived from the room's 6-digit code (PBKDF2) — meaningful
against casual exposure, not a motivated attacker (a 6-digit code is
brute-forceable). A failed decrypt shows a notice instead of garbled text,
per-file for the editor and per-message for chat.

## "Someone's editing" notifications

OS notification (permission requested right after joining) plus a tab-title
fallback, firing once per claim when someone else takes the pen on the file
you currently have open, while your tab is hidden/unfocused. Clicking a
notification just dismisses it.

## Members list

A roster of everyone who's ever joined the room — online members show a
colored dot and green "online" badge; anyone who's left shows grayed out
with a relative "left Xm/h ago" time. Rejoining the same browser tab keeps
your original join time and color; leaving (tab close, network loss) flips
you to offline rather than deleting your history.

## On "securing" the Firebase config

The values in `firebase-config.js` are not actually secret — every Firebase
web app ships this config in its client-side JavaScript, visible to anyone
who opens DevTools, regardless of how it's stored server-side. The real
access-control boundary is your **Database rules** (above) and an
**HTTP-referrer-restricted API key** — not whether this file is hidden. The
env-var/build-script setup keeps values out of git history and makes
dev/prod separation clean, which are real, legitimate reasons to do it —
just don't mistake it for making the Firebase project itself harder to
reach.

## Not yet built (still worth discussing)

- Live per-character cursor position markers for non-active users
- Scheduled server-side cleanup of expired rooms (currently lazy-deleted only
  when someone tries to open an expired room)
- Rate-limiting / abuse protection on writes
- Java/C/C++ execution via a third-party sandboxed API (deliberately skipped)
- Custom ads (discussed early on, deprioritized, not implemented)
- Drag-and-drop file/folder reordering in the sidebar
