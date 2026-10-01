# Stax — design tokens & setup

Four screens for the flashcards app, built with shadcn/ui + Tailwind:

- `pages/LandingPage.jsx` — marketing / entry page
- `pages/Dashboard.jsx` — collections, stats, "new set" entry point
- `pages/NewFlashcards.jsx` — paste text → generate cards
- `pages/ReviewFlashcards.jsx` — distraction-free review flow
- `components/layout/AppShell.jsx` — shared sidebar + topbar for the logged-in pages

## 1. Fonts

Add to your root HTML head (or via `next/font` if you're on Next.js):

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link
  href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap"
  rel="stylesheet"
/>
```

## 2. Tailwind config

Add these to `tailwind.config.js` under `theme.extend`:

```js
extend: {
  colors: {
    paper: "#F5F6F2",
    ink: "#1C2321",
    denim: "#3D5A80",
    coral: "#EE6C4D",
    moss: "#588157",
    hairline: "#E4E2D6",
  },
  fontFamily: {
    serif: ["Fraunces", "ui-serif", "Georgia", "serif"],
    sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
  },
}
```

## 3. shadcn/ui components used

Install these via the shadcn CLI if you don't have them yet:

```
npx shadcn@latest add button card input textarea label badge avatar
npx shadcn@latest add progress tabs separator dropdown-menu select dialog
```

## 4. Notes

- Colors are also written as literal hex in the JSX (`bg-[#F5F6F2]` etc.) as a fallback
  in case you haven't wired up the Tailwind theme names yet — once you add the config
  above, feel free to swap `bg-[#F5F6F2]` → `bg-paper` throughout for cleanliness.
- These are static designs with mock data — wire up your own state/data fetching.
- Icons are from `lucide-react` (already a shadcn/ui dependency).
