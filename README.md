# livelyhub — pure HTML/CSS/JS

No React, no Next.js, no build step, no npm install. Firebase is loaded
directly as a browser ES module from Google's CDN, so this runs as flat
static files.

## Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Realtime Database** (not Firestore).
3. Open `js/firebase-config.js` and replace the placeholder values with your
   own project's config (Project Settings > General > Your apps > SDK setup).
4. **Serve the folder over http(s) — don't just double-click `index.html`.**
   Browsers block ES module imports (`type="module"`) on the `file://`
   protocol. Any of these work:
   ```bash
   # Python
   python3 -m http.server 5500

   # Node (no install needed)
   npx serve .
   ```
   Then open `http://localhost:5500`.
5. To deploy: this is just static files, so drag the folder into Vercel,
   Netlify, or Firebase Hosting directly. Name the Vercel project `livelyhub`
   to land on `livelyhub.vercel.app`.

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
index.html          Landing page — create/join a room
room.html            The room itself — editor + chat
css/styles.css        All styling: glass panels, gradient orb background, animations
js/firebase-config.js Your Firebase project config (edit this)
js/roomUtils.js        All Firebase read/write logic, shared by both pages
js/home.js              Wires up the create/join buttons on index.html
js/editor.js            Lock claiming, red/green/amber states, heartbeat, Done button
js/chat.js               Message rendering + sending
js/room.js                 Orchestrates room.html: joins the room, starts the
                             expiry countdown, wires editor.js + chat.js together
```

## Design notes

- **Look**: dark frosted-glass panels (`backdrop-filter: blur`) floating over
  three slowly-drifting blurred gradient orbs (iOS accent colors: blue,
  purple, pink) — same visual language as macOS Control Center / iOS widgets.
  System font stack (`-apple-system` etc.) so it renders as actual SF Pro on
  Apple devices, with no external font download.
- **Motion**: panels fade/scale in on load, buttons have a spring "press"
  animation on click, chat bubbles pop in, and the editor's amber warning
  state pulses via `box-shadow` (not a hard border) for a soft glow rather
  than a jarring color swap.
- **Everything from our planning is implemented**: 6-digit room codes with
  collision retry, 6-hour expiry + "+2 hours" extend, single-writer lock via
  Firebase transaction (so simultaneous claims can't both win), 5-second idle
  auto-release, explicit "Done writing" button, green/red/amber outline
  states with the amber pulse warning in the last 1.5s, per-user colors
  assigned once at join and reused for both the lock indicator and chat
  bubbles, and WhatsApp-style chat (yours on the right, others on the left).

## Not yet built (still worth discussing)

- Live per-character cursor position markers for non-active users
- Scheduled server-side cleanup of expired rooms (currently lazy-deleted only
  when someone tries to open an expired room)
- Rate-limiting / abuse protection on writes
- Editable display name at join (currently auto-generated as `Guest-XXXX`)
