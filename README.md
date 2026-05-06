# ✨ Stargazer

A cozy constellation-drawing game built with TypeScript, Canvas 2D, and a custom game engine. Connect stars to form constellations, photograph them with vintage polaroid effects, and collect them in your journal. No external UI frameworks — just pure canvas rendering with a data-oriented architecture.

## 🎮 How to Play

### The Veranda

The game begins on the **Veranda** — a serene title screen with shooting stars drifting across the sky. Tap anywhere on the sky to start a new night of stargazing.

### The Night Sky

Each night generates a unique procedural sky full of stars, nebulae, and atmospheric haze — seeded so the same night always produces the same sky.

- **Pan** — Click and drag (or touch-drag) to explore the sky
- **Zoom** — Scroll wheel or pinch to zoom in/out
- **Rotate** — Two-finger rotate gesture (touch) to tilt the view
- **Draw constellations** — Tap or drag between glowing connectable stars to draw line segments and form your constellation
- **Undo** — Use the undo button (appears after drawing) to remove the last segment
- **Erase** — Use the erase button to clear all drawn segments

### Photo Mode

Once you've drawn at least one segment, a **camera button** appears in the bottom-right. Tap it to enter Photo Mode, where you can:

- **Frame** your constellation with different polaroid-style card formats (Classic, Square, Wide, Instax, Minimal, Film, Ornate)
- **Filter** the image with effects like Warm, Mono, Vintage, Dreamy, Cyanotype, Noir, and more
- **Light leaks** — Add warm overlays like Sunkiss, Sweep, Corners, Rainbow, or Warm Edge
- **Effects** — Toggle vignette, film grain, and bloom with intensity sliders
- **Name your constellation** and add an optional note
- **Capture** — Hit the shutter button to save your polaroid photo

### The Journal

Press `J` at any time on the Veranda or Night Sky to open the **Journal** — a flipbook of all your saved constellation photos. Browse your collection and inspect individual entries.

### Unlocks & Customization

Filters, frames, light leaks, and effects unlock progressively as you take more photos. The unlock thresholds range from 2 photos (Date Stamp) up to 100 photos (Bloom filter). Keep photographing to unlock everything!

### Ending a Night

Use the **End Night** button to return to the Veranda. Each night is tracked and numbered — come back to start the next one.

## 🛠 Prerequisites

- **[Node.js](https://nodejs.org/)** v18 or later (includes npm)

Verify your installation:

```bash
node --version   # should print v18.x or higher
npm --version    # should print 9.x or higher
```

## 🚀 Getting Started

```bash
# Go into the directory
cd stargazer

# Install dependencies
npm install

# Start the development server
npm run dev
```

The dev server will start at `http://localhost:5173` (default Vite port). Open it in any modern browser.

> **Tip:** Click the fullscreen button (top-left corner) for the best experience.

## 📜 Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server with hot reload |
| `npm run build` | Type-check with `tsc` then build for production |
| `npm run preview` | Preview the production build locally |

## 📁 Project Structure

```
stargazer/
  index.html              # Single-page entry point (<canvas id="game">)
  src/
    main.ts               # Bootstrap, world init, game loop
    style.css             # Full-screen canvas reset
    engine/               # Custom game engine (framework-agnostic)
      types.ts            # GameWorld, GameWorldContext interfaces
      time/               # Delta time, FPS tracking, time scale
      input/              # Unified pointer/touch/keyboard + gesture recognition
      camera/             # Viewport transforms, parallax, smooth interpolation
      renderer/           # Deferred draw-call queue with layer sorting
      scene/              # Scene lifecycle, transitions, additive scenes
      particles/          # High-performance SoA particle emitters
      audio/              # Volume groups, music crossfade (Howler.js)
      assets/             # Image, JSON, font loading with progress
      layout/             # Flexbox-inspired UI layout solver
      ui/                 # Pointer hit-testing and interaction callbacks
      gui/                # High-level UI widgets (button, slider, toggle, menu)
      ecs/                # Entity-Component-System (bitecs v0.4)
      trail/              # Motion trails with Catmull-Rom smoothing
    game/                 # Game-specific code
      scenes/             # Scene definitions (Veranda, NightSky)
      constellation/      # Star graph generation, drawing, segment management
      photo/              # Photo mode UI, filters, frames, light leaks, compose
      journal/            # Saved photo journal (flipbook browser)
      inspect/            # Full-screen photo/note inspection overlay
      night/              # Night lifecycle, seed generation, persistence
      customization/      # Unlock system, stats tracking, toast notifications
      ui/                 # Shared UI components (button styles, fullscreen)
    assets/               # JSON config files (frames, light leaks, customization)
    types/                # Ambient type declarations
  public/
    audio/                # Sound effects, music, and ambience
    images/               # Icons and UI assets
```

## ⚙️ Technology Stack

| Dependency | Purpose |
|---|---|
| [Vite](https://vite.dev/) | Build tool and dev server |
| [TypeScript](https://www.typescriptlang.org/) | Type safety (strict mode, ES2023 target) |
| [bitecs](https://github.com/NateTheGreatt/bitECS) | Entity-Component-System framework |
| [Tween.js](https://github.com/tweenjs/tween.js) | Easing and animation tweens |
| [Howler.js](https://howlerjs.com/) | Cross-browser audio playback |
| [gl-matrix](https://glmatrix.net/) | Vector/matrix math utilities |

## 🏗 Architecture Overview

Stargazer uses a **pipeline-based game loop** where each frame executes a fixed sequence of systems:

```
input → time → audio → scene → ui → movement → trails → particles → ecsRender → camera
```

All rendering is **deferred**: systems submit draw calls to a queue during the update phase, then a single `flush()` sorts them by layer/order and executes them with the appropriate camera transforms. This allows systems to be order-independent while still producing correctly layered output.

The world state is a single `GameWorldContext` object passed through all systems via bitecs's `World` wrapper. Each subsystem owns its own state slice (e.g., `world.time`, `world.camera`, `world.input`).

For detailed documentation of each engine system, see [DOCS.md](./DOCS.md).

## 📦 Building for Production

```bash
npm run build
```

Output goes to `dist/`. Serve it with any static file server:

```bash
npm run preview
```

## 🎧 Controls Reference

| Action | Mouse / Keyboard | Touch |
|---|---|---|
| Pan the sky | Click + drag | One-finger drag |
| Zoom | Scroll wheel | Pinch |
| Rotate | Shift + Scroll wheel | Two-finger rotate |
| Draw segment | Click a star | Tap a star |
| Open journal | `J` key | Bottom-right Button |
| Fullscreen | Top-left button | Top-left button |
