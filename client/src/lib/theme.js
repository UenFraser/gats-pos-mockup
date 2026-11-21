// Two themes: light = your own theme (named in tailwind.config.js), dark = daisyUI's "luxury".
// The choice is PERSONAL: it is saved in this browser only (never on the server), per user, so one person's choice
// never changes anybody else's screen. The login screen uses the last choice made on this device.
export const THEME_NAMES = { light: 'gats', dark: 'luxury' }; // change 'gats' if your theme has another name

const DEVICE_KEY = 'gats_theme_device';
const userKey = (id) => `gats_theme_user_${id}`;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: the choice just will not be remembered */ } },
};

export const readDeviceTheme = () => (store.get(DEVICE_KEY) === 'dark' ? 'dark' : 'light');
export function readUserTheme(userId) {
  const v = store.get(userKey(userId));
  return v === 'dark' || v === 'light' ? v : null;
}
export const applyTheme = (mode) => document.documentElement.setAttribute('data-theme', THEME_NAMES[mode] || THEME_NAMES.light);
export function saveTheme(userId, mode) {
  store.set(DEVICE_KEY, mode);
  if (userId) store.set(userKey(userId), mode);
}
