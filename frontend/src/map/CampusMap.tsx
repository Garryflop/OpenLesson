/**
 * Интерактивная карта корпуса C1 Astana IT University.
 *
 * SVG-планы этажей взяты из проекта aitumap (https://github.com/Yuujiso/aitumap,
 * MIT, © Yuujiso) и доработаны: выбор аудитории кликом, подсветка аудиторий с
 * открытыми занятиями, поиск с автопереключением этажа, приближение к аудитории.
 */
import clsx from "clsx";
import { Layers, Maximize2, Minus, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { useI18n } from "../i18n";
import Floor1 from "./aitumap/Floor1";
import Floor2 from "./aitumap/Floor2";
import Floor3 from "./aitumap/Floor3";
import IconsCommon from "./aitumap/IconsCommon";
import Wallpaper from "./aitumap/Wallpaper";

const FLOORS: Record<number, () => ReactNode> = { 1: Floor1, 2: Floor2, 3: Floor3 };
const BLOCK_LABEL = /^C1\.\d$/;

export interface CampusMapProps {
  floor?: number;
  onFloorChange?: (floor: number) => void;
  /** map_key of the room to select and zoom to */
  selected?: string | null;
  /** map_keys of rooms that host open lessons */
  highlighted?: Iterable<string>;
  onRoomClick?: (mapKey: string) => void;
  describe?: (mapKey: string) => ReactNode;
  height?: number | string;
  className?: string;
  /** small preview: no search box, compact floor switcher and legend */
  compact?: boolean;
}

function roomFloor(key: string): number | null {
  const m = /^C1\.\d\.(\d)/.exec(key) ?? /^(\d)\d{2}/.exec(key);
  return m ? Number(m[1]) : null;
}

export default function CampusMap({
  floor: floorProp,
  onFloorChange,
  selected,
  highlighted,
  onRoomClick,
  describe,
  height = 520,
  className,
  compact = false,
}: CampusMapProps) {
  const mp = useI18n().t.map;
  const [floorState, setFloorState] = useState(floorProp ?? (selected ? roomFloor(selected) ?? 1 : 1));
  const floor = floorProp ?? floorState;
  const setFloor = useCallback(
    (f: number) => {
      setFloorState(f);
      onFloorChange?.(f);
    },
    [onFloorChange],
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ReactZoomPanPinchRef>(null);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const highlightSet = useMemo(() => new Set(highlighted ?? []), [highlighted]);
  const Floor = FLOORS[floor] ?? Floor1;

  // follow the selected room to its floor
  useEffect(() => {
    if (!selected) return;
    const f = roomFloor(selected);
    if (f && f !== floor) setFloor(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // auto-switch floor while searching ("243", "C1.2.243")
  useEffect(() => {
    const q = query.trim().toUpperCase();
    const f = roomFloor(q.startsWith("C1.") ? q : q.replace(/^\D+/, ""));
    if (f && f !== floor && FLOORS[f]) setFloor(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // apply highlight classes to the SVG groups
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const q = query.trim().toUpperCase();
    svg.querySelectorAll<SVGGElement>("[data-name]").forEach((g) => {
      const key = g.getAttribute("data-name") ?? "";
      if (BLOCK_LABEL.test(key)) return;
      g.classList.toggle("room-has-lesson", highlightSet.has(key));
      g.classList.toggle("room-selected", !!selected && key === selected);
      g.classList.toggle("room-search-match", q.length >= 2 && key.toUpperCase().includes(q));
    });
  }, [floor, selected, highlightSet, query]);

  // zoom to the selected room
  useEffect(() => {
    if (!selected) return;
    const timer = setTimeout(() => {
      const el = svgRef.current?.querySelector(`[data-name="${CSS.escape(selected)}"]`) as HTMLElement | null;
      if (el) zoomRef.current?.zoomToElement(el, 2.6, 400);
    }, 120);
    return () => clearTimeout(timer);
  }, [selected, floor]);

  const keyFromEvent = (target: EventTarget | null): string | null => {
    const g = (target as Element | null)?.closest?.("[data-name]");
    const key = g?.getAttribute("data-name") ?? null;
    return key && !BLOCK_LABEL.test(key) ? key : null;
  };

  const focusFirstMatch = () => {
    const q = query.trim().toUpperCase();
    if (q.length < 2) return;
    const el = Array.from(svgRef.current?.querySelectorAll("[data-name]") ?? []).find((g) =>
      (g.getAttribute("data-name") ?? "").toUpperCase().includes(q),
    ) as HTMLElement | undefined;
    if (!el) return;
    zoomRef.current?.zoomToElement(el, 2.6, 400);
    const key = el.getAttribute("data-name");
    if (key && !BLOCK_LABEL.test(key)) onRoomClick?.(key);
  };

  return (
    <div className={clsx("relative overflow-hidden rounded-2xl border border-gray-200 bg-white", className)}>
      {/* toolbar */}
      <div className={clsx("absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center gap-2", compact && "hidden")}>
        <div className="relative w-full max-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value.replace(/[^0-9cCpPlLkK.]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && focusFirstMatch()}
            placeholder={mp.searchPlaceholder}
            className="h-9 w-full rounded-full border border-gray-200 bg-white/95 pl-9 pr-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
            aria-label={mp.searchLabel}
          />
        </div>
        {hover && (
          <div className="hidden rounded-full bg-gray-900/90 px-3 py-1.5 text-xs font-medium text-white shadow-sm sm:block">
            {describe ? describe(hover) : hover.split("|")[0]}
          </div>
        )}
      </div>

      {/* floor switcher */}
      <div
        className={clsx(
          "absolute z-10 flex gap-1 rounded-2xl bg-gray-900 p-1 shadow-lg",
          compact ? "right-2 top-2 flex-row" : "right-3 top-1/2 -translate-y-1/2 flex-col",
        )}
      >
        {!compact && <Layers className="mx-auto my-1 size-4 text-white/60" />}
        {[3, 2, 1].map((f) => (
          <button
            key={f}
            onClick={() => setFloor(f)}
            aria-label={mp.floor(f)}
            className={clsx(
              compact ? "size-7 rounded-lg text-xs font-semibold transition" : "size-8 rounded-xl text-sm font-semibold transition",
              f === floor ? "bg-white text-gray-900" : "text-white hover:bg-white/15",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <TransformWrapper ref={zoomRef} minScale={0.6} maxScale={10} initialScale={1} centerOnInit limitToBounds={false}>
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div className={clsx("absolute bottom-3 right-3 z-10 flex gap-1 rounded-full border border-gray-200 bg-white p-1 shadow-sm", compact && "hidden")}>
              <button className="rounded-full p-1.5 hover:bg-gray-100" onClick={() => zoomIn()} aria-label={mp.zoomIn}>
                <Plus className="size-4" />
              </button>
              <button className="rounded-full p-1.5 hover:bg-gray-100" onClick={() => zoomOut()} aria-label={mp.zoomOut}>
                <Minus className="size-4" />
              </button>
              <button className="rounded-full p-1.5 hover:bg-gray-100" onClick={() => resetTransform()} aria-label={mp.zoomReset}>
                <Maximize2 className="size-4" />
              </button>
            </div>
            <TransformComponent wrapperStyle={{ width: "100%", height }} contentStyle={{ width: "100%", height: "100%" }}>
              <svg
                ref={svgRef}
                className="campus-map h-full w-full"
                viewBox="0 0 924.69 396.16"
                xmlns="http://www.w3.org/2000/svg"
                onClick={(e) => {
                  const key = keyFromEvent(e.target);
                  if (key) onRoomClick?.(key);
                }}
                onMouseMove={(e) => setHover(keyFromEvent(e.target))}
                onMouseLeave={() => setHover(null)}
              >
                <Wallpaper />
                <Floor />
                <IconsCommon />
              </svg>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>

      {/* legend */}
      <div
        className={clsx(
          "absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-3 rounded-full border border-gray-200 bg-white/95 px-3 py-1.5 text-xs text-gray-600 shadow-sm",
          compact && "bottom-2 left-2 gap-2 px-2.5 py-1 [&>span:not(:last-child)]:hidden",
        )}
      >
        <span className="flex items-center gap-1.5">
          <i className="size-2.5 rounded-sm bg-[var(--map-room)]" /> {mp.legend.room}
        </span>
        {highlightSet.size > 0 && (
          <span className="flex items-center gap-1.5">
            <i className="size-2.5 rounded-sm bg-[var(--map-room-lesson)]" /> {mp.legend.lesson}
          </span>
        )}
        {selected && (
          <span className="flex items-center gap-1.5">
            <i className="size-2.5 rounded-sm bg-[var(--map-room-selected)]" /> {mp.legend.selected}
          </span>
        )}
        <span className="text-gray-400">{mp.floor(floor)}</span>
      </div>
    </div>
  );
}
