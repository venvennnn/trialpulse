declare module "jpeg-js" {
  export function decode(
    jpegData: Uint8Array | Buffer,
    options?: { useTArray?: boolean; formatAsRGBA?: boolean },
  ): { width: number; height: number; data: Uint8Array };
  export function encode(
    imgData: { width: number; height: number; data: Uint8Array },
    quality?: number,
  ): { data: Uint8Array; width: number; height: number };
}
