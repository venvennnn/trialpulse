import type { Region } from "@/domain/regions";

export function pxRegion(x: number, y: number, width: number, height: number, imageWidth: number, imageHeight: number): Region {
  return { x: x / imageWidth, y: y / imageHeight, width: width / imageWidth, height: height / imageHeight };
}

export const RIVERSIDE = {
  src: "/receipts/riverside-rail.svg?v=2",
  width: 320,
  height: 560,
  regions: {
    date: pxRegion(150, 168, 140, 28, 320, 560),
    service: pxRegion(150, 204, 140, 28, 320, 560),
    route: pxRegion(132, 240, 158, 28, 320, 560),
    ticket: pxRegion(150, 276, 140, 28, 320, 560),
    fare: pxRegion(24, 324, 272, 40, 320, 560),
    total: pxRegion(24, 400, 272, 48, 320, 560),
  },
} as const;

export const SUPPLIES = {
  src: "/receipts/community-supplies.svg?v=2",
  width: 280,
  height: 400,
  regions: {
    merchant: pxRegion(24, 28, 232, 36, 280, 400),
    date: pxRegion(24, 118, 232, 28, 280, 400),
    total: pxRegion(20, 292, 240, 48, 280, 400),
  },
} as const;

export const SUPPLIES_PRIOR = {
  src: "/receipts/community-supplies-tp1037.svg?v=2",
  width: 280,
  height: 400,
  regions: {
    merchant: pxRegion(24, 28, 232, 36, 280, 400),
    date: pxRegion(24, 118, 232, 28, 280, 400),
    total: pxRegion(20, 292, 240, 48, 280, 400),
  },
} as const;

export const CHECKIN = {
  src: "/receipts/shift-checkin.svg?v=2",
  width: 320,
  height: 420,
} as const;

export const GENERIC_FARE = {
  src: "/receipts/generic-fare.svg?v=2",
  width: 320,
  height: 480,
  regions: {
    total: pxRegion(24, 300, 272, 48, 320, 480),
  },
} as const;
