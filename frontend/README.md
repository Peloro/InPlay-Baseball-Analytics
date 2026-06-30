# InPlay — Baseball Analytics

A mobile-first baseball game management platform. Track live games, manage rosters, record pitch-by-pitch stats, and analyze season performance — all offline-first with optional cloud sync.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite |
| Mobile | Capacitor (Android APK) |
| Backend | Node.js + Express + MongoDB |
| Storage | Local-first (IndexedDB) + cloud sync |

---

## Getting Started

### Prerequisites
- Node.js 18+
- Android Studio (for APK builds)

### Install & run (dev)

```bash
cd frontend
npm install
npm run dev
```

### Build & sync to Android

```bash
npm run build
npx cap sync android
npx cap open android   # opens Android Studio
```

---

## Branding Assets

Logo files are in `public/`:

| File | Use |
|---|---|
| `IP_BG.png` | Android app icon (source in `resources/icon.png`) |
| `IP_Square.png` | In-app nav bar & login page |
| `IP.png` | Wide/landscape lockup |
| `InPlay_Square_BG.png` | Wordmark with background |
| `InPlay_Square.png` | Wordmark transparent |
| `InPlay_BG.png` | Wide wordmark with background |

### Regenerating Android icons

If you update the logo, replace `resources/icon.png` and run:

```bash
npx capacitor-assets generate --android
```

---

## Color Palette

```css
--accent:       #6366f1   /* indigo — primary actions */
--accent-dark:  #4f46e5   /* deep indigo — gradients, borders */
--ink:          #eeeeff   /* lavender white — primary text */
--muted:        #6b6b7e   /* cool gray — secondary text */
--panel:        #131320   /* dark panel background */
--line:         #26263a   /* subtle borders */
--ctrl-bg:      #1e1e2a   /* input/control background */
background:     #09090f   /* app shell */
```

---

## Project Structure

```
frontend/
  src/
    pages/        # FieldPage, StatsPage, LoginPage, etc.
    components/   # Shared UI components
    services/     # API + local storage layer
  public/         # Logo assets, favicons
  resources/      # Capacitor asset source (icon.png)
  android/        # Android native project

backend/
  src/
    routes/       # REST API routes
    models/       # Mongoose schemas
```
