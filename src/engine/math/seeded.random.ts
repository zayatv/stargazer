export class SeededRandom {
    private state: number;
    public readonly seed: number;

    constructor(seed?: number) {
        this.seed = seed ?? Math.floor(Math.random() * 2147483647);
        this.state = this.seed;
    }

    reset(): void {
        this.state = this.seed;
    }

    next(): number {
        this.state |= 0;
        this.state = (this.state + 0x9e3779b9) | 0;
        let t = this.state ^ (this.state >>> 16);
        t = Math.imul(t, 0x21f0aaad);
        t ^= t >>> 15;
        t = Math.imul(t, 0x735a2d97);
        t ^= t >>> 15;
        return (t >>> 0) / 4294967296;
    }

    float(min: number, max: number): number {
        return min + this.next() * (max - min);
    }

    int(min: number, max: number): number {
        return Math.floor(min + this.next() * (max - min + 1));
    }

    bool(probability = 0.5): boolean {
        return this.next() < probability;
    }

    pick<T>(array: T[]): T {
        return array[this.int(0, array.length - 1)];
    }

    shuffle<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = this.int(0, i);
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
}