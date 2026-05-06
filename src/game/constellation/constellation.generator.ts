import { SeededRandom } from '../../engine/math/seeded.random.ts';
import type {
  ConnectableStar, ConstellationCluster, ConstellationState,
  BackgroundStarLite, RGB,
} from './constellation.types.ts';

const HIT_CELL_SIZE = 200;
const BG_CELL_SIZE = 60;
const CLUSTER_BORDER = 200;
const CLUSTER_RADIUS_MIN = 150;
const CLUSTER_RADIUS_MAX = 300;
const STAR_MIN_PER_CLUSTER = 4;
const STAR_MAX_PER_CLUSTER = 7;
const STAR_RADIUS_MIN = 6;
const STAR_RADIUS_MAX = 10;
const HALO_SCALE_MIN = 4.5;
const HALO_SCALE_MAX = 5.5;
const PULSE_SPEED_MIN = 0.6;
const PULSE_SPEED_MAX = 1.4;
const MIN_DIST_TO_CONNECTABLE = 30;
const MIN_DIST_TO_BG = 12;
const PLACEMENT_ATTEMPTS = 40;

const BG_PER_CONNECTABLE = 25;
const CONNECTABLE_MIN = 18;
const STARS_PER_CLUSTER_AVG = 5.5;
const CELL_JITTER_FRACTION = 0.25;

const PALETTE: RGB[] = [
  { r: 255, g: 255, b: 255 },
  { r: 220, g: 232, b: 255 },
  { r: 230, g: 210, b: 255 },
];

function cellKey(cx: number, cy: number): number {
  return (cx * 73856093) ^ (cy * 19349663);
}

function buildBackgroundGrid(bgStars: BackgroundStarLite[]): Map<number, BackgroundStarLite[]> {
  const grid = new Map<number, BackgroundStarLite[]>();

  for (const s of bgStars) {
    const cx = Math.floor(s.x / BG_CELL_SIZE);
    const cy = Math.floor(s.y / BG_CELL_SIZE);
    const key = cellKey(cx, cy);
    const cell = grid.get(key);

    if (cell) cell.push(s);
    else grid.set(key, [s]);
  }

  return grid;
}

function tooCloseToBackground(x: number, y: number, grid: Map<number, BackgroundStarLite[]>): boolean {
  const cx = Math.floor(x / BG_CELL_SIZE);
  const cy = Math.floor(y / BG_CELL_SIZE);

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const cell = grid.get(cellKey(cx + dx, cy + dy));

      if (!cell) continue;

      for (const s of cell) {
        const ex = s.x - x;
        const ey = s.y - y;
        const minD = MIN_DIST_TO_BG + s.radius;

        if (ex * ex + ey * ey < minD * minD) return true;
      }
    }
  }

  return false;
}

function tooCloseToOtherConnectable(x: number, y: number, stars: ConnectableStar[]): boolean {
  for (const s of stars) {
    const ex = s.x - x;
    const ey = s.y - y;

    if (ex * ex + ey * ey < MIN_DIST_TO_CONNECTABLE * MIN_DIST_TO_CONNECTABLE) return true;
  }

  return false;
}

function buildHitGrid(stars: ConnectableStar[]): Map<number, number[]> {
  const grid = new Map<number, number[]>();

  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const cx = Math.floor(s.x / HIT_CELL_SIZE);
    const cy = Math.floor(s.y / HIT_CELL_SIZE);
    const key = cellKey(cx, cy);
    const cell = grid.get(key);

    if (cell) cell.push(i);
    else grid.set(key, [i]);
  }

  return grid;
}

