export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function remap(
    value: number,
    inMin: number,
    inMax: number,
    outMin: number,
    outMax: number
): number {
    return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

export function remapClamped(
    value: number,
    inMin: number,
    inMax: number,
    outMin: number,
    outMax: number
): number {
    const t = clamp((value - inMin) / (inMax - inMin), 0, 1);
    return outMin + t * (outMax - outMin);
}

export function normalize(value: number, min: number, max: number): number {
    return (value - min) / (max - min);
}

export function normalizeClamped(value: number, min: number, max: number): number {
    return clamp((value - min) / (max - min), 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
}

export function inverseLerp(a: number, b: number, value: number): number {
    return (value - a) / (b - a);
}

export function smoothstep(t: number): number {
    const c = clamp(t, 0, 1);
    return c * c * (3 - 2 * c);
}

export function smootherstep(t: number): number {
    const c = clamp(t, 0, 1);
    return c * c * c * (c * (c * 6 - 15) + 10);
}

export function mod(value: number, divisor: number): number {
    return ((value % divisor) + divisor) % divisor;
}

export function wrap(value: number, min: number, max: number): number {
    const range = max - min;
    return min + mod(value - min, range);
}

export function distance(
    x1: number,
    y1: number,
    x2: number,
    y2: number
): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

export function distanceSq(
    x1: number,
    y1: number,
    x2: number,
    y2: number
): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
}

export function toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

export function toDegrees(radians: number): number {
    return (radians * 180) / Math.PI;
}

export function angleBetween(
    x1: number,
    y1: number,
    x2: number,
    y2: number
): number {
    return Math.atan2(y2 - y1, x2 - x1);
}

export function moveToward(
    current: number,
    target: number,
    maxDelta: number
): number {
    if (Math.abs(target - current) <= maxDelta) return target;
    return current + Math.sign(target - current) * maxDelta;
}

export function sign(value: number): -1 | 0 | 1 {
    if (value > 0) return 1;
    if (value < 0) return -1;
    return 0;
}

export function approxEqual(
    a: number,
    b: number,
    epsilon = 1e-6
): boolean {
    return Math.abs(a - b) < epsilon;
}

export function snap(value: number, step: number): number {
    return Math.round(value / step) * step;
}