# livelyhub — pure HTML/CSS/JS

No React, no Next.js, no build step, no npm install. Firebase is loaded
directly as a browser ES module from Google's CDN, so this runs as flat
static files.

## Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Realtime Database** (not Firestore).
3. **Local dev**: copy `.env.example` to `.env.local` and fill in your real
   Firebase config values (Project Settings > General > Your apps > SDK
   setup), then run:
   ```bash
   node --env-file=.env.local build-config.js   # Node 20.6+
   # older Node: export the same vars in your shell, then `npm run build`
   ```
   This writes `js/firebase-config.js` for you — it's gitignored, so it
   never gets committed with real credentials in it.
4. **Add your avatar art.** Create `assets/avatars/` in the project root and
   place your 21 images there, named `avatar-01.jpg` through `avatar-21.jpg`
   (sequential, zero-padded to 2 digits). The code expects exactly this path
   and naming — see `avatarPath()` in `js/roomUtils.js` if you need to change
   it. **License check**: if these came from a stock/portrait-art source,
   confirm the license actually covers using them as in-app user avatars
   (portrait/likeness rights are separate from the art style's copyright).
5. **Serve the folder over http(s) — don't just double-click `index.html`.**
   Browsers block ES module imports (`type="module"`) on the `file://`
   protocol. Any of these work:
   ```bash
   python3 -m http.server 5500
   # or
   npx serve .
   ```
   Then open `http://localhost:5500`.
6. **Deploy to Vercel with real credentials injected at build time:**
   - Push this project to a git repo (or use `vercel` CLI directly) and
     import it in Vercel.
   - In the Vercel project's **Framework Preset**, choose "Other".
   - Set **Build Command** to `npm run build` (or `node build-config.js`).
   - Set **Output Directory** to `.` (the project root — there's no
     separate build output folder, `build-config.js` just writes
     `js/firebase-config.js` in place before Vercel serves the static
     files).
   - In **Project Settings > Environment Variables**, add the 7 variables
     from `.env.example` with your real Firebase values.
   - Name the project `livelyhub` to land on `livelyhub.vercel.app`.
   - Every deploy now runs the build script fresh, so `js/firebase-config.js`
     is generated from Vercel's environment variables and never needs to
     exist in your repo with real values in it.

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
index.html             Landing page — name/avatar picker, create/join a room
room.html                The room itself — editor + chat
assets/avatars/            Your 21 avatar JPGs go here (avatar-01.jpg ... avatar-21.jpg)
css/styles.css                Black+amber theme, avatar grid/bubble styling, animations
build-config.js                  Generates js/firebase-config.js from env vars at build time
.env.example                       Template listing the required env var names (no real values)
js/firebase-config.js                Auto-generated, gitignored — don't edit or commit directly
js/roomUtils.js                        Firebase read/write logic, avatar path helper
js/crypto.js                             Content encryption
js/notifications.js                        "Someone's editing" alerts
js/embers.js                                 Canvas ember particle background
js/home.js                                     index.html: create/join + identity picker
js/editor.js                                     Lock claiming, states, encryption, notifications
js/chat.js                                         Message rendering/sending, avatar bubbles
js/room.js                                           Orchestrates room.html
```

## On "securing" the Firebase config

Worth knowing: the values in `firebase-config.js` (`apiKey`, `authDomain`,
etc.) are not actually secret — every Firebase web app ships this config in
its client-side JavaScript, visible to anyone who opens DevTools, regardless
of how it's stored server-side. The real access-control boundary is your
**Realtime Database rules** (above), not whether this file is hidden.

What the env-var/build-script setup above *does* give you: the values stay
out of your git history (so they're not sitting in a public repo), and it's
easy to point different environments (dev/prod) at different Firebase
projects. That's a real, legitimate reason to do this — just don't mistake
it for making the Firebase project itself harder to reach.

## Theme: black + amber

Full reskin to a black background with amber/orange accents, to seamlessly
host your black-background avatar art. The trick making that work: avatar
`<img>` elements use `mix-blend-mode: screen`, which makes black pixels
contribute nothing to the final render — so the black square edges of each
JPG visually disappear into the black page background, leaving only the
amber linework visible, no hard image-box edges. This only works because
both the images and the page are black; if you ever swap in avatars with a
different background color, drop the `mix-blend-mode: screen` rule in
`css/styles.css` (search for it — three spots: `.avatar-cell img`,
`.you-avatar`, `.bubble-avatar`).

Fonts: `Rye` for display headers, `Kalam` for handwritten editor/chat text,
`IM Fell English` for general UI text — loaded via Google Fonts `<link>`
tags in both HTML files.

## Avatars

- Picked on the home page in a scrollable grid (`js/home.js`), persisted to
  `localStorage` alongside the name, carried into the room.
- Shown next to your name in the room header, and next to each chat message
  (your own on the right, others' on the left — see `js/chat.js`).
- Per-user color still exists under the hood (auto-assigned at join, no
  manual picker) — it's now just the accent for the lock/cursor status dot,
  not the primary identity marker.

## Ember particles

`js/embers.js` draws a lightweight canvas particle system — small, sparse
amber/orange dots drifting upward with a gentle flicker, across the whole
page. No library, plain `requestAnimationFrame`. Respects
`prefers-reduced-motion` (skips the animation entirely if set). Tune count/
speed/color via the constants at the top of that file.

## Content encryption

Document content and chat message text are encrypted client-side (AES-GCM)
before being written to Firebase; room metadata (code, expiry, presence,
lock) stays plain text. The key is derived from the room's 6-digit code
(PBKDF2) — meaningful against casual exposure, not against a motivated
attacker (a 6-digit code is brute-forceable). No migration for older rooms.
A failed decrypt shows a notice instead of garbled text.

## "Someone's editing" notifications

OS notification (permission requested right after joining) plus a tab-title
fallback, firing once per claim when someone else takes the pen while your
tab is hidden/unfocused. Clicking a notification just dismisses it.

## Not yet built (still worth discussing)

- Live per-character cursor position markers for non-active users
- Scheduled server-side cleanup of expired rooms (currently lazy-deleted only
  when someone tries to open an expired room)
- Rate-limiting / abuse protection on writes
- Custom ads (discussed, not yet implemented)
