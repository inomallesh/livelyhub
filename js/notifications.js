// js/notifications.js
//
// Two layers of "someone else is editing" alerting while you're away from
// the tab: a real OS notification (needs permission), and a tab-title
// change as a fallback that needs no permission at all.

const ORIGINAL_TITLE = document.title;

export async function ensureNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "default") {
    try {
      return await Notification.requestPermission();
    } catch {
      return "denied";
    }
  }
  return Notification.permission;
}

function isTabAway() {
  return document.hidden || !document.hasFocus();
}

/**
 * Call when someone else claims the lock. Fires an OS notification if
 * permitted, and always updates the tab title as a no-permission-needed
 * fallback signal. Both only apply while the tab is hidden/unfocused.
 */
export function notifyEditingStarted(name) {
  if (!isTabAway()) return;

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const n = new Notification("livelyhub", {
        body: `${name} started writing`,
        tag: "livelyhub-editing", // collapses rapid repeats into one notification
      });
      // Per design: clicking just dismisses, no tab-focus stealing.
      n.onclick = () => n.close();
    } catch {
      // Notification constructor can throw in some contexts — fail silently,
      // the tab-title fallback below still covers it.
    }
  }

  document.title = `✏️ ${name} is writing — livelyhub`;
}

export function clearEditingNotice() {
  document.title = ORIGINAL_TITLE;
}
