# UI guide: what you can change without breaking the POS

You design, the logic stays as it is. Everything that sells, prints, saves and talks to the server lives in code that
you do not need to touch. This page says exactly where the line is.

## 1. The safe way to work (do this every time)

1. **Commit first.** `git add -A` then `git commit -m "before restyling the waiter screen"`. If anything goes wrong, `git checkout .` puts everything back.
2. **One screen at a time.** Restyle one file, run `npm start`, look at it, then move on.
3. After each screen run `node tools/check-api.js` (it must say OK) and walk through the click checklist in section 8.
4. Commit again when the screen works.

## 2. Where things live

| Folder | What it is | Your job |
|---|---|---|
| `client/src/pages/` | One file per screen | Restyle (see section 3) |
| `client/src/components/` | Pieces used by screens (dialogs, cards, banners) | Restyle (see section 3) |
| `client/src/index.css` and the Tailwind config file | Colours, fonts, global look | **Your main design tools** |
| `client/public/` | Files served as they are: `sounds/`, and the new `images/` | Add images here |
| `client/src/lib/`, `client/src/auth/` | API calls, live connection, sounds, login | **Do not edit** |
| `server/`, `electron/`, `tools/`, `docs/` | The engine | **Do not edit** |

## 3. Inside a screen file: change this, not that

**Free to change** (cannot break the logic):
- Anything inside `className="..."` (Tailwind and daisyUI classes): colours, sizes, spacing, rounded corners, fonts, grid and flex layout, responsive classes.
- The visible words people read (labels, headings, button text, hints).
- Wrapping things in extra `<div>`s, reordering blocks, hiding purely decorative elements, adding icons and images.
- Swapping one daisyUI class for another (for example `btn-primary` for `btn-secondary`).

**Do not change** (this is the logic):
- Anything with `on...=` (`onClick`, `onChange`, `onKeyDown`...), `disabled=`, `value=`, `checked=`, `ref=`, `key=`.
- The lines at the top of a function: `const [x, setX] = useState(...)`, `useEffect`, `useCallback`, `useMemo`, `useConfirm()`, `useAuth()`.
- Every `api.get/post/patch/del(...)` call and the paths inside it (`'/api/...'`).
- Words that are values, not labels: `'READY'`, `'ADD'`, `'VOID'`, `'SWAP'`, `'LOCAL'`, `'ONLINE'`, `'CASH'`, role names, and anything inside `===` comparisons or `kind="..."` / `mode="..."` props.
- Route paths in `main.jsx`.
- The data names that come from the server (`s.ready`, `session.bill.dueCents`, `item.netQuantity`...).

**Always:**
- Money is shown with `php(cents)` from `lib/format.js`, never by hand.
- Confirmations use `useConfirm()`. Never use `window.confirm`, `alert` or `prompt` (they freeze text boxes in the desktop app).
- Messages use `<Notice>` so a click dismisses them.
- Keep buttons at least 44 px tall on phones (`h-11` or bigger) and keep text readable (do not go below `text-xs`).

## 4. Icons

Use the built-in `Icon` (no install, works offline, takes the text colour):

```jsx
import Icon from '../components/Icon';
<button className="btn btn-ghost btn-square" aria-label="New order" title="New order">
  <Icon name="plus" size={22} />
</button>
```

- **Every icon-only button needs `aria-label` and `title`** (the `title` is the hover tooltip; the `aria-label` is for screen readers).
- Names available now: `home`, `plus`, `calendar`, `chart`, `phone`, `users`, `settings`, `x`.
- **Add more:** go to lucide.dev, pick an icon, press "Copy SVG", and paste only the shapes inside the `<svg>` (the `<path>`, `<line>`, `<circle>` lines) as a new entry in `ICONS` in `components/Icon.jsx`, as one string. Keep the entry name short and lowercase.
- Prefer the same stroke style for every icon so the set looks consistent.

## 5. Images and logo

1. Put files in `client/public/images/` (create the folder). Use **SVG** for logos and icons, **WebP or PNG** for photos. Keep each file under about 200 KB.
2. Use them with a path that starts with a slash: `<img src="/images/logo.svg" alt="Gats Bar" className="h-8" />`, or in CSS `background-image: url('/images/pattern.png')`.
3. **Never use a web address** (`https://...`) for an image, font or script. The POS blocks outside content on purpose (security headers), and the restaurant internet can drop. Everything must come from your own files.
4. Always give `<img>` an `alt` text (or `alt=""` if it is only decoration).
5. The Windows app icon is separate: a 256x256 `build/icon.ico`, added in the `build` section of `package.json`. We will do that together at the end.

## 6. Fonts

No Google Fonts links (they are blocked and need internet). Install the font as a package and import it once:

```
npm install @fontsource/inter @fontsource/space-grotesk
```
```js
// client/src/main.jsx, at the top
import '@fontsource/inter/400.css';
import '@fontsource/inter/700.css';
import '@fontsource/space-grotesk/700.css';
```
Then set the font family in the Tailwind config (`theme.extend.fontFamily`).

## 7. Colours and theme (the style guide palette)

daisyUI colours everything from a theme. Define it once in the Tailwind config and the whole app follows:

```js
// tailwind.config.js
daisyui: {
  themes: [{
    gats: {
      primary: '#C2410C', 'primary-content': '#FFFFFF',
      secondary: '#0F766E', accent: '#1D4ED8', neutral: '#1B1A17',
      'base-100': '#FFFFFF', 'base-200': '#FAF7F2', 'base-300': '#E7E1D6',
      info: '#1D4ED8', success: '#15803D', warning: '#B45309', error: '#B91C1C',
    },
  }],
},
```
and set `<html lang="en" data-theme="gats">` in `client/index.html`. Keep green = added, red = removed, blue = swap, amber = bill: staff already read those colours.
Check contrast: normal text should be at least 4.5 to 1 against its background (a free checker: search "WebAIM contrast checker").

## 8. Click checklist after restyling a screen

- **Login:** tap a name, enter a wrong PIN (error shows, click it and it goes away), enter the right one.
- **Waiter phone:** pick a table, add items, send. Request a bill. Ask for ice.
- **Kitchen:** an order appears with sound; Done, History, Recall.
- **Cashier desktop:** open a tab; void (PIN), swap, discount, checkout with cash; reservations page; connect-phones window; Settings; Staff; Daily summary.
- **Log out** asks first on every screen.
- Resize the window to a phone width and to a wide monitor: nothing overlaps.

## 9. If you are unsure

Send me the file you changed (or a screenshot) before you commit. I will compare it with the original and tell you whether
any logic line moved, and I can fix it for you.
