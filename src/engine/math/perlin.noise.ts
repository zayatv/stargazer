function splitmix32(seed: number): () => number {
    return () => {
        seed |= 0;
        seed = (seed + 0x9e3779b9) | 0;
        let t = seed ^ (seed >>> 16);
        t = Math.imul(t, 0x21f0aaad);
        t ^= t >>> 15;
        t = Math.imul(t, 0x735a2d97);
        t ^= t >>> 15;
        return (t >>> 0) / 4294967296;
    };
}

function buildPermutation(seed: number): number[] {
    const rng = splitmix32(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);

    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]];
    }

    return [...p, ...p];
}

function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
}

function grad3(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function grad2(hash: number, x: number, y: number): number {
    const h = hash & 3;
    return (h & 1 ? -x : x) + (h & 2 ? -y : y);
}

function grad1(hash: number, x: number): number {
    return (hash & 1) === 0 ? x : -x;
}

export interface FbmOptions {

    octaves?: number;

    persistence?: number;

    lacunarity?: number;
}

const FBM_DEFAULTS: Required<FbmOptions> = {
    octaves: 6,
    persistence: 0.5,
    lacunarity: 2.0,
};

export class PerlinNoise {
    private perm: number[];
    public readonly seed: number;

    constructor(seed?: number) {
        this.seed = seed ?? Math.floor(Math.random() * 2147483647);
        this.perm = buildPermutation(this.seed);
    }

    reseed(seed: number): void {
        (this as { seed: number }).seed = seed;
        this.perm = buildPermutation(seed);
    }

    noise1D(x: number): number {
        const p = this.perm;
        const xi = Math.floor(x) & 255;
        const xf = x - Math.floor(x);
        const u = fade(xf);

        return lerp(grad1(p[xi], xf), grad1(p[xi + 1], xf - 1), u);
    }

    noise2D(x: number, y: number): number {
        const p = this.perm;
        const xi = Math.floor(x) & 255;
        const yi = Math.floor(y) & 255;
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);

        const u = fade(xf);
        const v = fade(yf);

        const aa = p[p[xi] + yi];
        const ab = p[p[xi] + yi + 1];
        const ba = p[p[xi + 1] + yi];
        const bb = p[p[xi + 1] + yi + 1];

        return lerp(
            lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u),
            lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u),
            v
        );
    }

    noise3D(x: number, y: number, z: number): number {
        const p = this.perm;
        const xi = Math.floor(x) & 255;
        const yi = Math.floor(y) & 255;
        const zi = Math.floor(z) & 255;
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);
        const zf = z - Math.floor(z);

        const u = fade(xf);
        const v = fade(yf);
        const w = fade(zf);

        const aaa = p[p[p[xi] + yi] + zi];
        const aba = p[p[p[xi] + yi + 1] + zi];
        const aab = p[p[p[xi] + yi] + zi + 1];
        const abb = p[p[p[xi] + yi + 1] + zi + 1];
        const baa = p[p[p[xi + 1] + yi] + zi];
        const bba = p[p[p[xi + 1] + yi + 1] + zi];
        const bab = p[p[p[xi + 1] + yi] + zi + 1];
        const bbb = p[p[p[xi + 1] + yi + 1] + zi + 1];

        return lerp(
            lerp(
                lerp(grad3(aaa, xf, yf, zf), grad3(baa, xf - 1, yf, zf), u),
                lerp(grad3(aba, xf, yf - 1, zf), grad3(bba, xf - 1, yf - 1, zf), u),
                v
            ),
            lerp(
                lerp(grad3(aab, xf, yf, zf - 1), grad3(bab, xf - 1, yf, zf - 1), u),
                lerp(
                    grad3(abb, xf, yf - 1, zf - 1),
                    grad3(bbb, xf - 1, yf - 1, zf - 1),
                    u
                ),
                v
            ),
            w
        );
    }

    fbm1D(x: number, opts?: FbmOptions): number {
        const { octaves, persistence, lacunarity } = { ...FBM_DEFAULTS, ...opts };
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let max = 0;

        for (let i = 0; i < octaves; i++) {
            value += this.noise1D(x * frequency) * amplitude;
            max += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return value / max;
    }

    fbm2D(x: number, y: number, opts?: FbmOptions): number {
        const { octaves, persistence, lacunarity } = { ...FBM_DEFAULTS, ...opts };
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let max = 0;

        for (let i = 0; i < octaves; i++) {
            value += this.noise2D(x * frequency, y * frequency) * amplitude;
            max += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return value / max;
    }

    fbm3D(x: number, y: number, z: number, opts?: FbmOptions): number {
        const { octaves, persistence, lacunarity } = { ...FBM_DEFAULTS, ...opts };
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let max = 0;

        for (let i = 0; i < octaves; i++) {
            value +=
                this.noise3D(x * frequency, y * frequency, z * frequency) * amplitude;
            max += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return value / max;
    }
}