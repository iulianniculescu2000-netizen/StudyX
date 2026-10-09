/**
 * Fire a desktop/OS notification for background agent tasks.
 * Uses the Electron native bridge when available, falling back to the Web
 * Notification API in the browser build. Always best-effort — never throws.
 */
export async function desktopNotify(title: string, body = ''): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.electronAPI?.notify) {
      await window.electronAPI.notify({ title, body });
      return;
    }

    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      } else if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') new Notification(title, { body });
      }
    }
  } catch {
    // Notifications are a nice-to-have; ignore failures.
  }
}
