import type ru from "../ru/map";
import { pluralEn } from "../plural";

export default {
  subtitle: "Building C1, Astana IT University: rooms and venues of open lessons",
  range: {
    week: "Week",
    month: "Month",
  },
  lessonsCount: (n: number) => `${n} ${pluralEn(n, "open lesson", "open lessons")}`,
  selectedRoom: "Selected room",
  roomPlace: (building: string, block: string | null, floor: number | null) => `Building ${building} · block ${block ?? ""} · floor ${floor ?? ""}`,
  roomKind: (kind: string) => `Type: ${kind}`,
  hintBefore:
    "Click a room on the map to see its open lessons. Rooms with lessons in the selected period are marked orange; search by room number (e.g. ",
  hintAfter: ") and the floor will switch automatically.",
  emptyRoom: "No open lessons in this room for the selected period",
  searchPlaceholder: "243 or C1.2.243K",
  searchLabel: "Search for a room",
  floor: (n: number) => `Floor ${n}`,
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomReset: "Reset zoom",
  legend: {
    room: "Room",
    lesson: "Open lesson",
    selected: "Selected",
  },
} satisfies typeof ru;
