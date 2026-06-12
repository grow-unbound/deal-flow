declare module 'sharp' {
  interface ResizeOptions {
    fit?: string;
    position?: string;
  }

  interface FlattenOptions {
    background?: string;
  }

  interface WebpOptions {
    quality?: number;
  }

  interface SharpPipeline {
    resize(width: number, height: number, options?: ResizeOptions): SharpPipeline;
    flatten(options?: FlattenOptions): SharpPipeline;
    webp(options?: WebpOptions): SharpPipeline;
    toBuffer(): Promise<Uint8Array | ArrayBuffer>;
  }

  export default function sharp(input: ArrayBuffer | Uint8Array): SharpPipeline;
}
