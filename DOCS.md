# Stargazer Documentation

Complete reference for the Stargazer engine **and** the game built on top of it. The engine half of this document covers each subsystem under `src/engine/`. The game half covers every gameplay feature under `src/game/` -- scenes, the constellation drawing loop, photo mode, the journal, inspect overlay, night progression, customization unlocks, cursor effects, and persistence.

Everything in `src/` is plain TypeScript on top of the HTML5 Canvas 2D context. There are no rendering frameworks; the engine is data-oriented (bitecs, structure-of-arrays particles, deferred draw queues) and the game is composed entirely from engine primitives.

---

## Table of Contents

### Engine

1. [Game Loop & Bootstrap](#1-game-loop--bootstrap)
2. [World Context](#2-world-context)
3. [Time System](#3-time-system)
4. [Input System](#4-input-system)
5. [Camera System](#5-camera-system)
6. [Renderer System](#6-renderer-system)
7. [Scene System](#7-scene-system)
8. [Particle System](#8-particle-system)
9. [Audio System](#9-audio-system)
10. [Asset System](#10-asset-system)
11. [Layout System](#11-layout-system)
12. [UI Interaction System](#12-ui-interaction-system)
13. [GUI Widget System](#13-gui-widget-system)
14. [ECS (Entity-Component-System)](#14-ecs-entity-component-system)
15. [Trail System](#15-trail-system)
16. [Math Utilities](#16-math-utilities)

### Game

17. [Scenes Overview](#17-scenes-overview)
18. [Constellation Drawing](#18-constellation-drawing)
19. [Photo Mode](#19-photo-mode)
20. [Journal](#20-journal)
21. [Inspect Overlay](#21-inspect-overlay)
22. [Night Progression](#22-night-progression)
23. [Customization & Unlocks](#23-customization--unlocks)
24. [Cursor FX](#24-cursor-fx)
25. [Reset & Persistence Map](#25-reset--persistence-map)
26. [Data Assets](#26-data-assets)

### Reference

27. [Design Patterns](#27-design-patterns)

---

## 1. Game Loop & Bootstrap

**File:** `src/main.ts`

### What It Does

The bootstrap function initializes the entire engine and starts the game loop. It is the single entry point for the application.

### How It Works

1. **Canvas setup** -- Grabs the `<canvas id="game">` element and its 2D rendering context.
2. **World creation** -- Constructs the `GameWorldContext` containing all subsystem states, then wraps it in a bitecs `World`.
3. **Input attachment** -- Binds pointer, keyboard, and wheel event listeners to the canvas.
4. **Resize handler** -- Listens for window resize events, updates the canvas backing size for the current device pixel ratio (`devicePixelRatio`), updates the layout root size, detects portrait/landscape orientation changes (`world.layout.orientation`, `orientationChanged`), and marks the layout tree as dirty.
5. **Scene registration** -- Registers all scene definitions with the scene manager.
6. **Cursor FX init** -- `initCursorFx(world)` reserves space for pointer-tracking sparkle emitters.
7. **Engine pipeline** -- Composes all per-frame systems into a single pipeline using bitecs `pipe()`.
8. **Main loop** -- On each `requestAnimationFrame`:
   - Runs the engine pipeline (all systems in order)
   - Updates the GUI tween group (`world.gui._tweenGroup.update()`)
   - Solves the layout tree (only if dirty)
   - Clears the canvas
   - Flushes all queued draw calls
   - Resets `orientationChanged` to false

### Pipeline Order

```
inputSystem -> timeSystem -> audioSystem -> sceneSystem -> uiSystem ->
movementSystem -> trailSystem -> cursorFxSystem -> particleSystem ->
ecsRenderSystem -> cameraSystem
```

**Why this order:**
- Input runs first so all other systems have access to the current frame's input.
- Time runs after input so delta is available to everything else.
- Audio syncs its playback rate to the time scale.
- Scene runs before UI so scene-spawned interactive elements are immediately hit-testable.
- Movement runs after scene (which may spawn/modify entities).
- Trails run after movement so they record updated positions.
- `cursorFxSystem` (game-level, registered by `initCursorFx`) emits particles based on the current pointer velocity, so it sits between trails and the particle update.
- Particles and ECS render submit draw calls.
- Camera runs last so interpolation reflects the final frame state.

After the pipeline, `flush()` sorts and executes all queued draw calls.

### Initial Scene

The bootstrap registers `verandaScene`, `nightSkyScene`, `journalScene`, and `inspectScene`, then calls `loadScene(world, 'Veranda')`. The Veranda scene additionally loads `Journal` as an additive scene so the journal button is always available from the menu.

### How to Use

You generally don't modify `main.ts` directly. To add a new scene:

```typescript
import { myScene } from './game/scenes/my.scene.ts';
registerScene(world, myScene);
```

To change the initial scene:

```typescript
loadScene(world, 'MySceneName');
```

---

## 2. World Context

**File:** `src/engine/types.ts`

### What It Does

Defines the central `GameWorldContext` interface that holds every subsystem's state. This is the single source of truth for the entire engine.

### Structure

```typescript
interface GameWorldContext {
  ctx: CanvasRenderingContext2D;   // The canvas rendering context
  canvas: HTMLCanvasElement;       // The canvas element
  time: TimeState;                 // Delta time, FPS, time scale
  scenes: SceneManagerState;       // Scene registry and lifecycle
  layout: LayoutRoot;              // UI layout tree (also tracks orientation)
  renderer: RendererState;         // Draw call queue
  input: InputState;               // Pointer, gestures, keyboard
  camera: CameraState;             // Viewport position, zoom, rotation
  audio: AudioState;               // Sound registry and playback
  assets: AssetState;              // Loaded images, JSON, fonts
  ui: UIState;                     // Hit-testing and interaction
  gui: GUIState;                   // GUI widget state (anims, menus, tween group)
  particles: ParticleSystemState;  // Active particle emitters
}
```

`GameWorld` is the bitecs `World<GameWorldContext>` type alias. Every system function receives and returns this world object.

The engine package re-exports everything from `src/engine/index.ts` (every subsystem barrel plus the world type aliases) so game code typically does not reach into individual subsystem folders directly.

---

## 3. Time System

**Files:** `src/engine/time/time.ts`, `src/engine/time/time.types.ts`

### What It Does

Tracks delta time, elapsed time, frame count, and FPS. Supports time scaling for slow-motion or pause effects.

### How It Works

Each frame, `timeSystem()`:

1. Computes `rawDelta` from `performance.now()`.
2. Caps it at `maxDelta` (default 0.1s) to prevent spiral-of-death after tab switches.
3. Multiplies by `timeScale` to produce `delta` (scaled) alongside `unscaledDelta`.
4. Accumulates `elapsed` and `unscaledElapsed`.
5. Increments the `frame` counter.
6. Accumulates `fixedStep` for fixed-timestep consumers.
7. Computes rolling-average FPS via a ring buffer (default 60 samples).

### Key Properties

| Property | Description |
|---|---|
| `delta` | Scaled delta time in seconds (`unscaledDelta * timeScale`) |
| `unscaledDelta` | Raw (capped) delta time, unaffected by time scale |
| `timeScale` | Multiplier: `1` = normal, `0.5` = half speed, `0` = paused |
| `elapsed` | Total scaled time elapsed since start |
| `unscaledElapsed` | Total unscaled time elapsed since start |
| `frame` | Frame counter (increments each frame) |
| `fps` | Rolling average frames per second |
| `maxDelta` | Maximum allowed delta (default `0.1s`) |
| `fixedStep` | Accumulated unscaled delta for fixed-step loops |
| `fixedInterval` | Target fixed-step interval (default `1/60`) |

### How to Use

```typescript
const dt = world.time.delta;          // scene/system update tick
world.time.timeScale = 0.5;            // slow motion
world.time.timeScale = 0;              // pause (audio also pauses)
const fps = Math.round(world.time.fps);
```

---

## 4. Input System

**Files:** `src/engine/input/input.ts`, `src/engine/input/input.types.ts`

### What It Does

Provides unified input handling for mouse, touch, and keyboard with built-in gesture recognition (tap, drag, pinch-zoom, rotation, mouse wheel).

### How It Works

**Event buffering:** Raw DOM events (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`, `wheel`, `keydown`, `keyup`) are buffered into arrays. The `inputSystem()` processes them once per frame, ensuring deterministic behavior.

**Pointer tracking:** A single primary pointer is tracked with `down`, `pressed` (true on the frame it went down), `released` (true on the frame it went up), screen-space `x`/`y`, and per-frame `dx`/`dy` deltas. Multi-touch points are also tracked individually so consumers like Cursor FX can iterate over each active finger.

**Gesture recognition:**

| Gesture | Trigger | Output |
|---|---|---|
| **Tap** | Press + release within `tapMaxDuration` (300ms) and `dragThreshold` (8px) | `gesture.tapped = true`, `tapX`/`tapY` |
| **Drag** | Sustained pointer movement beyond `dragThreshold` | `gesture.dragging = true`, `dragDX`/`dragDY` |
| **Pinch** | Two-finger distance change exceeding decaying threshold | `gesture.zoomDelta` (multiplicative) |
| **Rotate** | Two-finger angle change exceeding decaying threshold | `gesture.rotateDelta` (radians) |
| **Wheel Zoom** | Mouse wheel scroll | `gesture.zoomDelta`, `zoomX`/`zoomY` |
| **Wheel Rotate** | Shift + mouse wheel | `gesture.rotateDelta`, `rotateX`/`rotateY` |

**Decaying accumulators:** Pinch and rotate gestures use decaying accumulators (decay rate = 10/s, half-life ~70ms). This prevents false positives when finger motion stops -- the gesture deactivates ~150ms after motion ceases, requiring fresh intent to reactivate.

**Keyboard:** Three sets track key state:
- `keys.held` -- currently held keys
- `keys.pressed` -- keys that went down this frame
- `keys.released` -- keys that went up this frame

All use `KeyboardEvent.code` values (e.g., `'KeyA'`, `'ShiftLeft'`).

### Configuration

```typescript
const inputState = createInputState({
  dragThreshold: 8,            // px before drag triggers
  tapMaxDuration: 300,         // ms window for a tap
  wheelZoomSensitivity: 0.001,
  wheelRotateSensitivity: Math.PI / 600,
  pinchThreshold: 10,          // px of accumulated pinch motion
  rotateThreshold: 0.05,       // radians of accumulated rotation
});
```

### How to Use

```typescript
const { pointer, gesture, keys } = world.input;

if (gesture.tapped) { /* tapX/tapY */ }
if (gesture.dragging) panBy(world.camera, gesture.dragDX, gesture.dragDY);
if (gesture.zoomDelta !== 1) zoomAt(world.camera, sw, sh, gesture.zoomX, gesture.zoomY, gesture.zoomDelta);

if (isKeyPressed(world.input, 'Space')) { /* space just pressed */ }
if (isKeyHeld(world.input, 'ShiftLeft')) { /* shift held */ }
```

### Cleanup

```typescript
detachInputListeners(inputState);
```

---

## 5. Camera System

**Files:** `src/engine/camera/camera.ts`, `src/engine/camera/camera.types.ts`

### What It Does

Controls the viewport with position, zoom, and rotation. Provides smooth interpolation, parallax depth support, coordinate transforms, and optional world bounds.

### How It Works

**Smooth interpolation:** Each frame, `cameraSystem()` lerps the camera's actual position/zoom/rotation toward their target values using frame-rate-independent exponential decay:

```
t = 1 - exp(-speed * dt)
value += (target - value) * t
```

This produces smooth, consistent motion regardless of frame rate. Zoom interpolation happens in log-space for perceptually uniform zooming.

**Snapping:** When the camera is within `snapThreshold` of its target, it snaps exactly to prevent perpetual micro-adjustments.

**Bounds:** An optional `bounds` rectangle (`{minX, minY, maxX, maxY}`) constrains the camera so the viewport never leaves the defined area.

**Parallax:** The renderer uses the camera's `depth` parameter on draw calls:
- `depth = 1` -- moves 1:1 with the camera (default)
- `depth = 0` -- completely fixed (background)
- `depth = 0.5` -- moves at half speed (distant layer)

### Key Properties

| Property | Description |
|---|---|
| `x`, `y` | Current world-space position |
| `zoom` | Current zoom level |
| `rotation` | Current rotation in radians |
| `targetX`, `targetY` | Target position (camera lerps toward this) |
| `targetZoom` | Target zoom |
| `targetRotation` | Target rotation |
| `panLerpSpeed` | Position interpolation speed (default `20`) |
| `zoomLerpSpeed` | Zoom interpolation speed (default `10`) |
| `rotateLerpSpeed` | Rotation interpolation speed (default `10`) |
| `minZoom`, `maxZoom` | Zoom clamp range (default `0.1` to `10`) |
| `bounds` | Optional `{minX, minY, maxX, maxY}` |

### How to Use

```typescript
import {
  setPosition, setZoom, rotateBy, rotateAt,
  zoomAt, panBy, screenToWorld, worldToScreen,
} from './engine/camera/index.ts';

setPosition(world.camera, 100, 200);                 // smooth
setPosition(world.camera, 100, 200, true);           // instant
setZoom(world.camera, 2);
zoomAt(world.camera, screenW, screenH, mouseX, mouseY, 1.1);
panBy(world.camera, dragDX, dragDY);                  // respects rotation
rotateAt(world.camera, screenW, screenH, pivotX, pivotY, 0.1);
const wp = screenToWorld(world.camera, screenW, screenH, sx, sy);
const sp = worldToScreen(world.camera, screenW, screenH, wx, wy);
world.camera.bounds = { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 };
```

Lock the camera by setting `minZoom = maxZoom`. The Veranda scene does this so the menu cannot be panned or zoomed.

---

## 6. Renderer System

**Files:** `src/engine/renderer/renderer.ts`, `src/engine/renderer/renderer.types.ts`

### What It Does

Manages a deferred draw-call queue. Systems submit draw calls during the update phase, and the renderer sorts and executes them all at once during `flush()`.

### How It Works

**Queue-based rendering:** All drawing goes through `submit*()` functions that push entries onto a queue. Nothing is drawn immediately.

**Entry types:**
- `DrawEntry` (kind 0) -- Raw callback `(ctx) => { ... }`
- `NodeEntry` (kind 1) -- Layout node with `onRender`
- `EntityEntry` (kind 2) -- ECS entity with a registered renderer

**Sorting:** Entries are sorted by `(layer, order, kind)`. Lower layer values render first (behind), then lower order within the same layer. By convention layer `0` is the world background, layer `100`+ is HUD, and the night-sky scene uses layers up to `1000` for debug overlays.

**Camera transforms:** During flush, each entry gets the appropriate canvas transform:
- `worldSpace = true, depth = 1` -- Full camera transform (translate + zoom + rotate)
- `worldSpace = true, depth != 1` -- Parallax transform (camera position scaled by depth)
- `worldSpace = false` -- No camera transform (screen-space, for HUD elements)

**Flush pipeline:**
1. Compute absolute layout positions
2. Collect layout nodes with `onRender` into the queue
3. Collect registered entity renderers into the queue
4. Sort everything
5. Execute each entry with `ctx.save()`/`ctx.restore()`
6. Clear the queue

### Submit Functions

```typescript
submit(world, layer, order, (ctx) => {
  ctx.fillStyle = 'red';
  ctx.fillRect(0, 0, 100, 100);
}, worldSpace, depth);

submitText(world, layer, order, 'Hello', x, y, {
  font: '24px serif', fill: '#fff', align: 'center', baseline: 'middle',
}, worldSpace, depth);

submitRect(world, layer, order, x, y, w, h, {
  fill: '#333', stroke: '#fff', strokeWidth: 2,
}, worldSpace, depth);

submitCircle(world, layer, order, cx, cy, radius, { fill: 'blue' }, worldSpace, depth);

submitLine(world, layer, order, x1, y1, x2, y2, {
  stroke: '#fff', width: 2, cap: 'round', dash: [5, 5],
}, worldSpace, depth);

submitImage(world, layer, order, imageElement, dx, dy, {
  width: 64, height: 64, rotation: Math.PI / 4,
  anchorX: 0.5, anchorY: 0.5, alpha: 0.8,
}, worldSpace, depth);
```

### Entity Renderers

For ECS entities that need custom rendering beyond sprites:

```typescript
registerEntityRenderer(world, eid, layer, (ctx, world, eid) => { /* draw */ }, order, worldSpace, depth);
setEntityLayer(world, eid, layer, order);
unregisterEntityRenderer(world, eid);
```

The renderer also exposes a `Rect` type (`{x, y, w, h}`) used by the photo and inspect systems for region descriptors.

---

## 7. Scene System

**Files:** `src/engine/scene/scene.ts`, `src/engine/scene/scene.types.ts`

### What It Does

Manages game scenes with lifecycle hooks (enter, update, exit), transitions between scenes, and additive (overlay) scenes.

### How It Works

**Scene definition:**

```typescript
interface SceneDef {
  name: string;
  onEnter: (world: GameWorld) => (() => void) | void;
  onUpdate: ((world: GameWorld) => GameWorld) | null;
  onExit: (world: GameWorld) => void;
}
```

- `onEnter` -- Called when the scene becomes active. May return a **disposer function** that runs before `onExit`.
- `onUpdate` -- Called every frame while the scene is active. Return the world.
- `onExit` -- Called when the scene is unloaded.

**Active scene:** Only one active scene at a time. Loading a new scene exits the current one.

**Additive scenes:** Multiple additive scenes can run simultaneously (overlays, persistent HUD). They don't replace the active scene. The game uses this for `Journal` and `Inspect`.

**Transitions:** Scenes can transition with a custom visual effect over a configurable duration:

```typescript
loadScene(world, 'NewScene', {
  duration: 0.5,
  render: (ctx, progress) => {
    ctx.fillStyle = `rgba(0,0,0,${progress})`;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  },
});
```

During a transition, the old scene's update still runs until `progress >= 1`, at which point it exits and the new scene enters. While `world.scenes._transition !== null`, scenes typically short-circuit their `onUpdate` to ignore further input.

### How to Use

```typescript
const myScene: SceneDef = {
  name: 'MyScene',
  onEnter(world) {
    const eid = spawnActiveEntity(world, Position, Velocity);
    return () => despawnEntity(world, eid);
  },
  onUpdate(world) { return world; },
  onExit(world) { /* additional cleanup */ },
};

registerScene(world, myScene);
loadScene(world, 'MyScene');

loadAdditiveScene(world, 'HUDOverlay');
unloadAdditiveScene(world, 'HUDOverlay');
```

---

## 8. Particle System

**Files:** `src/engine/particles/particles.ts`, `src/engine/particles/particles.types.ts`

### What It Does

High-performance particle emitters with structure-of-arrays (SoA) memory layout, rate-based and burst emission, lifetime curves for size/color/speed, gravity, and multiple render modes.

### How It Works

**SoA architecture:** Particle data is stored in flat `Float32Array` buffers (one per property: x, y, vx, vy, life, size, color channels, etc.). This is cache-friendly and avoids GC pressure from object allocation.

**Emission modes:**
- **Rate-over-time** -- Continuous emission at N particles/second.
- **Bursts** -- Emit a batch of particles at a specific time, optionally repeating at intervals.

**Particle lifecycle:** Each particle has a `life` timer that counts down. When it reaches zero, the particle is swapped with the last alive particle in the pool (compact swap), keeping all alive particles contiguous.

**Lifetime curves:** Properties can be animated over a particle's lifetime using piecewise-linear curves:
- `sizeOverLifetime` -- Multiplier on start size
- `speedOverLifetime` -- Multiplier on start speed
- `colorOverLifetime` -- Color gradient with arbitrary stops
- `rotationOverLifetime` -- Angular velocity range

**Simulation spaces:**
- `World` -- Particles inherit the emitter's position at spawn and move independently.
- `Local` -- Particles are relative to the emitter (move with it).

**Render modes:**
- `Circle` -- Filled circles
- `Rectangle` -- Filled rectangles (configurable aspect ratio)
- `Sprite` -- Textured quads from an image

### Emitter Configuration

```typescript
interface ParticleEmitterConfig {
  maxParticles: number;          // Pool capacity (default 100)
  duration: number;              // Emitter lifetime in seconds (default 5)
  looping: boolean;
  playOnAwake: boolean;
  simulationSpace: SimulationSpace;
  rateOverTime: number;
  bursts: BurstConfig[];

  shape: ShapeConfig;            // Point, Circle (radius, edge), or Rectangle (w, h)
  directionAngle: RangeValue;

  startLifetime: RangeValue;
  startSpeed: RangeValue;
  startSize: RangeValue;
  startRotation: RangeValue;
  startColor: RangeColor;

  gravityModifier: number;       // Multiplier on 980 px/s^2

  sizeOverLifetime: Curve | null;
  colorOverLifetime: ColorGradient | null;
  speedOverLifetime: Curve | null;
  rotationOverLifetime: RangeValue | null;

  renderMode: ParticleRenderMode;
  sprite: CanvasImageSource | null;
  rectWidth: number;
  rectHeight: number;
  blendMode: GlobalCompositeOperation;
  sortByAge: boolean;
  layer: number;
  order: number;
  worldSpace: boolean;
  depth: number;
}
```

### How to Use

```typescript
import {
  createEmitter, destroyEmitter,
  playEmitter, stopEmitter, pauseEmitter, resumeEmitter, resetEmitter,
  setEmitterPosition,
  range, fixed, fixedColor, linear, constant,
  EmitterShape,
} from './engine/particles/index.ts';

const emitter = createEmitter(world, {
  maxParticles: 200,
  rateOverTime: 40,
  startLifetime: range(1, 2.5),
  startSpeed: range(15, 40),
  startSize: range(2, 5),
  startColor: fixedColor(255, 220, 130),
  directionAngle: range(-Math.PI * 0.75, -Math.PI * 0.25),
  gravityModifier: -0.05,
  sizeOverLifetime: linear(1, 0),
  colorOverLifetime: [
    { t: 0,   r: 255, g: 220, b: 130, a: 0.8 },
    { t: 0.6, r: 200, g: 160, b: 80,  a: 0.5 },
    { t: 1,   r: 100, g: 80,  b: 40,  a: 0   },
  ],
  blendMode: 'lighter',
  worldSpace: true,
  layer: 0,
}, 0, 100);

setEmitterPosition(emitter, x, y);
pauseEmitter(emitter); resumeEmitter(emitter);
stopEmitter(emitter);            // existing particles fade out
stopEmitter(emitter, true);      // hard clear
resetEmitter(emitter);
destroyEmitter(world, emitter);
```

### Helper Functions

| Function | Description |
|---|---|
| `range(min, max)` | Random value between min and max |
| `fixed(value)` | Constant value |
| `fixedColor(r, g, b, a?)` | Constant RGBA color |
| `linear(start, end)` | Linear curve over lifetime |
| `constant(value)` | Flat curve |

---

## 9. Audio System

**Files:** `src/engine/audio/audio.ts`, `src/engine/audio/audio.types.ts`

### What It Does

Manages sound playback with volume groups, music crossfading, and automatic time-scale synchronization. Built on Howler.js.

### How It Works

**Volume groups (`VolumeGroup`):** `Master`, `Music`, `SFX`, `Ambient`. Each sound is assigned to a group; effective volume is `baseVolume * groupVolume * masterVolume`.

**Music management:** Only one music track plays at a time. `playMusic()` crossfades between the current and new track over a configurable duration.

**Time-scale sync:** `audioSystem()` runs each frame and syncs Howler's playback rate with `world.time.timeScale`. When `timeScale` becomes 0 it calls `pauseAll()`; when it leaves 0 it calls `resumeAll()`. Playback rate is clamped to Howler's valid range (0.5x -- 4.0x).

### Public API

```typescript
import {
  registerSound, unregisterSound,
  playSound, stopSound,
  playMusic, stopMusic,
  setGroupVolume, getGroupVolume,
  setMasterVolume,
  muteGroup, isGroupMuted,
  pauseAll, resumeAll,
  audioSystem,
} from './engine/audio/index.ts';
import { VolumeGroup } from './engine/audio/audio.types.ts';
```

| Function | Purpose |
|---|---|
| `registerSound(state, key, def)` | Register a Howl by key with a `VolumeGroup`, optional sprite map, loop flag, base volume. |
| `unregisterSound(state, key)` | Stop and unload the Howl. |
| `playSound(state, key, sprite?)` | Play a one-shot (optionally a named sprite). |
| `stopSound(state, key)` | Stop all playing copies of a key. |
| `playMusic(state, key, fadeMs?)` | Crossfade to a music track (default 1000ms). |
| `stopMusic(state, fadeMs?)` | Fade out current music (default 1000ms; pass `0` for immediate). |
| `setGroupVolume(state, group, v)` / `getGroupVolume(state, group)` | Group volume. |
| `setMasterVolume(state, v)` | Convenience for the `Master` group. |
| `muteGroup(state, group, muted)` / `isGroupMuted(state, group)` | Mute toggles. |
| `pauseAll(state)` / `resumeAll(state)` | Pause/resume independent of timeScale (also called by `audioSystem`). |

### Examples

```typescript
registerSound(world.audio, 'click', {
  src: ['/audio/click.mp3'], group: VolumeGroup.SFX, volume: 0.8,
});

registerSound(world.audio, 'bgm-main', {
  src: ['/audio/bgm.mp3'], group: VolumeGroup.Music, loop: true,
});

registerSound(world.audio, 'ui-sounds', {
  src: ['/audio/ui-sprite.mp3'], group: VolumeGroup.SFX,
  sprite: { hover: [0, 200], click: [300, 400], back: [800, 500] },
});

playSound(world.audio, 'ui-sounds', 'hover');
playMusic(world.audio, 'bgm-main', 2000);
stopMusic(world.audio, 0);

setGroupVolume(world.audio, VolumeGroup.SFX, 0.5);
muteGroup(world.audio, VolumeGroup.Music, true);
```

The night-sky scene uses the lower-level `world.audio._registry` and a Howler `'end'` event to schedule a randomized 5--20s gap between music plays; see [Section 17](#17-scenes-overview).

---

## 10. Asset System

**Files:** `src/engine/assets/assets.ts`, `src/engine/assets/assets.types.ts`

### What It Does

Loads images, JSON files, and web fonts asynchronously with progress tracking and error collection.

### How It Works

**Enqueue + load pattern:** Assets are first enqueued (specifying key, URL, and type), then loaded in batch with `loadAll()`. This allows a loading screen to display progress.

**Loading:** All pending assets load in parallel via `Promise.all()`. Each asset is stored in a type-specific map (images, JSON, fonts). Failed loads are collected in an error array but don't block other assets.

**Fonts:** Loaded via the `FontFace` API and added to `document.fonts`.

### How to Use

```typescript
import {
  enqueueImage, enqueueJSON, enqueueFont,
  loadAll, getImage, getJSON, getFont,
  isLoading, getProgress, getErrors,
} from './engine/assets/index.ts';

enqueueImage(world.assets, 'player', '/sprites/player.png');
enqueueJSON(world.assets, 'level-1', '/data/level1.json');
enqueueFont(world.assets, 'game-font', 'GameFont', '/fonts/game.woff2');

await loadAll(world.assets);

if (isLoading(world.assets)) {
  const progress = getProgress(world.assets);  // 0..1
}

const errors = getErrors(world.assets);
const playerImg = getImage(world.assets, 'player');
const levelData = getJSON<LevelData>(world.assets, 'level-1');
const font = getFont(world.assets, 'game-font');
```

The photo system instead loads its data files (`photo.filters.json`, `photo.frames.json`, `photo.lightLeaks.json`) and the `customization.config.json` synchronously via Vite `import` statements -- they are bundled, not fetched. See [Section 26](#26-data-assets).

---

## 11. Layout System

**Files:** `src/engine/layout/layout.types.ts`, `layout.solver.ts`, `layout.flex.ts`, `layout.stack.ts`, `layout.absolute.ts`, `layout.tree.ts`, `layout.render.ts`

### What It Does

A flexbox-inspired hierarchical layout solver for building UI. It computes the size and position of nodes in a tree, supporting flex layouts, stack layouts, and absolute positioning.

### How It Works

**Node tree:** The layout is a tree of `LayoutNode` objects. Each node has a parent, children, layout properties, and a computed output (`{x, y, width, height, absX, absY}`).

**Layout kinds:**

| Kind | Description |
|---|---|
| `Flex` | Flexbox-like layout with main/cross axis, justify, align, flex-grow/shrink |
| `Stack` | Simple linear stacking (horizontal or vertical) with gap |
| `Absolute` | Position children with `absLeft`/`absTop`/`absRight`/`absBottom` |

**Sizing modes:**

| Mode | Description |
|---|---|
| `Fixed` | Exact pixel size (`widthValue` = pixels) |
| `Percent` | Fraction of parent (`widthValue` = 0.0 to 1.0) |
| `FitContent` | Size determined by content (uses `measure` callback) |
| `Fill` | Expand to fill available space |

**Dirty flag optimization:** Nodes are only recomputed when marked dirty. Setting properties on a node should be followed by `markDirty()` (which propagates up to ancestors) or `markDirtySubtree()`.

**Orientation tracking:** The root layout exposes `orientation` (`'portrait' | 'landscape'`) and a one-frame `orientationChanged` flag. The bootstrap resize handler updates these. The journal scene reads them to switch between single-page and two-page spreads.

**Measure callbacks:** For content-sized nodes (e.g., text), a `measure` callback receives the canvas context and returns `{width, height}`.

**Render callbacks:** Nodes with an `onRender` callback are collected by the renderer and drawn at their computed absolute position.

### How to Use

```typescript
import {
  createNode, appendChild, removeChild, insertChild, configureNode,
  markDirty, markDirtySubtree,
} from './engine/layout/index.ts';
import { SizeMode, Direction, Justify, Align } from './engine/layout/layout.types.ts';

const panel = createNode(world.layout, 'my-panel');
configureNode(world.layout, panel, {
  widthMode: SizeMode.Fixed, widthValue: 300,
  heightMode: SizeMode.FitContent,
  direction: Direction.Column, justify: Justify.Center, alignItems: Align.Center,
  gap: 8, padding: { top: 16, right: 16, bottom: 16, left: 16 },
  layer: 10, order: 0,
  onRender: (ctx, node) => {
    const c = node.computed;
    ctx.fillStyle = '#333';
    ctx.fillRect(c.absX, c.absY, c.width, c.height);
  },
});

appendChild(world.layout, world.layout.root, panel);

panel.visible = false;            // hide subtree
panel.alignSelf = Align.End;       // override parent's alignItems
panel.flexGrow = 1;
removeChild(world.layout, panel);
```

### Alignment & Justification

`justify` controls distribution along the **main axis**: `Start`, `Center`, `End`, `SpaceBetween`, `SpaceAround`, `SpaceEvenly`.
`alignItems` controls alignment along the **cross axis**: `Start`, `Center`, `End`, `Stretch`.
`alignSelf` on a child overrides the parent's `alignItems` for that child. Set to `-1` to inherit.

---

## 12. UI Interaction System

**Files:** `src/engine/ui/ui.ts`, `src/engine/ui/ui.types.ts`

### What It Does

Provides pointer hit-testing against layout nodes and fires interaction callbacks (hover, press, tap, drag).

### How It Works

Each frame, `uiSystem()`:

1. **Hit-tests** the pointer position against the layout tree, traversing back-to-front (last child = topmost). The first interactive node under the pointer wins.
2. **Hover tracking** -- Fires `onHoverEnter`/`onHoverExit` when the hovered node changes.
3. **Press tracking** -- On `pointer.pressed`, fires `onPointerDown`. On `pointer.released`, fires `onPointerUp`.
4. **Tap detection** -- If the pointer was released on the same node it pressed on and a tap gesture fired, fires `onTap`.
5. **Drag** -- If a drag gesture is active and a node is pressed, fires `onDrag(node, dx, dy, world)`.

`world.ui._pressedId` is the entity-internal ID of the currently pressed node (`-1` when nothing is pressed). The night-sky scene reads it to suppress camera panning when the user is dragging on a UI element.

**Interaction states:** `Idle`, `Hovered`, `Pressed`, `Disabled`.

### How to Use

```typescript
import {
  registerInteraction, unregisterInteraction,
  setInteractionEnabled, getInteractionState,
} from './engine/ui/index.ts';

registerInteraction(world.ui, myNode, {
  onTap:         (node, world) => {},
  onHoverEnter:  (node, world) => {},
  onHoverExit:   (node, world) => {},
  onPointerDown: (node, world) => {},
  onPointerUp:   (node, world) => {},
  onDrag:        (node, dx, dy, world) => {},
  enabled: true,
});

setInteractionEnabled(world.ui, myNode, false);
const state = getInteractionState(world.ui, myNode);
unregisterInteraction(world.ui, myNode);
```

---

## 13. GUI Widget System

**Files:** `src/engine/gui/gui.ts`, `gui.elements.ts`, `gui.menu.ts`, `gui.anim.ts`, `gui.9slice.ts`, `gui.transitions.ts`, `gui.types.ts`

### What It Does

High-level UI widget builders on top of the layout and interaction systems: text, dynamic text, buttons, sprite buttons, panels, images, spacers, toggles, sliders, progress bars, modal menus, animations, state transitions, and 9-slice rendering.

### Widgets

#### Text

```typescript
import { createText } from './engine/gui/index.ts';

createText(world, parent, {
  text: 'Hello World',
  font: '24px serif', color: '#ffe4a1', layer: 10,
});
```

#### Dynamic Text

Text that updates reactively when a `Cell` value changes. The widget stores the cell and re-measures on the next layout solve when the value differs from the previous render:

```typescript
import { createDynamicText } from './engine/gui/index.ts';
import type { Cell } from './engine/gui/gui.types.ts';

const scoreCell: Cell<string> = { value: 'Score: 0' };
createDynamicText(world, parent, { text: scoreCell, font: '20px sans-serif', color: '#fff' });
scoreCell.value = 'Score: 100';   // automatic update next frame
```

#### Button

```typescript
import { createButton } from './engine/gui/index.ts';

createButton(world, parent, {
  text: 'Click Me',
  font: '16px sans-serif', color: '#fff',
  bgColor: '#444', hoverColor: '#555', pressColor: '#333',
  cornerRadius: 8,
  padding: { top: 12, right: 24, bottom: 12, left: 24 },
  onTap: (node, world) => {},
  transition: { hoverScale: 1.05, pressScale: 0.95, duration: 150 },
});
```

#### Sprite Button

```typescript
import { createSpriteButton } from './engine/gui/index.ts';

createSpriteButton(world, parent, {
  idleImage: 'btn-idle',
  hoverImage: 'btn-hover',
  pressImage: 'btn-press',
  disabledImage: 'btn-disabled',
  nineSlice: { top: 8, right: 8, bottom: 8, left: 8 },
  width: 200, height: 48,
  text: 'Start Game', textColor: '#fff',
  onTap: (node, world) => {},
});
```

#### Panel

```typescript
import { createPanel } from './engine/gui/index.ts';

createPanel(world, parent, {
  bgColor: 'rgba(0,0,0,0.7)',
  borderColor: '#555', borderWidth: 1, cornerRadius: 12,
  padding: { top: 20, right: 20, bottom: 20, left: 20 },
  direction: Direction.Column, justify: Justify.Start, alignItems: Align.Center,
  gap: 10,
  width:  { mode: SizeMode.Fixed,       value: 400 },
  height: { mode: SizeMode.FitContent,  value: 0 },
});
```

#### Image, Spacer

```typescript
createImage(world, parent, { image: getImage(world.assets, 'logo')!, width: 128, height: 128 });
createSpacer(world, parent, { flexGrow: 1 });
createSpacer(world, parent, { width: 20 });
createSpacer(world, parent, { height: 40 });
```

#### Toggle

```typescript
import { createToggle } from './engine/gui/index.ts';

const checked: Cell<boolean> = { value: false };
createToggle(world, parent, {
  checked,
  mode: 'switch',                // or 'checkbox'
  onColor: '#4488ff', offColor: '#666', thumbColor: '#fff',
  width: 48, height: 24,
  onImage: 'toggle-on',          // optional sprite for the on state
  offImage: 'toggle-off',        // optional sprite for the off state
  onChange: (value, node, world) => {},
});
```

#### Slider

`SliderConfig` supports both painted and sprite-based slider styling and works horizontally or vertically:

```typescript
import { createSlider } from './engine/gui/index.ts';

const volume: Cell<number> = { value: 0.8 };
createSlider(world, parent, {
  value: volume,
  min: 0, max: 1, step: 0.01,
  direction: 'horizontal',          // or 'vertical'
  trackWidth: 200, trackHeight: 6, trackCornerRadius: 3,
  trackColor: '#444', fillColor: '#4488ff',
  thumbRadius: 10, thumbColor: '#fff',
  thumbHoverColor: '#cce',          // optional: hover/press swap
  thumbPressColor: '#88f',
  trackImage: 'slider-track',       // optional: sprite track
  thumbImage: 'slider-thumb',       // optional: sprite thumb
  trackNineSlice: { top: 4, right: 4, bottom: 4, left: 4 },
  onChange: (val, node, world) => setGroupVolume(world.audio, VolumeGroup.Master, val),
});
```

#### Progress Bar

```typescript
import { createProgressBar } from './engine/gui/index.ts';

const progress: Cell<number> = { value: 0 };
createProgressBar(world, parent, {
  value: progress,
  width: 300, height: 12,
  bgColor: '#333', fillColor: '#4488ff', cornerRadius: 6,
  bgImage: 'pb-bg',                  // optional sprite background
  fillImage: 'pb-fill',              // optional sprite fill
  bgNineSlice:   { top: 6, right: 6, bottom: 6, left: 6 },
  fillNineSlice: { top: 6, right: 6, bottom: 6, left: 6 },
});
progress.value = 0.65;
```

### Menus

Modal overlays with backdrop, auto-centering, and stack management:

```typescript
import { pushMenu, popMenu, clearMenus, getTopMenu, isMenuOpen } from './engine/gui/index.ts';

pushMenu(world, {
  name: 'settings',
  backdropColor: 'rgba(0,0,0,0.5)',
  dismissOnBackdropTap: true,
  build: (content, world) => {
    createText(world, content, { text: 'Settings', font: '24px serif' });
    createButton(world, content, { text: 'Close', onTap: () => popMenu(world) });
  },
});

popMenu(world);
clearMenus(world);
const top = getTopMenu(world);
const open = isMenuOpen(world, 'settings');
```

### Animations

Built on Tween.js. The shared tween group is `world.gui._tweenGroup`, ticked every frame in the main loop. Animations modify a node's visual state (alpha, offset, scale, rotation) without changing layout.

```typescript
import {
  animate, animateFrom, fadeIn, fadeOut,
  slideIn, slideOut, scaleIn, pulse,
  stopNodeAnimations, attachAnimState,
} from './engine/gui/index.ts';
import { Easing } from '@tweenjs/tween.js';

fadeIn(world, myNode, 300);
fadeOut(world, myNode, 300, { onComplete: () => destroyGUINode(world, myNode) });
slideIn(world, myNode, 'left', 100, 400);
slideOut(world, myNode, 'right', 100, 400);
scaleIn(world, myNode, 300);
pulse(world, myNode, 1.1);

animate(world, myNode, { scaleX: 1.2, scaleY: 1.2, rotation: 0.1 }, {
  duration: 500, easing: Easing.Elastic.Out,
  delay: 100, repeat: 2, yoyo: true,
});

animateFrom(world, myNode, { alpha: 0, offsetY: -50 }, { duration: 400 });

stopNodeAnimations(world, myNode);
```

**Animatable properties:** `alpha`, `offsetX`, `offsetY`, `scaleX`, `scaleY`, `rotation` (radians, around node center).

### State Transitions

Automatic hover/press animations for interactive nodes:

```typescript
attachTransitions(world, myButton, {
  duration: 150,
  hoverScale: 1.05,
  pressScale: 0.95,
  pressOffsetY: 2,
});
```

### 9-Slice Rendering

Scale images without distorting corners/edges:

```typescript
drawNineSlice(ctx, image, x, y, width, height, { top: 8, right: 8, bottom: 8, left: 8 });
```

### Cleanup

```typescript
destroyGUINode(world, myNode);  // recursively kills children, tweens, anim states, interactions
```

---

## 14. ECS (Entity-Component-System)

**Files:** `src/engine/ecs/ecs.ts`, `components.ts`, `queries.ts`, `systems/movementSystem.ts`, `systems/renderSystem.ts`, `systems/trailSystem.ts`

### What It Does

Data-oriented entity management using [bitecs](https://github.com/NateTheGreatt/bitECS) v0.4. Entities are integer IDs, components are structure-of-arrays (SoA), and systems are query-driven functions.

### Components

| Component | Properties | Description |
|---|---|---|
| `Position` | `x`, `y` | World-space position |
| `Velocity` | `x`, `y` | Velocity in px/s |
| `Rotation` | `angle` | Rotation in radians |
| `Scale` | `x`, `y` | Scale factors |
| `Sprite` | `imageIndex`, `width`, `height`, `anchorX`, `anchorY`, `alpha` | Sprite rendering data |
| `RenderLayer` | `layer`, `order`, `worldSpace`, `depth` | Draw ordering and parallax |
| `Active` | (tag) | Marks entity as active |
| `Trail` | (tag) | Entity has an attached trail |

Components use the SoA pattern:

```typescript
Position.x[eid] = 100;
Position.y[eid] = 200;
```

### Built-in Systems

- **Movement System** -- Integrates velocity into position for entities with `Position` and `Velocity`.
- **ECS Render System** -- For entities with `Position`, `Sprite`, `RenderLayer`, and `Active`, submits sprite draw calls. Honours `Rotation` and `Scale` if present.
- **Trail System** -- For entities with `Position`, `Trail`, `RenderLayer`, and `Active`, records trail points and submits trail renders. Trails render one order below their entity.

### Entity Lifecycle

```typescript
import {
  spawnEntity, spawnActiveEntity, despawnEntity,
  addComponent, removeComponent, hasComponent,
  setSpriteData, registerSpriteKey, getSpriteKeyName, getSpriteKeyIndex,
} from './engine/ecs/index.ts';

const eid = spawnActiveEntity(world, Position, Velocity, RenderLayer);
Position.x[eid] = 100; Position.y[eid] = 50;
Velocity.x[eid] = 200; Velocity.y[eid] = 100;
RenderLayer.layer[eid] = 1;
RenderLayer.worldSpace[eid] = 1;
RenderLayer.depth[eid] = 1;

addComponent(world, eid, Sprite);
setSpriteData(eid, 'player', 32, 32, 0.5, 0.5, 1.0);

addComponent(world, eid, Rotation);
Rotation.angle[eid] = Math.PI / 4;

if (hasComponent(world, eid, Velocity)) { /* ... */ }
removeComponent(world, eid, Velocity);
despawnEntity(world, eid);
```

### Sprite Key Registry

```typescript
const idx = registerSpriteKey('player-idle');
getSpriteKeyName(idx);             // 'player-idle'
getSpriteKeyIndex('player-idle');  // same idx
```

### Trails (ECS-attached)

```typescript
import { attachTrail, detachTrail, getTrail } from './engine/ecs/index.ts';

const trail = attachTrail(world, eid, {
  lifetime: 0.5, widthStart: 3, widthEnd: 0, color: '#ffe4a1',
  alphaStart: 0.9, alphaEnd: 0,
  smooth: true, smoothSegments: 3,
  blendMode: 'lighter', minDistance: 4,
});
```

---

## 15. Trail System

**Files:** `src/engine/trail/trail.ts`, `src/engine/trail/trail.types.ts`

### What It Does

Renders motion trails as smooth ribbons behind moving objects. Supports Catmull-Rom spline interpolation, variable width/alpha gradients, round caps, and additive blending.

### How It Works

**Point management:** Trail points are recorded with minimum distance spacing. Each point has an `age` that increases every frame. Points older than `lifetime` are removed.

**Catmull-Rom smoothing:** When `smooth = true`, points are subdivided using Catmull-Rom interpolation, producing smooth curves through the controls.

**Ribbon geometry:** The trail is rendered as a series of quad strips with perpendicular normals offset by half the width on each side. Width and alpha interpolate linearly from head to tail.

**Round caps:** Optional circular caps at the head and tail.

### Configuration

```typescript
interface TrailConfig {
  maxPoints: number;       // default 128
  lifetime: number;        // default 1
  widthStart: number;      // default 4
  widthEnd: number;        // default 0
  color: string;           // default '#ffffff'
  alphaStart: number;      // default 1
  alphaEnd: number;        // default 0
  minDistance: number;     // default 2
  smooth: boolean;         // default false
  smoothSegments: number;  // default 4
  roundCap: boolean;       // default true
  blendMode: string;       // default 'source-over'
}
```

### Standalone Usage (without ECS)

```typescript
import {
  createTrail, addTrailPoint, updateTrail, submitTrail,
  clearTrail, setTrailColor, submitPath,
} from './engine/trail/index.ts';

const trail = createTrail({
  lifetime: 0.8, widthStart: 6, widthEnd: 0,
  color: '#ff4444', smooth: true, blendMode: 'lighter',
});

addTrailPoint(trail, x, y);
updateTrail(trail, dt);
submitTrail(world, trail, layer, order, worldSpace, depth);

setTrailColor(trail, '#44ff44');
clearTrail(trail);
```

### Static Paths

For drawing polylines with per-point width and alpha (not time-based):

```typescript
submitPath(world, layer, order, [
  { x: 0,   y: 0,  width: 4, alpha: 1.0 },
  { x: 100, y: 50, width: 3, alpha: 0.8 },
  { x: 200, y: 20, width: 1, alpha: 0.2 },
], {
  color: '#ffffff', smooth: true, smoothSegments: 4,
  roundCap: true, blendMode: 'source-over',
}, worldSpace, depth);
```

The constellation system uses `submitPath` extensively to draw the multi-layer atmosphere/halo/bloom/core ribbons that make up each segment.

---

## 16. Math Utilities

**Files:** `src/engine/math/math.utils.ts`, `src/engine/math/perlin.noise.ts`, `src/engine/math/seeded.random.ts`

These helpers are not re-exported from `src/engine/index.ts`; import them by path.

### Scalar helpers (`math.utils.ts`)

| Function | Description |
|---|---|
| `clamp(v, min, max)` | Clamp a value to a range |
| `lerp(a, b, t)` / `inverseLerp(a, b, v)` | Linear interpolation and its inverse |
| `remap(v, inMin, inMax, outMin, outMax)` / `remapClamped(...)` | Re-map a value across two ranges |
| `normalize(v, min, max)` / `normalizeClamped(v, min, max)` | Normalize a value to `[0,1]` |
| `smoothstep(t)` / `smootherstep(t)` | Hermite easing on `[0,1]` |
| `mod(v, divisor)` / `wrap(v, min, max)` | Modulo and range wrap that handle negatives |
| `distance(x1,y1,x2,y2)` / `distanceSq(...)` | Euclidean distance (and squared, faster) |
| `toRadians(deg)` / `toDegrees(rad)` | Angle conversion |
| `angleBetween(x1,y1,x2,y2)` | `atan2`-based angle |
| `moveToward(current, target, maxDelta)` | Move a scalar toward a target by at most `maxDelta` |
| `sign(v)` | -1 / 0 / +1 |
| `approxEqual(a, b, epsilon?)` | Float tolerance comparison |
| `snap(v, step)` | Snap to nearest step |

### `PerlinNoise`

Seeded permutation-table Perlin noise.

```typescript
import { PerlinNoise } from './engine/math/perlin.noise.ts';

const noise = new PerlinNoise(seed);
noise.noise1D(x);
noise.noise2D(x, y);             // [-1, 1]
noise.noise3D(x, y, z);
noise.fbm2D(x, y, { octaves: 6, persistence: 0.5, lacunarity: 2 });
noise.reseed(newSeed);
```

The night-sky scene drives star placement off two `fbm2D` samples plus a `STAR_THRESHOLD`.

### `SeededRandom`

Deterministic RNG.

```typescript
import { SeededRandom } from './engine/math/seeded.random.ts';

const rng = new SeededRandom(seed);
rng.next();              // [0, 1)
rng.float(min, max);
rng.int(min, max);       // inclusive
rng.bool(probability?);
rng.pick(array);
rng.shuffle(array);      // Fisher-Yates, in-place
rng.reset();
```

The constellation generator and night-sky procedural placement use a `SeededRandom` derived from the night seed so the same night replays identically.

---

## 17. Scenes Overview

**Files:** `src/game/scenes/veranda.scene.ts`, `src/game/scenes/nightsky.scene.ts`, plus the additive scenes from `journal/journal.scene.ts` and `inspect/inspect.scene.ts`.

There are **four** registered scenes:

| Name | File | Role |
|---|---|---|
| `Veranda` | `veranda.scene.ts` | Main menu / night picker (active) |
| `NightSky` | `nightsky.scene.ts` | Gameplay scene (active) |
| `Journal` | `journal/journal.scene.ts` | Photo album (additive) |
| `Inspect` | `inspect/inspect.scene.ts` | Single-image viewer (additive) |

Both active scenes share a `fadeTransition()` helper that paints a `#050712` rectangle whose alpha follows a 0->1->0 ramp over 0.7s.

### Veranda Scene

The main menu / splash screen.

- Locks the camera at zoom 1, position (0,0), rotation 0; `minZoom = maxZoom = 1` so the menu cannot pan or zoom.
- Reads `getCompletedNightCount()` and shows:
  - Title "Stargazer".
  - Prompt "Tap the sky to begin Night N" (computed from completed nights + 1).
  - "X nights stargazed" counter when X > 0.
- Spawns shooting stars at 1.5--3.5s intervals as ECS entities (Position, Velocity, RenderLayer) with a Catmull-Rom trail attached.
- Emits ambient golden sparkles via a single particle emitter (additive blend, drifting up).
- Shows an FPS counter in the bottom-right corner.
- Loads the `Journal` scene additively so the journal button lives over the menu.
- A reset button (bottom-right) calls `resetAllData()` after a confirmation prompt -- see [Section 25](#25-reset--persistence-map).
- Tapping the central container (anywhere not on a registered control) calls `loadScene(world, 'NightSky', fadeTransition())` -- but only when no transition is in flight and the journal is closed.

### NightSky Scene

The gameplay scene. It composes the constellation, photo, journal, inspect, audio, customization, and night subsystems in one place.

**Camera setup**

- World size: 3000x3000 (`SKY_WORLD_SIZE`).
- `bounds = ±1500` so the viewport never leaves the sky.
- `minZoom` is computed every frame as `worstFitZoom(...)` over the current and target rotations, so the sky always fills the viewport during a rotation animation.
- `maxZoom = 2`. In photo framing mode `minZoom` is reduced to `fitZoom * 0.35` so the camera can pull back further.

**Procedural sky**

- `getCurrentNight() ?? startNight()` produces a `NightRecord` with a 31-bit seed.
- `generateNightSky(seed, ...)` populates the `_stars` array using a `PerlinNoise(seed)` and `SeededRandom(seed)` -- two Perlin samples are multiplied and thresholded against `STAR_THRESHOLD = 0.45`, then collisions are rejected via a spatial cell grid.
- Five hand-tuned `Nebula` records pulse and drift behind the stars.
- Stars are rendered with depth-based glow scaling (`STAR_DEPTH_FAR/NEAR`, `STAR_GLOW_SCALE_FAR/NEAR`, etc.).
- A "haze" particle emitter fills the screen with slow blueish particles using `EmitterShape.Rectangle` and `blendMode: 'lighter'` at layer `-50`.

**Audio**

- Registers `nightsky-music` (one-shot, `VolumeGroup.Music`, vol 0.6) and `nightsky-ambience` (loop, `VolumeGroup.Ambient`, vol 0.025).
- Ambience fades in over 1500ms using Howler's per-instance `fade()` against a saved target volume.
- Music starts immediately via `playMusic(..., 0)`. When the track ends, an `'end'` handler clears `_currentMusic` and schedules a 5--20s `setTimeout` that calls `playMusic` again, producing a randomized "between-track silence" loop.
- On exit: `stopMusic(MUSIC_FADE_OUT_MS)`, fades the ambience down over `AMBIENCE_FADE_OUT_MS = 1000`, unregisters both, clears the gap timer, and removes the `'end'` listener.

**Constellation, photo, journal, inspect**

- `_constellation = generateConstellation(seed, skyW, skyH, _stars)`.
- `_photoCtx` is a `PhotoSceneContext` carrying the loaded customization state and a `toastHandle`. Its `onPhotoSaved` callback disposes the current constellation so the next snapshot starts on a fresh canvas.
- `_photoButton` (only visible when `segments.length > 0` and the journal is closed) opens the photo flow.
- `_endNightButton` calls `endCurrentNight()` and returns to Veranda with a fade.
- `loadAdditiveScene(world, 'Journal')` keeps the journal button alive throughout the night.
- Per-frame: forwards `gesture.zoomDelta`/`rotateDelta` to `zoomAt`/`rotateAt` and `gesture.dragDX/DY` to `panBy`, **except** when:
  - `_constellation.drawing.active` (the player is dragging a constellation segment),
  - `world.ui._pressedId !== -1` (a UI element is pressed),
  - or the journal/inspect overlay is open.
- Debug overlay: shows `cam`, `zoom`, and `stars` text in the top-left at layer 1000 -- hidden during photo mode.

**Disposer behaviour**

The scene's disposer is the canonical example of full cleanup -- it stops music + ambience, destroys the haze emitter, exits photo mode if active, unloads `Journal`, destroys both buttons, disposes the photo overlay, destroys the toast layer, disposes the constellation (which destroys all pending sparkle emitters), restores the saved camera state, and clears the `_stars` array.

---

## 18. Constellation Drawing

**Files:** `src/game/constellation/constellation.types.ts`, `constellation.generator.ts`, `constellation.system.ts`, `constellation.render.ts`, `index.ts`

### What It Does

Generates a set of "connectable" stars laid out in clusters, lets the player press-and-drag to draw a path between them, and draws the resulting segments and live "rubber band" with multi-layer ribbons. There is no save -- the current draw is in-the-moment only and exists only until the next photo save or scene exit.

### Public API

```typescript
import {
  generateConstellation,
  updateConstellationSystem,
  findConnectableStarAt,
  undoLastSegment,
  disposeConstellation,
  drawConnectableStars,
  drawSegments,
  drawRubberBand,
  type ConstellationState,
  type ConnectableStar,
  type ConstellationCluster,
  type DrawnSegment,
  type ConstellationDrawing,
  type BackgroundStarLite,
  type RGB,
} from './game/constellation/index.ts';
```

### Core Types

```typescript
interface ConstellationState {
  stars: ConnectableStar[];
  clusters: ConstellationCluster[];
  selectionPath: number[];                                  // ordered star indices
  segments: DrawnSegment[];                                  // committed connections
  hitGrid: Map<number, number[]>;                            // spatial bins for fast hit-tests
  drawing: ConstellationDrawing;                             // active drag state
  pendingEmitters: { emitter: ParticleEmitterState; bornAt: number }[];
  closed: boolean;                                           // path forms a closed loop
  hue: RGB | null;                                           // locked palette colour
}
```

### Generation (`generateConstellation`)

- Cell-based clustering: clusters are placed in non-overlapping circles of radius `CLUSTER_RADIUS_MIN..MAX = 150..300`.
- Each cluster receives `STAR_MIN..MAX_PER_CLUSTER = 4..7` stars with radius `STAR_RADIUS_MIN..MAX = 6..10`.
- Stars are pushed into `hitGrid` using `HIT_CELL_SIZE = 200` for O(1) hit-test queries.
- Clusters with too few stars after collision rejection are orphaned (stars marked `clusterId = -1`) and filtered out.

### Update Loop (`updateConstellationSystem`)

Drives one frame of the drawing FSM:

1. **Press** -- `findConnectableStarAt(...)` looks up the topmost star under the pointer (using the `hitGrid`). If found, starts a new path or extends the current one and locks `state.hue` from a palette on first touch.
2. **Drag** -- The current pointer position becomes the rubber-band endpoint. If the player drags back near the previous star (within `DRAG_BACK_HALO_FRACTION = 0.55` of its halo), the previous star is popped from the path (an "undo" while drawing) and a sparkle emitter is fired.
3. **Arrival** -- Once the rubber-band endpoint enters the next star's halo, a new `DrawnSegment` is committed (animation duration `SEGMENT_DURATION = 0.25s`) and a sparkle emitter fires.
4. **Closure** -- If the path has at least `MIN_STARS_TO_CLOSE = 3` stars and the cursor is near the first star, the constellation auto-closes; `state.closed = true`.
5. **Release** -- Ends the drag. The path is preserved between drags so segments can chain.
6. **Keyboard undo** -- Pressing `KeyZ` calls `undoLastSegment(world, state)` which removes the last committed segment and drops a sparkle.
7. **Pending emitter cleanup** -- Emitters older than `SPARKLE_LIFETIME_CAP = 0.8s` are destroyed and removed from `pendingEmitters`.

The path empties + segments empty also clears `state.hue` so the next touch picks a fresh palette colour.

### Rendering

- `drawConnectableStars(world, state, time)` -- pulsing star halos and flares at layer 45. Selected stars brighten and expand.
- `drawSegments(world, state, time)` -- multi-layer ribbon for each committed segment using `submitPath`: an outer atmosphere, a halo, a bloom, and a bright core. Layer 50.
- `drawRubberBand(world, state, time)` -- the live tentative line from the last selected star to the cursor; suppressed during photo mode.

### Disposal

`disposeConstellation(world, state)` destroys every pending emitter and clears the state arrays. The night-sky scene calls it on photo save (so the next snapshot is empty) and again from its disposer.

### Storage

None. Constellations exist only while the night is active and the photo has not been taken.

---

## 19. Photo Mode

**Files under `src/game/photo/`:** `photo.types.ts`, `photo.system.ts`, `photo.capture.ts`, `photo.compose.ts`, `photo.effects.ts`, `photo.filters.ts`, `photo.frames.ts`, `photo.storage.ts`, `photo.theme.ts`, `photo.ui.ts`, `photo.ui.button.ts`, `photo.ui.framing.ts`, `photo.ui.panels.ts`, `photo.ui.shutter.ts`, `cosmetics.ops.ts`.

### What It Does

Photo mode lets the player frame, customise, capture, and save a polaroid-style snapshot of the current sky and constellation. It zooms the camera, draws a virtual paper card around the framed viewport, opens a tabbed customisation panel (filter / frame / fx), captures the canvas at boosted DPR, composites it with the chosen frame and effects, and persists the result to IndexedDB.

### Public API (`photo/index.ts`)

```typescript
import {
  // entry/exit
  enterPhotoMode, exitPhotoMode, updatePhotoMode, isPhotoModeActive,
  // capture & storage
  captureViewport, type CaptureRect,
  loadPhotos, savePhoto, revokePhotoUrls, generatePhotoId,
  // filters
  FILTERS, getFilter,
  // UI button & overlay
  buildPhotoButton, disposePhotoOverlay, type PhotoButtonHandle,
  // theme helpers used by other UI (inspect, journal)
  THEME, drawPanel, roundedPath,
  // types
  type PhotoMode, type PhotoModeState, type PolaroidGeometry,
  type SavedPhoto, type PhotoFilter, type PhotoCustomization,
  type PhotoTab, type StampSlot, type StampPlacement, type CaptionFontId,
  defaultCustomization,
} from './game/photo/index.ts';
```

### Mode FSM

```
framing -> capturing -> reveal -> shrink -> (exit)
```

| Mode | Behaviour |
|---|---|
| `framing` | Card visible, customization panel open, photo button hides. The framing UI is interactive. |
| `capturing` | Shutter animates closed (130ms), holds (50ms), opens (190ms). The actual canvas capture happens during the closed-hold. |
| `reveal` | Captured photo fades in inside the polaroid card (~650ms hold). |
| `shrink` | Photo and card scale down toward the journal button (600ms) before the mode exits. |

### Polaroid Geometry

Computed once per `enter`/orientation change. `PolaroidGeometry` describes the on-screen card and the inset viewport region:

```typescript
interface PolaroidGeometry {
  cardX: number; cardY: number; cardW: number; cardH: number;
  viewportX: number; viewportY: number; viewportW: number; viewportH: number;
  captionH: number;
  rotationRad: number;          // small random rotation, stable for the session
}
```

Each frame in `photo.frames.json` provides padding, caption height, paper/ink colours, corner radius, and the viewport aspect (e.g. `1`, `16/9`, `0.86`). `photo.compose.ts` uses these to produce the final composited PNG.

### Customization

```typescript
interface PhotoCustomization {
  filterId: string;          // 'none', 'warm', 'mono', 'vintage', 'dreamy', 'cyanotype', 'noir', 'golden', 'dusk', 'midnight', 'aurora', 'fade', 'bloom'
  frameId: string;           // see photo.frames.json
  vignetteIntensity: number; // 0..1
  grainIntensity: number;    // 0..1
  lightLeakId: string;       // 'none' or an id from photo.lightLeaks.json
  bloomIntensity: number;    // 0..1
  customBorderText: string;  // free-text caption / border stamp
}
```

`defaultCustomization()` returns the safe defaults (no filter, classic frame, all intensities at 0).

`PhotoModeState` adds runtime fields on top: the cached base/compose canvases and dirty flags, the active tab (`'filter' | 'frame' | 'fx'`), the draft name/note/tags, the saved camera bounds (so the camera is restored on exit), the shutter animation state, the post-capture scale/alpha, the options panel scroll position and viewport rect, and the list of HTML inputs that have been temporarily floated over the canvas.

### Capture (`photo.capture.ts`)

```typescript
interface CaptureRect { x: number; y: number; w: number; h: number; }
captureViewport(world, vp): string;   // returns a PNG data URL
```

`captureViewport` boosts the canvas backing store to a DPR sufficient to make the viewport at least 1x device-scale (clamped to a max output dimension of 4096px), temporarily disables the photo UI nodes, re-runs the renderer, and exports the framed region as a PNG.

### Composition

`photo.compose.ts` paints, in order:

1. The base canvas (filtered via `ctx.filter` from the chosen `PhotoFilter.cssFilter`).
2. Vignette darkening.
3. Grain (procedural noise scaled by `grainIntensity`).
4. Light leak overlay (cosmetic ops drawn from `photo.lightLeaks.json`).
5. Bloom (additive blur pass scaled by `bloomIntensity`).
6. Frame paper, caption text (custom border text / date stamp / stamps).

`cosmetics.ops.ts` is a small declarative renderer for the JSON-driven cosmetics: it understands shapes, gradients, text, and patterns so frames and light leaks can be added by editing JSON only.

### Saving

```typescript
generatePhotoId();                  // crypto.randomUUID() or a timestamp fallback
await savePhoto(photo);             // returns { ok: true } | { ok: false, reason }
await loadPhotos();                 // sorted ascending by takenAt
revokePhotoUrls(photos);            // call when leaving the journal
```

`savePhoto` converts the data URL to a Blob and `put`s it into the `photos` object store of the `stargazer` IndexedDB (keyPath `id`, secondary index on `takenAt`, current schema version `3`). `loadPhotos` lazily creates blob URLs for the returned records; the journal must call `revokePhotoUrls` to free them.

A successful save also:

- Calls `bumpCurrentNightPhotoCount()` so the night record reflects the count.
- Records the photo against `_photoCtx.customizationState` via `recordPhotoSaved(state, customization)`. Newly-unlocked items pop in via the toast handle.
- Triggers `_photoCtx.onPhotoSaved` so the night-sky scene wipes the constellation.

### UI

- `buildPhotoButton(world, isEnabled, onTap)` -- creates the floating polaroid button on the night-sky HUD. Returns `{ node, setVisible, setEnabled, ...}`.
- `disposePhotoOverlay(world)` -- destroys any leftover overlay nodes. Called from the night-sky disposer as a safety net.

`photo.ui.framing.ts` paints the dimmed area outside the framed viewport. `photo.ui.panels.ts` builds the tabbed customization panel. `photo.ui.shutter.ts` renders the shutter animation and triggers the capture at the correct moment. `photo.ui.ts` wires the various overlays together (entry/exit fade, draft name/note inputs, save modal).

### Persistence Summary

| Key | Where | Contents |
|---|---|---|
| IndexedDB `stargazer` -> `photos` | `photo.storage.ts` | All saved photos as Blobs + metadata |

No `localStorage` keys are used by photo mode itself.

---

## 20. Journal

**Files under `src/game/journal/`:** `journal.types.ts`, `journal.scene.ts`, `journal.system.ts`, `journal.image.cache.ts`, `journal.ui.book.ts`, `journal.ui.button.ts`, `journal.ui.page.ts`, `journal.ui.panels.ts`.

### What It Does

A virtual photo album. The player flips through previously-captured photos arranged two-per-page in landscape (four-per-spread) and one-page-at-a-time in portrait. Photos are loaded from IndexedDB on entry; image elements are cached and surrounding spreads are pre-fetched to mask pop-in.

### Public API

```typescript
import {
  journalScene,
  isJournalActive,
  type JournalMode,        // 'opening' | 'reading' | 'flipping' | 'closing'
  type JournalState,
  type BookGeometry,
} from './game/journal/index.ts';
```

The journal is registered as an additive scene named `'Journal'` (registered in `main.ts`, loaded from both Veranda and NightSky). External code generally uses only `isJournalActive()` -- the scene itself owns its UI lifecycle.

### Layout

```typescript
const PHOTOS_PER_PAGE = 2;
const PHOTOS_PER_SPREAD = 4;   // 2 pages x 2 photos
```

`BookGeometry` describes the book bounds, page sizes, spine X, the per-page X coordinates, and `pagesPerView` (`1` in portrait, `2` in landscape).

### State Machine

| Mode | Behaviour |
|---|---|
| `opening` | Fade/scale in over `ENTRY_MS = 280ms` |
| `reading` | Idle; flip buttons and close button are interactive |
| `flipping` | Page-flip animation in progress (`FLIP_MS = 480ms` landscape, `240ms` portrait) |
| `closing` | Fade out over `EXIT_MS = 220ms`, then `unloadAdditiveScene` |

Spread `0` is the empty front cover; spread `1+` contain photos. In portrait, `portraitSide` flips between `'left'` and `'right'` to walk through the half-spreads.

### Image Cache (`journal.image.cache.ts`)

```typescript
getOrCreateImage(photo): HTMLImageElement;
prefetchAround(photos, spreadIndex): void;
```

The cache is keyed by photo id. `prefetchAround` warms the surrounding spreads in the background.

### Lifecycle Hooks

- `openJournal(world)` -- enters `opening`, kicks off `loadPhotos()`, starts the entry tween.
- `closeJournal(world)` -- enters `closing`, plays the exit tween, then unloads.
- `flipPage(world, state, dir)` -- starts a page flip in either direction.
- An orientation change rebuilds the overlay (`rebuildJournalOverlay`), interrupting any flip and snapping back to `reading` while preserving `spreadIndex`.

### Storage

None of its own. Reads photos via `loadPhotos()` and revokes their blob URLs on close.

---

## 21. Inspect Overlay

**Files under `src/game/inspect/`:** `inspect.types.ts`, `inspect.scene.ts`, `inspect.system.ts`, `inspect.targets.ts`, `inspect.ui.ts`, `index.ts`.

### What It Does

A lightweight modal overlay that draws an arbitrary "inspect target" (a custom `draw` callback with a known aspect ratio) at the largest size that fits the screen, with entrance/exit animations and a close button. Used by the journal to enlarge a single photo, and by stamp/note features to enlarge a written note.

### Public API

```typescript
import {
  inspectScene,
  showInspect, hideInspect, isInspectActive,
  imageInspectTarget, noteInspectTarget,
  type InspectMode, type InspectRect, type InspectTarget, type InspectState,
} from './game/inspect/index.ts';
```

### Targets

```typescript
interface InspectTarget {
  aspect: number;                                            // width / height
  draw(ctx: CanvasRenderingContext2D, rect: InspectRect): void;
}
```

Two built-in builders:

- `imageInspectTarget(image)` -- centres an `HTMLImageElement`, taking its natural aspect ratio (or 0.8 if not yet loaded).
- `noteInspectTarget(text)` -- renders a yellow lined-paper card with red margin and washi-tape header at aspect 4:3, word-wrapping the supplied text using `THEME.fontSerif`.

Custom targets are simply objects implementing the interface.

### Lifecycle

- `showInspect(world, target)` stashes the target in a module-level `_pendingTarget` and calls `loadAdditiveScene(world, 'Inspect')`.
- The scene's `onEnter` consumes the pending target. If absent, it queues a microtask that immediately unloads itself.
- Mode FSM: `opening` (240ms, `Easing.Cubic.Out`) -> `inspecting` -> `closing` (180ms, `Easing.Cubic.In`).
- `hideInspect(world)` flips the mode to `closing`; the scene unloads itself when the close tween finishes.

### Storage

None.

---

## 22. Night Progression

**Files under `src/game/night/`:** `night.types.ts`, `night.storage.ts`, `night.runtime.ts`, `night.ui.button.ts`, `index.ts`.

### What It Does

Tracks the player's "nights" -- a session unit that holds a seed for procedural generation, start/end timestamps, and the count of photos taken during it. Used by the menu to compute the "Night N" prompt and the "X nights stargazed" stat, and by the night-sky scene as the procedural seed.

### Public API

```typescript
import {
  CURRENT_NIGHT_SCHEMA, type NightRecord,
  loadNights, saveNights,
  startNight, getCurrentNight, endCurrentNight,
  bumpCurrentNightPhotoCount, getCompletedNightCount,
  buildEndNightButton, type EndNightButtonHandle,
} from './game/night/index.ts';
```

### Record Shape

```typescript
interface NightRecord {
  id: string;             // crypto.randomUUID() or timestamp fallback
  number: number;         // 1-based night number
  seed: number;           // 31-bit int; drives PerlinNoise & SeededRandom for the sky and constellation
  startedAt: number;      // ms epoch
  endedAt: number;        // 0 while in progress
  photoCount: number;
  schemaVersion: number;  // CURRENT_NIGHT_SCHEMA = 1
}
```

### Runtime Behaviour

- `startNight()` creates a fresh `NightRecord` with a random seed in `[0, 0x7fffffff]`, appends it to the persisted list, and assigns it as the current night.
- `getCurrentNight()` returns the in-memory current night, or `null` when no night is active.
- `endCurrentNight()` stamps `endedAt = Date.now()`, persists, and clears the current night reference.
- `bumpCurrentNightPhotoCount()` is called by `savePhoto` (via the photo system) to increment the count and persist.
- `getCompletedNightCount()` counts records with `endedAt > 0`.

Each mutation re-loads the persisted list, updates the matching record, and re-saves -- there is no in-memory cache of the full list beyond the current entry.

### UI

`buildEndNightButton(world, isEnabled, onTap)` returns an `EndNightButtonHandle` (`{ node, setVisible, setEnabled }`). The night-sky scene only enables it when the journal, inspect, and photo overlays are all closed.

### Storage

| Key | Contents |
|---|---|
| `localStorage` `'stargazer:nights'` | JSON array of `NightRecord` (validated and field-defaulted on load) |

---

## 23. Customization & Unlocks

**Files under `src/game/customization/`:** `customization.types.ts`, `customization.config.ts`, `customization.manager.ts`, `customization.toast.ts`, `index.ts`. Backed by `src/assets/customization.config.json`.

### What It Does

Tracks which photo-mode items (filters, frames, light leaks, and feature toggles) have been unlocked, plus the stats that drive unlocks. Stats accumulate as the player saves photos using particular cosmetics. The UI surfaces unlock hints and pops a toast for newly-unlocked items.

### Public API

```typescript
import {
  // types
  type Category, type UnlockRule, type ItemDef, type GameStats,
  type CustomizationState, type ListEntry,
  CATEGORIES, defaultStats, emptyUnlocked,
  // config
  CUSTOMIZATION_CONFIG, findItem, itemsForCategory, defaultItemIds,
  // manager
  loadCustomization, saveCustomization,
  isUnlocked, listForCategory, summarizeUnlock,
  evaluateUnlocks, recordPhotoSaved,
  type PhotoCustomizationLike,
  // UI
  buildToastLayer, type ToastHandle,
} from './game/customization/index.ts';
```

### Categories & Rules

```typescript
type Category = 'filter' | 'frame' | 'lightLeak' | 'feature';

type UnlockRule =
  | { kind: 'default' }                                    // always unlocked
  | { kind: 'photos'; count: number }                       // total photos saved
  | { kind: 'feature'; featureId: string; count: number }   // usage-of-feature count
  | { kind: 'all'; rules: UnlockRule[] }                    // logical AND
  | { kind: 'any'; rules: UnlockRule[] };                   // logical OR
```

`featureId` strings follow the `category:id` convention (e.g. `"filter:vintage"`, `"frame:instax"`, plus the standalone `vignette`, `grain`, `bloom`, `dateStamp`, `stamps` keys).

`summarizeUnlock(rule)` produces a short human-readable hint such as `"🔒 5 photos"` for the customization picker.

### State Shape

```typescript
interface CustomizationState {
  unlocked: Record<Category, string[]>;
  stats: GameStats;            // { photosCount, featureUsage }
  schemaVersion: number;       // CURRENT_SCHEMA = 1
}
```

`loadCustomization()` returns either the stored state or a fresh state seeded with `defaultItemIds(category)` for every category. `saveCustomization(state)` round-trips through JSON.

### Per-photo Pipeline

```typescript
const newlyUnlocked = recordPhotoSaved(state, customization);
```

This:
1. Bumps `stats.photosCount`.
2. Records `featureUsage` increments for the filter/frame/light leak used (`filter:<id>`, `frame:<id>`, `lightLeak:<id>`) and for any active feature toggles (`vignette`, `grain`, `bloom`, `dateStamp`, `stamps`).
3. Re-runs `evaluateUnlocks(state)` and returns the array of items that just transitioned from locked to unlocked.

The toast layer (`buildToastLayer(world)`) renders these as a stack of fading-in chips above the scene; the night-sky scene owns one `ToastHandle` for the whole session.

### Storage

| Key | Contents |
|---|---|
| `localStorage` `'stargazer:customization'` | JSON `CustomizationState`. Defaults are re-seeded if the file is missing or malformed. |

---

## 24. Cursor FX

**File:** `src/game/cursor-fx.ts`

### What It Does

Spawns a sparkle particle emitter that follows each active pointer / touch point. Emission rate is smoothed against pointer speed -- slow movement emits a gentle trickle, fast movement emits a burst. Disabled while photo mode is active so the polaroid frame stays clean.

### Public API

```typescript
initCursorFx(world): void;            // called once from main.ts
cursorFxSystem(world): GameWorld;     // engine pipeline system
```

### Tunables

- `IDLE_RATE = 7` particles/s.
- `MAX_RATE = 55` particles/s.
- `SPEED_FOR_MAX_RATE = 700` px/s (pointer speed at which the rate saturates).
- `SPEED_SMOOTH_TAU = 0.12` s (exponential smoothing time-constant for pointer speed).

A separate emitter is allocated per active touch and one for the desktop hover pointer. When the pointer becomes inactive and its particles finish, the emitter is destroyed automatically.

### Storage

None.

---

## 25. Reset & Persistence Map

**File:** `src/game/reset.ts`

```typescript
await resetAllData();
```

Removes everything in `localStorage` whose key starts with `stargazer:` and deletes the `stargazer` IndexedDB database. Used by the Veranda reset button (with a `confirm()` prompt).

### Persistence Cheat-sheet

| Storage | Key / Store | Owner | Contents |
|---|---|---|---|
| `localStorage` | `stargazer:nights` | `night/night.storage.ts` | Array of `NightRecord` |
| `localStorage` | `stargazer:customization` | `customization/customization.manager.ts` | `CustomizationState` |
| IndexedDB | `stargazer` -> `photos` | `photo/photo.storage.ts` | Saved photos as Blob + metadata |

The constellation, inspect overlay, journal scene, and cursor FX hold no persistent state.

---

## 26. Data Assets

**Folder:** `src/assets/`

JSON files imported directly by the game (Vite handles them as bundled modules; no async fetch). Public folder: `public/audio/` (music + ambience WAV/MP3) and `public/images/nightsky-background.jpeg`.

| File | Consumed by | Purpose |
|---|---|---|
| `photo.filters.json` | `photo.filters.ts` | List of `PhotoFilter { id, label, cssFilter }`. Built-ins: `none`, `warm`, `mono`, `vintage`, `dreamy`, `cyanotype`, `noir`, `golden`, `dusk`, `midnight`, `aurora`, `fade`, `bloom`. |
| `photo.frames.json` | `photo.frames.ts` | Frame layouts (paddings, caption height, viewport aspect, paper/ink colours, optional decorative cosmetics ops). Built-ins include `classic` (1:1), `square`, `wide` (16:9), `instax` (~0.86:1), `minimal`, `filmstrip`. |
| `photo.lightLeaks.json` | `photo.effects.ts`, `cosmetics.ops.ts` | Named light-leak overlays expressed as cosmetics ops (gradients/shapes). |
| `customization.config.json` | `customization/customization.config.ts` | The full catalog of `ItemDef` records: id, label, category, `unlock` rule, optional hint. |

`cosmetics.ops.ts` is the small interpreter that turns the JSON op trees in frames and light leaks into canvas calls -- adding a new frame or leak is a JSON edit, no code changes needed.

---

## 27. Design Patterns

### Deferred Rendering

All systems submit draw calls to a queue during the update phase. Nothing is drawn immediately. The single `flush()` call at the end of each frame sorts everything by layer/order and executes draw calls with the appropriate camera transforms. This decouples update logic from render ordering.

### Structure-of-Arrays (SoA)

Used in the ECS (bitecs) and particle system. Instead of arrays of objects, each property has its own typed array indexed by entity/particle ID. This is cache-friendly for iteration and avoids GC pressure.

### Exponential Decay Interpolation

Used throughout for frame-rate-independent smooth motion (camera, toggle animations, cursor-fx speed smoothing). The formula `t = 1 - exp(-speed * dt)` produces consistent visual results at any frame rate.

### Const-Object Enums

TypeScript enums are avoided in favor of `const` objects:

```typescript
export const Direction = { Row: 0, Column: 1 } as const;
export type Direction = (typeof Direction)[keyof typeof Direction];
```

This is data-oriented, avoids TypeScript enum pitfalls, and produces smaller output.

### Composition Over Inheritance

Systems are pure functions that receive the world context. There are no class hierarchies. State is composed via the `GameWorldContext` interface and per-subsystem state slices.

### Reactive Cells

Simple `{ value: T }` objects used by GUI widgets (dynamic text, toggle, slider, progress bar). Changing the value triggers visual updates on the next frame.

```typescript
interface Cell<T> { value: T; }
```

### Additive Scene Stacking

Modal overlays (the journal book, the inspect viewer) live as additive scenes rather than ad-hoc UI trees. They have first-class `onEnter`/`onUpdate`/`onExit` hooks, isolated state, and clear ownership of their layout nodes -- the active scene only needs `isJournalActive()` / `isInspectActive()` predicates to defer pan / zoom / button-enable decisions.

### Disposer Pattern

Scene `onEnter` returns a single disposer that undoes everything it set up: layout nodes, particle emitters, camera state, audio registrations, additive scenes, event listeners, timers, and global handles. The night-sky disposer is the canonical example -- if it forgets to release something, the bug shows up the next time the scene is entered.

### Data-driven Cosmetics

Frames, light leaks, and the unlock catalog are JSON. The `cosmetics.ops.ts` mini-interpreter and the `UnlockRule` algebra (`default | photos | feature | all | any`) keep new cosmetic content out of code and make it cheap to ship more polish without touching the engine or the photo pipeline.