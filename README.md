# livelyhub — pure HTML/CSS/JS

No React, no Next.js, no build step, no npm install. Firebase is loaded
directly as a browser ES module from Google's CDN, so this runs as flat
static files. One external dependency: two Google Fonts for the western
journal look (see Theme section below).

## Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Realtime Database** (not Firestore).
3. Open `js/firebase-config.js` and replace the placeholder values with your
   own project's config (Project Settings > General > Your apps > SDK setup).
4. **Serve the folder over http(s) — don't just double-click `index.html`.**
   Browsers block ES module imports (`type="module"`) on the `file://`
   protocol. Any of these work:
   ```bash
   python3 -m http.server 5500
   # or
   npx serve .
   ```
   Then open `http://localhost:5500`.
5. To deploy: this is just static files — drag the folder into Vercel,
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
index.html             Landing page — name/color picker, create/join a room
room.html               The room itself — editor + chat
css/styles.css           All styling: western journal theme, animations
js/firebase-config.js     Your Firebase project config (edit this)
js/roomUtils.js            Firebase read/write logic, shared by both pages
js/crypto.js                 Content encryption (see below)
js/notifications.js           "Someone's editing" alerts (see below)
js/home.js                     Wires up index.html's create/join + identity picker
js/editor.js                    Lock claiming, states, encryption, notifications
js/chat.js                       Message rendering/sending, per-message encryption
js/room.js                        Orchestrates room.html — join, expiry, rename
```

## Content encryption

Document content and chat message text are encrypted in the browser (AES-GCM
via the Web Crypto API) before being written to Firebase, and decrypted after
being read back. Room metadata (code, expiry, presence, who holds the lock)
stays in plain text, since the UI needs to read it instantly.

**Important limitation, by design**: the encryption key is derived from the
room's 6-digit code itself (via PBKDF2) — there's no separate passphrase.
This means anyone with the room code can decrypt it, same as they could just
open the room normally. What it *does* protect against is casual exposure —
e.g. someone browsing raw Firebase data without trying room codes one by
one. It is **not** meaningful protection against a motivated attacker (a
6-digit code is only ~900,000 possibilities, trivial to brute-force). This
only applies to rooms created after this change — there's no migration for
older data.

If a message or the document can't be decrypted (corrupted data, or content
from before encryption was added), the UI shows a "couldn't decrypt" notice
rather than displaying garbled ciphertext — a small banner replacing the
editor, or an italic placeholder per chat message.

## "Someone's editing" notifications

When someone else claims the writing lock while your tab is hidden or your
browser window isn't focused, you get:
- An OS-level notification (if you've granted permission — requested
  automatically right after you join a room)
- A tab title change (e.g. "✏️ deep is writing — livelyhub") as a fallback
  that works even without notification permission

Clicking a notification just dismisses it — it doesn't steal focus back to
the tab. Notifications are deliberately throttled to fire once per claim,
not on every keystroke.

## Theme

Reskinned from the earlier frosted-glass look to an original western/aged-
paper aesthetic — parchment panels, ink-toned accents, worn leather buttons
— inspired by that general genre, not reproducing any specific game's actual
assets. Two Google Fonts are loaded for this (`Rye` for headers, `Kalam` for
handwritten body/editor/chat text, `IM Fell English` for general UI text).
The paper grain texture is generated procedurally via an SVG `feTurbulence`
filter baked into a CSS data-URI — no external texture image needed.

The editor and chat panels are now a fixed equal height (620px on desktop,
480px on narrow/mobile layouts) so they line up visually.

## Not yet built (still worth discussing)

- Live per-character cursor position markers for non-active users
- Scheduled server-side cleanup of expired rooms (currently lazy-deleted only
  when someone tries to open an expired room)
- Rate-limiting / abuse protection on writes
- Custom ads (discussed, not yet implemented)