export function generateConstellation(seed: number, worldW: number, worldH: number, bgStars: BackgroundStarLite[]): ConstellationState {
  const random = new SeededRandom(seed ^ 0xc0ffee);
  const bgGrid = buildBackgroundGrid(bgStars);

  const halfW = worldW * 0.5 - CLUSTER_BORDER;
  const halfH = worldH * 0.5 - CLUSTER_BORDER;

  const clusters: ConstellationCluster[] = [];
  const stars: ConnectableStar[] = [];

  const targetConnectable = Math.max(CONNECTABLE_MIN, Math.floor(bgStars.length / BG_PER_CONNECTABLE));
  const clusterCount = Math.max(2, Math.round(targetConnectable / STARS_PER_CLUSTER_AVG));

  const gridDim = Math.max(2, Math.ceil(Math.sqrt(clusterCount)));
  const totalCells = gridDim * gridDim;
  const cellW = (halfW * 2) / gridDim;
  const cellH = (halfH * 2) / gridDim;
  const originX = -halfW;
  const originY = -halfH;

  const cellOrder: number[] = new Array(totalCells);
  for (let i = 0; i < totalCells; i++) cellOrder[i] = i;
  random.shuffle(cellOrder);

  const placeCount = Math.min(clusterCount, totalCells);

  for (let c = 0; c < placeCount; c++) {
    const cellIdx = cellOrder[c];
    const ci = cellIdx % gridDim;
    const cj = Math.floor(cellIdx / gridDim);
    const jx = random.float(-CELL_JITTER_FRACTION, CELL_JITTER_FRACTION) * cellW;
    const jy = random.float(-CELL_JITTER_FRACTION, CELL_JITTER_FRACTION) * cellH;
    const cx = originX + (ci + 0.5) * cellW + jx;
    const cy = originY + (cj + 0.5) * cellH + jy;

    const cluster: ConstellationCluster = {
      id: c,
      cx,
      cy,
      radius: random.float(CLUSTER_RADIUS_MIN, CLUSTER_RADIUS_MAX),
      starIndices: [],
    };

    const target = random.int(STAR_MIN_PER_CLUSTER, STAR_MAX_PER_CLUSTER);

    for (let s = 0; s < target; s++) {
      for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
        const ang = random.float(0, Math.PI * 2);
        const r = Math.sqrt(random.next()) * cluster.radius;
        const x = cluster.cx + Math.cos(ang) * r;
        const y = cluster.cy + Math.sin(ang) * r;

        if (Math.abs(x) > halfW + CLUSTER_BORDER) continue;
        if (Math.abs(y) > halfH + CLUSTER_BORDER) continue;
        if (tooCloseToOtherConnectable(x, y, stars)) continue;
        if (tooCloseToBackground(x, y, bgGrid)) continue;

        const radius = random.float(STAR_RADIUS_MIN, STAR_RADIUS_MAX);
        const star: ConnectableStar = {
          x,
          y,
          radius,
          haloRadius: radius * random.float(HALO_SCALE_MIN, HALO_SCALE_MAX),
          color: PALETTE[random.int(0, PALETTE.length - 1)],
          pulsePhase: random.float(0, Math.PI * 2),
          pulseSpeed: random.float(PULSE_SPEED_MIN, PULSE_SPEED_MAX),
          clusterId: c,
        };

        cluster.starIndices.push(stars.length);
        stars.push(star);

        break;
      }
    }

    if (cluster.starIndices.length < STAR_MIN_PER_CLUSTER) {
      for (const idx of cluster.starIndices) stars[idx].clusterId = -1;

      continue;
    }

    clusters.push(cluster);
  }

  const surviving: ConnectableStar[] = [];
  const remap = new Map<number, number>();

  for (let i = 0; i < stars.length; i++) {
    if (stars[i].clusterId === -1) continue;

    remap.set(i, surviving.length);

    surviving.push(stars[i]);
  }

  for (const cluster of clusters) cluster.starIndices = cluster.starIndices.map(i => remap.get(i)!).filter(i => i !== undefined);

  return {
    stars: surviving,
    clusters,
    selectionPath: [],
    segments: [],
    hitGrid: buildHitGrid(surviving),
    drawing: {
      active: false,
      cursorWorld: { x: 0, y: 0 },
      sessionStartIdx: -1,
      pendingStartIdx: -1,
    },
    pendingEmitters: [],
    closed: false,
    hue: null,
  };
}

export { cellKey, HIT_CELL_SIZE };
