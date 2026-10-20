import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { CalendarX2, Search, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { AcademicYear, Lesson, LessonStatus, Structure } from "../api/types";
import { useAuth, useSystem } from "../auth";
import { LessonCard } from "../components/lesson";
import { Button, Card, CardListSkeleton, EmptyState, ErrorBox, Input, PageHeader, SectionTitle, Segmented, Select, usePageTitle } from "../components/ui";
import { useI18n } from "../i18n";
import { localIso, monthTitle, statusMeta } from "../lib/format";

export function useYears() {
  return useQuery({ queryKey: ["years"], queryFn: () => api.get<AcademicYear[]>("/api/years") });
}

export function useStructure() {
  return useQuery({ queryKey: ["structure"], queryFn: () => api.get<Structure>("/api/structure"), staleTime: 300_000 });
}

export function pickTrimester(year: AcademicYear | undefined, today: string): number | undefined {
  if (!year) return undefined;
  const current = year.trimesters.find((t) => t.start_date && t.end_date && t.start_date <= today && today <= t.end_date);
  return (current ?? year.trimesters.find((t) => t.status === "approved") ?? year.trimesters[0])?.id;
}

function StatusChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition",
        active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900",
      )}
    >
      {label}
      <span className={clsx("tabular", active ? "text-white/70" : "text-gray-400")}>{count}</span>
    </button>
  );
}

export default function SchedulePage() {
  const { t } = useI18n();
  const c = t.common;
  const sc = t.schedule;
  usePageTitle(c.nav.schedule);
  const { isManager } = useAuth();
  const { now } = useSystem();
  const today = localIso(now).slice(0, 10);
  const [params, setParams] = useSearchParams();
  const years = useYears();
  const structure = useStructure();
  const [yearId, setYearId] = useState<number | undefined>(Number(params.get("year")) || undefined);
  const year = years.data?.find((y) => y.id === yearId) ?? years.data?.find((y) => y.is_current) ?? years.data?.[0];
  const [trimesterId, setTrimesterId] = useState<number | undefined>(Number(params.get("trimester")) || undefined);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<LessonStatus | "">("");
  const [department, setDepartment] = useState("");
  const [mine, setMine] = useState(false);

  useEffect(() => {
    if (year && !year.trimesters.some((t) => t.id === trimesterId)) setTrimesterId(pickTrimester(year, today));
  }, [year, trimesterId, today]);

  useEffect(() => {
    if (year && trimesterId) setParams({ year: String(year.id), trimester: String(trimesterId) }, { replace: true });
  }, [year, trimesterId, setParams]);

  const lessons = useQuery({
    queryKey: ["lessons", { trimesterId, department, mine }],
    queryFn: () => api.get<Lesson[]>("/api/lessons", { trimester_id: trimesterId, department_id: department || undefined, mine }),
    enabled: !!trimesterId,
  });

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (lessons.data ?? []).filter(
      (l) =>
        !needle ||
        l.topic.toLowerCase().includes(needle) ||
        l.discipline.toLowerCase().includes(needle) ||
        l.teacher.full_name.toLowerCase().includes(needle),
    );
  }, [lessons.data, q]);

  const counts = useMemo(() => {
    const c = new Map<LessonStatus, number>();
    searched.forEach((l) => c.set(l.status, (c.get(l.status) ?? 0) + 1));
    return c;
  }, [searched]);

  const filtered = useMemo(() => (status ? searched.filter((l) => l.status === status) : searched), [searched, status]);

  const groups = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const l of filtered) {
      const key = l.date.slice(0, 7);
      map.set(key, [...(map.get(key) ?? []), l]);
    }
    return [...map.entries()];
  }, [filtered]);

  const trimester = year?.trimesters.find((t) => t.id === trimesterId);
  const departments = structure.data?.schools.flatMap((s) => s.departments) ?? [];
  const hasFilters = !!(q || status || department || mine);
  const reset = () => {
    setQ("");
    setStatus("");
    setDepartment("");
    setMine(false);
  };
  const chips = (Object.keys(statusMeta()) as LessonStatus[]).filter((s) => counts.get(s));

  return (
    <div>
      <PageHeader
        title={sc.title}
        subtitle={year ? sc.yearSubtitle(year.name) : " "}
        actions={
          years.data &&
          years.data.length > 1 && (
            <Select value={year?.id} onChange={(e) => setYearId(Number(e.target.value))} className="w-40" aria-label={sc.year}>
              {years.data.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </Select>
          )
        }
      />

      {year && (
        <Segmented
          label={sc.trimester}
          className="mb-4 w-full sm:w-full [&>button]:sm:flex-1"
          value={trimesterId ?? 0}
          onChange={(v) => {
            setTrimesterId(v);
            setStatus("");
          }}
          options={year.trimesters.map((tr) => ({ value: tr.id, label: sc.trimesterLabel(tr.roman) }))}
        />
      )}

      <Card className="mb-6 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_minmax(180px,260px)_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <Input
              type="search"
              className="pl-9 pr-9"
              placeholder={sc.searchPlaceholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={sc.search}
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label={sc.clearSearch}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <Select value={department} onChange={(e) => setDepartment(e.target.value)} aria-label={sc.department}>
            <option value="">{sc.allDepartments}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={() => setMine((v) => !v)}
            aria-pressed={mine}
            className={clsx(
              "inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition",
              mine ? "border-brand-900 bg-brand-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
            )}
          >
            <UserRound className="size-4" aria-hidden /> {sc.mine}
          </button>
        </div>
        {chips.length > 0 && (
          <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-0.5 md:flex-wrap md:overflow-visible" role="group" aria-label={sc.statusFilter}>
            <StatusChip active={!status} onClick={() => setStatus("")} label={c.actions.all} count={searched.length} />
            {chips.map((st) => (
              <StatusChip
                key={st}
                active={status === st}
                onClick={() => setStatus(status === st ? "" : st)}
                label={statusMeta()[st].label}
                count={counts.get(st) ?? 0}
              />
            ))}
          </div>
        )}
      </Card>

      {trimester?.status === "draft" && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {sc.draftNotice(trimester.roman)}{" "}
          {isManager ? (
            <Link to="/admin/schedule" className="font-medium underline underline-offset-2">
              {sc.goApprove}
            </Link>
          ) : (
            sc.afterApproval
          )}
        </div>
      )}

      <ErrorBox error={lessons.error} onRetry={() => void lessons.refetch()} />
      {lessons.isLoading || years.isLoading ? (
        <CardListSkeleton count={3} />
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarX2 />}
            title={hasFilters ? sc.noMatchesTitle : sc.emptyTitle}
            text={hasFilters ? sc.noMatchesText : sc.emptyText}
            action={
              hasFilters && (
                <Button variant="secondary" onClick={reset}>
                  {sc.resetFilters}
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map(([month, list]) => (
            <section key={month} aria-label={monthTitle(`${month}-01`)}>
              <SectionTitle count={list.length}>{monthTitle(`${month}-01`)}</SectionTitle>
              <div className="space-y-3">
                {list.map((l) => (
                  <LessonCard key={l.id} lesson={l} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
