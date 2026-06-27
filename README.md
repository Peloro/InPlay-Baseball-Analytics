<div align="center">
  <img src="frontend/public/Ativo%201Cporcotransparente.png" alt="CAASO Baseball Tracker" width="200"/>

  # CAASO Baseball Tracker

  **Live game tracking and season statistics for the CAASO  baseball team**

  [![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://reactjs.org/)
  [![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)](https://vitejs.dev/)
  [![Capacitor](https://img.shields.io/badge/Capacitor-8.4-119eff?logo=capacitor&logoColor=white)](https://capacitorjs.com/)
  [![Express](https://img.shields.io/badge/Express-5.2-000000?logo=express&logoColor=white)](https://expressjs.com/)
  [![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47a248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
  [![License](https://img.shields.io/badge/License-MIT-f5d400)](LICENSE)

  [Features](#-features) · [Installation](#-installation) · [Usage](#-usage) · [Configuration](#-configuration) · [Contributing](#-contributing)

</div>

---

## About

CAASO Baseball Tracker is a mobile-first app for live game tracking and statistics management for the **CAASO** university baseball team. The app runs fully offline — all data is stored locally in `localStorage` and synced with the backend in the background whenever a connection is available.

It is distributed as an **Android APK** via Capacitor and can also be used directly in the browser.

---

## Features

| | |
|---|---|
| **Interactive Field** | Drag-and-drop players onto the diamond, track the live score, balls, strikes, outs, and innings in real time |
| **Full Statistics** | Batting (AB, H, 2B, 3B, HR, BB, K, R, RBI) and Pitching (IP, K, BB, ER, pitch count) accumulated per season |
| **Game Management** | Pre-game lineup setup, batting order, in-game substitutions, opponent lineup tracking, and a per-play event log |
| **Training Mode** | Practice field with a free-draw canvas for tactical notes and player positioning |
| **Offline-First** | All data persists in `localStorage`. Works without internet; syncs with the backend silently in background |
| **Export** | Generate a printable game report as PDF for sharing or archiving |

---

## Installation

### Prerequisites

| Tool | Min version |
|---|---|
| Node.js | 18+ |
| npm | 9+ |
| Android Studio | For APK builds |
| Java JDK | 17+ (Capacitor requirement) |

### Quick Start

```bash
# Clone the repository
git clone https://github.com/Peloro/CAASO-Baseball-Tracker.git
cd CAASO-Baseball-Tracker

# Frontend
cd frontend
npm install

# Backend
cd ../backend
npm install
```

### Key Dependencies

| Package | Version | Role |
|---|---|---|
| `react` | 19.2 | UI framework |
| `vite` | 8 | Build tool & dev server |
| `@capacitor/android` | 8.4 | Android APK packaging |
| `express` | 5.2 | REST API |
| `mongoose` | 9.4 | MongoDB ODM |

---

## Usage

### Web Development

```bash
# Terminal 1 — Backend
cd backend
npm start

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

### Android APK Build

```bash
cd frontend
npm run build
npx cap sync android
npx cap open android   # Opens Android Studio to generate the APK
```

### App Navigation

| Tab | Purpose |
|---|---|
| **Jogo / Campo** | Live game view — interactive field, scoreboard HUD, pitcher controls, lineup |
| **Treino** | Practice field with free-draw canvas for tactical annotations |
| **Jogadores** | Player roster management — add, edit, and remove players |
| **Stats** | Season batting and pitching stats, sortable per player |

### Game Flow

1. **New Game** — Choose home/away, set the starting lineup and batting order
2. **Field Setup** — Drag players from the bench onto their positions on the diamond
3. **Live Tracking** — Use the HUD to record pitches, hits, outs, runs, and substitutions
4. **Finish Game** — End the game to commit all stats to the season totals


> The frontend works **100% offline** without the backend. `VITE_API_URL` is only used for optional background sync.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -m "feat: add my feature"`
4. Push to the branch: `git push origin feat/my-feature`
5. Open a Pull Request

### Open Areas

- Defensive stats (errors, putouts, assists)
- CSV data export
- iOS support via Capacitor
- Season progression charts
- Tournament mode (multiple teams)

---

## License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for details.

---

<div align="center">

  Made with ♥ for Brazilian university baseball

  [![GitHub](https://img.shields.io/badge/GitHub-Peloro-181717?logo=github)](https://github.com/Peloro)

</div>
