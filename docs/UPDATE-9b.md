# Update 9b: theme toggle, maximized window, app icon, table tokens, logo fix

## Three small edits in files I cannot see (do these once)

**1. `tailwind.config.js` (project root): add daisyUI's dark theme next to yours.** Keep your own theme object exactly as it is and add `'luxury'` after it:
```js
daisyui: {
  themes: [
    { gats: { /* your existing theme, unchanged */ } },
    'luxury',
  ],
},
```
If your theme is not called `gats`, change the name in two places: `THEME_NAMES` in `client/src/lib/theme.js` and the word `gats` in `client/public/theme-init.js`.

**2. `client/index.html`: load the theme script before the page is drawn.** Inside `<head>`, add this line (above the main module script):
```html
<script src="/theme-init.js"></script>
```
Keep `<html lang="en" data-theme="gats">`. This is what prevents a white flash for people who use the dark theme.

**3. App icon (once, and again whenever the logo changes).** Export your logo mark (the "iso", without the lettering) as a PNG, at least 512 x 512, with a transparent background. Then in the project folder:
```powershell
powershell -ExecutionPolicy Bypass -File .\tools\make-icon.ps1 -Source "C:\path\to\iso.png"
```
It writes `build\icon.ico` (the app and installer icon) and `client\public\images\app-icon.png` (the window icon). Run `npm run dist` afterwards. If Windows still shows the old icon, restart Explorer or the PC: Windows caches icons. (An SVG cannot be read by the script: export a PNG first.)

## Your logo problem

`./images/logo.png` is a path that depends on the page you are on. On `/desktop` it finds `/images/logo.png`, but on `/desktop/order` it looks for `/desktop/images/logo.png`, which does not exist, so the browser shows the alt text. A path that starts with a slash always means "from the top of the site":
```jsx
<img src="/images/logo.png" alt="Gat's Bar" className="h-12 w-auto" />
```
Use `/images/...` for every image, everywhere. (Your Shell header is kept as you wrote it; only that path changed, plus the theme button.)

## How the theme works

- Two themes: your own (light) and daisyUI "luxury" (dark). The sun/moon button in the header switches.
- It is **personal**: saved in that browser only, per person. When a manager switches theme, nobody else's screen changes. When someone logs in, their own theme is applied; the login screen uses the last choice made on that device.
- The app uses theme colours (`bg-base-100`, `text-success`...). Any colour you hard-code (like `#FAF7F2`) will not change with the theme, so use theme colours.

## If you already restyled some of these files

The zip replaces these five client files. If you changed any of them, do not overwrite: make only the small edits below.

| File | The only edit needed |
|---|---|
| `components/Shell.jsx` | Add `import { useTheme } from './ThemeProvider';` and `import Icon from './Icon';`, then `const { mode, toggle } = useTheme();` at the top of the component, and the sun/moon button (see my Shell.jsx) next to Log out. |
| `components/Icon.jsx` | Add the three entries `minus`, `sun`, `moon` to `ICONS`. |
| `components/OrderScreen.jsx` | In `TOKEN_REFRESH`, add `'tokens:changed'` after `'token:changed'`. |
| `pages/Settings.jsx` | `import TablesPanel from '../components/TablesPanel';` and one line `<div className="max-w-xl mt-8"><TablesPanel /></div>` above the `SystemPanel` line. |
| `main.jsx` | `import { ThemeProvider } from './components/ThemeProvider';` and wrap `<ConfirmProvider>...</ConfirmProvider>` in `<ThemeProvider>...</ThemeProvider>`. |

## Tables (Settings > Tables)

Plus adds one token to a zone: switched-off ones come back first, then new numbers are created. Minus switches off the highest number, and only when it is free (no open tab, reservation or ice request); otherwise it tells you which table to close first. Nothing is ever deleted, so past sales keep their table number. Each zone can have 1 to 60.
