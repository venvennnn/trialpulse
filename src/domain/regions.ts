/** Normalized rectangle: x, y, width, height, origin top-left of the oriented image. */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isValidRegion(region: Region | null | undefined): region is Region {
  if (!region) return false;
  const values = [region.x, region.y, region.width, region.height];
  if (values.some((value) => typeof value !== "number" || Number.isNaN(value))) return false;
  if (region.width <= 0 || region.height <= 0) return false;
  if (region.x < 0 || region.y < 0) return false;
  if (region.x + region.width > 1.001 || region.y + region.height > 1.001) return false;
  return true;
}

/**
 * Map a normalized region onto the displayed image rectangle.
 * `object-fit: contain` letterboxes the image inside the container.
 */
export function mapRegion(
  region: Region,
  container: { width: number; height: number },
  image: { width: number; height: number },
): Box {
  const scale = Math.min(container.width / image.width, container.height / image.height);
  const drawnWidth = image.width * scale;
  const drawnHeight = image.height * scale;
  const offsetX = (container.width - drawnWidth) / 2;
  const offsetY = (container.height - drawnHeight) / 2;
  return {
    x: offsetX + region.x * drawnWidth,
    y: offsetY + region.y * drawnHeight,
    width: region.width * drawnWidth,
    height: region.height * drawnHeight,
  };
}
