import type { DropEdge } from "@/store/ide"

/** Where in an editor group a drag currently is. */
export type DropZone = DropEdge | "center"

/** Fraction of the group's width/height, from each side, that counts as an edge. */
const EDGE = 0.25

/** Picks the zone under the pointer: the nearest edge band, else the middle. */
export function zoneAt(rect: DOMRect, x: number, y: number): DropZone {
  const fx = (x - rect.left) / rect.width
  const fy = (y - rect.top) / rect.height
  const distances: [DropZone, number][] = [
    ["left", fx],
    ["right", 1 - fx],
    ["top", fy],
    ["bottom", 1 - fy],
  ]
  const [zone, distance] = distances.reduce((best, next) => (next[1] < best[1] ? next : best))
  return distance <= EDGE ? zone : "center"
}

/** The part of the group that lights up to preview where the drop will land. */
export function zoneBox(zone: DropZone): React.CSSProperties {
  switch (zone) {
    case "left":
      return { top: 0, bottom: 0, left: 0, width: "50%" }
    case "right":
      return { top: 0, bottom: 0, right: 0, width: "50%" }
    case "top":
      return { top: 0, left: 0, right: 0, height: "50%" }
    case "bottom":
      return { bottom: 0, left: 0, right: 0, height: "50%" }
    default:
      return { inset: 0 }
  }
}
