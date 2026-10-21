import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Lesson, Location } from "../api/types";
import { useSystem } from "../auth";
import { LessonCard } from "../components/lesson";
import { Card, EmptyState, PageHeader, Segmented, usePageTitle } from "../components/ui";
import { useI18n } from "../i18n";
import CampusMap from "../map/CampusMap";
import { kindLabels, localIso } from "../lib/format";

type Range = "week" | "month" | "all";

export default function MapPage() {
  const { t } = useI18n();
  const c = t.common;
  const mp = t.map;
  usePageTitle(c.nav.map);
  const { now } = useSystem();
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState<Range>("month");
  const selected = params.get("room");
  const today = localIso(now).slice(0, 10);
  const until = range === "all" ? undefined : localIso(new Date(now.getTime() + (range === "week" ? 7 : 31) * 86400000)).slice(0, 10);

  const locations = useQuery({ queryKey: ["locations"], queryFn: () => api.get<Location[]>("/api/locations") });
  const lessons = useQuery({
    queryKey: ["lessons", "map", today, until],
    queryFn: () => api.get<Lesson[]>("/api/lessons", { date_from: today, date_to: until, status: ["scheduled", "materials_ready", "confirmed", "completed", "feedback"] }),
  });

  const byKey = useMemo(() => {
    const m = new Map<string, Location>();
    locations.data?.forEach((l) => l.map_key && m.set(l.map_key, l));
    return m;
  }, [locations.data]);
  const highlighted = useMemo(() => (lessons.data ?? []).map((l) => l.location?.map_key).filter(Boolean) as string[], [lessons.data]);
  const roomLessons = (lessons.data ?? []).filter((l) => selected && l.location?.map_key === selected);
  const loc = selected ? byKey.get(selected) : undefined;

  return (
    <div>
      <PageHeader
        title={c.nav.map}
        subtitle={mp.subtitle}
        actions={
          <Segmented
            value={range}
            onChange={setRange}
            options={[
              { value: "week", label: mp.range.week },
              { value: "month", label: mp.range.month },
              { value: "all", label: c.actions.all },
            ]}
          />
        }
      />
      <CampusMap
        selected={selected}
        highlighted={highlighted}
        height="min(62vh, 620px)"
        onRoomClick={(key) => setParams(key === selected ? {} : { room: key }, { replace: true })}
        describe={(key) => {
          const l = byKey.get(key);
          const n = highlighted.filter((h) => h === key).length;
          return `${l?.title ?? key.split("|")[0]}${l ? ` · ${kindLabels()[l.kind] ?? l.kind}` : ""}${n ? ` · ${mp.lessonsCount(n)}` : ""}`;
        }}
      />
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
        <Card className="p-5">
          {loc ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <MapPin className="size-4" /> {mp.selectedRoom}
              </div>
              <div className="text-xl font-semibold">{loc.title ?? loc.code}</div>
              <div className="text-sm text-gray-600">
                {mp.roomPlace(loc.building, loc.block, loc.floor)}
              </div>
              <div className="text-sm text-gray-600">{mp.roomKind(kindLabels()[loc.kind] ?? loc.kind)}</div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              {mp.hintBefore}
              <b>243</b>
              {mp.hintAfter}
            </p>
          )}
        </Card>
        <div className="space-y-3">
          {selected ? (
            roomLessons.length ? (
              roomLessons.map((l) => <LessonCard key={l.id} lesson={l} />)
            ) : (
              <Card>
                <EmptyState icon={<CalendarDays className="size-6" />} title={mp.emptyRoom} />
              </Card>
            )
          ) : (
            (lessons.data ?? []).slice(0, 6).map((l) => <LessonCard key={l.id} lesson={l} />)
          )}
        </div>
      </div>
    </div>
  );
}
