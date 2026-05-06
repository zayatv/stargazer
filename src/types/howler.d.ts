declare module 'howler' {
  interface HowlOptions {
    src: string[];
    volume?: number;
    loop?: boolean;
    sprite?: Record<string, [number, number] | [number, number, boolean]>;
    preload?: boolean;
    autoplay?: boolean;
    rate?: number;
    onend?: (id: number) => void;
    onload?: () => void;
    onloaderror?: (id: number, err: unknown) => void;
  }

  class Howl {
    constructor(options: HowlOptions);
    play(spriteOrId?: string | number): number;
    pause(id?: number): this;
    stop(id?: number): this;
    volume(vol?: number, id?: number): this | number;
    rate(rate?: number, id?: number): this | number;
    seek(seek?: number, id?: number): this | number;
    loop(loop?: boolean, id?: number): this | boolean;
    mute(muted?: boolean, id?: number): this | boolean;
    fade(from: number, to: number, duration: number, id?: number): this;
    playing(id?: number): boolean;
    duration(id?: number): number;
    on(event: string, fn: Function, id?: number): this;
    off(event: string, fn?: Function, id?: number): this;
    once(event: string, fn: Function, id?: number): this;
    unload(): void;
    state(): 'unloaded' | 'loading' | 'loaded';
  }

  const Howler: {
    volume(vol?: number): number | typeof Howler;
    mute(muted?: boolean): typeof Howler;
    stop(): typeof Howler;
    codecs(ext: string): boolean;
    ctx: AudioContext;
  };
}
