import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { averageHash } from "@/domain/duplicates";
import { sha256Hex } from "@/domain/hash";

const MAX_BYTES = 8_000_000;

export interface PreparedImage {
  mimeType: "image/jpeg" | "image/png";
  bytes: Uint8Array;
  width: number;
  height: number;
  contentHash: string;
  perceptualHash: string;
  metadataStripped: true;
  orientation: number;
}

export function detectMime(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  return null;
}

export function jpegOrientation(bytes: Uint8Array): number {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) return 1;
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xda || marker === 0xd9) return 1;
    const length = ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0);
    if (marker === 0xe1 && length > 8) {
      const start = offset + 4;
      const label = String.fromCharCode(...bytes.slice(start, start + 4));
      if (label === "Exif") {
        const value = readExifOrientation(bytes.subarray(start + 6, offset + 2 + length));
        if (value) return value;
      }
    }
    if (length < 2) return 1;
    offset += 2 + length;
  }
  return 1;
}

function readExifOrientation(tiff: Uint8Array): number | null {
  if (tiff.length < 8) return null;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  const read16 = (pos: number) => (little ? (tiff[pos] ?? 0) + ((tiff[pos + 1] ?? 0) << 8) : ((tiff[pos] ?? 0) << 8) + (tiff[pos + 1] ?? 0));
  const read32 = (pos: number) =>
    little
      ? (tiff[pos] ?? 0) + ((tiff[pos + 1] ?? 0) << 8) + ((tiff[pos + 2] ?? 0) << 16) + ((tiff[pos + 3] ?? 0) << 24)
      : ((tiff[pos] ?? 0) << 24) + ((tiff[pos + 1] ?? 0) << 16) + ((tiff[pos + 2] ?? 0) << 8) + (tiff[pos + 3] ?? 0);
  const ifd = read32(4);
  if (ifd + 2 > tiff.length) return null;
  const entries = read16(ifd);
  for (let i = 0; i < entries; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 8 > tiff.length) return null;
    if (read16(entry) === 0x0112) {
      const value = read16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return null;
}

export function rotateRgba(
  data: Uint8Array,
  width: number,
  height: number,
  orientation: number,
): { data: Uint8Array; width: number; height: number } {
  const swap = orientation >= 5 && orientation <= 8;
  const outWidth = swap ? height : width;
  const outHeight = swap ? width : height;
  const out = new Uint8Array(outWidth * outHeight * 4);
  const src = (x: number, y: number) => (y * width + x) * 4;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let nx = x;
      let ny = y;
      switch (orientation) {
        case 2:
          nx = width - 1 - x;
          break;
        case 3:
          nx = width - 1 - x;
          ny = height - 1 - y;
          break;
        case 4:
          ny = height - 1 - y;
          break;
        case 5:
          nx = y;
          ny = x;
          break;
        case 6:
          nx = height - 1 - y;
          ny = x;
          break;
        case 7:
          nx = height - 1 - y;
          ny = width - 1 - x;
          break;
        case 8:
          nx = y;
          ny = width - 1 - x;
          break;
        default:
          break;
      }
      const from = src(x, y);
      const to = (ny * outWidth + nx) * 4;
      out.set(data.subarray(from, from + 4), to);
    }
  }
  return { data: out, width: outWidth, height: outHeight };
}

function grayFromRgba(data: Uint8Array, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i += 1) {
    const o = i * 4;
    gray[i] = Math.round(0.299 * (data[o] ?? 0) + 0.587 * (data[o + 1] ?? 0) + 0.114 * (data[o + 2] ?? 0));
  }
  return gray;
}

export async function prepareEvidence(bytes: Uint8Array): Promise<PreparedImage | { error: string }> {
  if (bytes.byteLength === 0) return { error: "The file is empty." };
  if (bytes.byteLength > MAX_BYTES) return { error: "Receipts must be 8 MB or smaller." };
  const mime = detectMime(bytes);
  if (!mime) return { error: "Upload a JPEG or PNG receipt." };
  try {
    if (mime === "image/png") {
      const png = PNG.sync.read(Buffer.from(bytes));
      const encoded = PNG.sync.write(png);
      const hash = await sha256Hex(encoded);
      return {
        mimeType: "image/png",
        bytes: encoded,
        width: png.width,
        height: png.height,
        contentHash: hash,
        perceptualHash: averageHash(grayFromRgba(png.data, png.width, png.height), png.width, png.height),
        metadataStripped: true,
        orientation: 1,
      };
    }
    const orientation = jpegOrientation(bytes);
    const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    const rotated = rotateRgba(decoded.data, decoded.width, decoded.height, orientation);
    const encoded = jpeg.encode({ data: rotated.data, width: rotated.width, height: rotated.height }, 85);
    const hash = await sha256Hex(encoded.data);
    return {
      mimeType: "image/jpeg",
      bytes: encoded.data,
      width: rotated.width,
      height: rotated.height,
      contentHash: hash,
      perceptualHash: averageHash(grayFromRgba(rotated.data, rotated.width, rotated.height), rotated.width, rotated.height),
      metadataStripped: true,
      orientation,
    };
  } catch {
    return { error: "The image could not be read. Enter the amount manually." };
  }
}
