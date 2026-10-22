import { useMutation, useQuery } from "@tanstack/react-query";
import { Award, BarChart3, CalendarCheck2, CalendarX2, FileSpreadsheet, FileText, MessageSquareText, Star, Table2, Upload, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, download } from "../api/client";
import type { Analytics, GroupStats } from "../api/types";
import { useAuth } from "../auth";
import { Button, Card, CardHeader, EmptyState, ErrorBox, PageHeader, Select, Stat, StatsSkeleton, usePageTitle, useToast } from "../components/ui";
import { useI18n } from "../i18n";
import { fmtDate, score, statusMeta } from "../lib/format";
import { useStructure, useYears } from "./SchedulePage";

// Categorical slots 1–3 of the validated reference palette (scripts/validate_palette.js: all checks pass, light mode)
const SERIES = { conducted: "#2a78d6", annulled: "#eb6834", planned: "#1baf7a" };
const GRID = "#e8eaee";
const AXIS = "#6b7280";

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-gray-900">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-gray-700">
          <i className="size-2.5 rounded-sm" style={{ background: p.color }} />
          {p.name}: <b className="tabular">{p.value}</b>
        </div>
      ))}
    </div>
  );
}

function GroupTable<T extends GroupStats>({ rows, first, firstLabel, second, secondLabel }: {
  rows: T[];
  first: keyof T;
  firstLabel: string;
  second?: keyof T;
  secondLabel?: string;
}) {
  const tb = useI18n().t.analytics.table;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-gray-50 text-left text-xs text-gray-500">
          <tr>
            <th className="px-5 py-2.5 font-medium">{firstLabel}</th>
            {second && <th className="px-3 py-2.5 font-medium">{secondLabel}</th>}
            <th className="px-3 py-2.5 text-right font-medium">{tb.total}</th>
            <th className="px-3 py-2.5 text-right font-medium">{tb.conducted}</th>
            <th className="px-3 py-2.5 text-right font-medium">{tb.annulled}</th>
            <th className="px-3 py-2.5 text-right font-medium">{tb.onTime}</th>
            <th className="px-3 py-2.5 text-right font-medium">{tb.visits}</th>
            <th className="px-3 py-2.5 text-right font-medium">{tb.feedback}</th>
            <th className="px-5 py-2.5 text-right font-medium">{tb.score}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 tabular">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-5 py-2.5 font-medium">{String(r[first] ?? "—")}</td>
              {second && <td className="px-3 py-2.5 text-gray-500">{String(r[second] ?? "—")}</td>}
              <td className="px-3 py-2.5 text-right">{r.total}</td>
              <td className="px-3 py-2.5 text-right">{r.conducted}</td>
              <td className="px-3 py-2.5 text-right">{r.annulled}</td>
              <td className="px-3 py-2.5 text-right">{pct(r.materials_on_time_rate)}</td>
              <td className="px-3 py-2.5 text-right">{r.visits}</td>
              <td className="px-3 py-2.5 text-right">{pct(r.feedback_rate)}</td>
              <td className="px-5 py-2.5 text-right font-medium">{score(r.avg_score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AnalyticsPage() {
  const { t } = useI18n();
  const c = t.common;
  const a = t.analytics;
  usePageTitle(c.nav.analytics);
  const { has, isManager } = useAuth();
  const toast = useToast();
  const years = useYears();
  const structure = useStructure();
  const deanOnly = has("dean") && !isManager && !has("leadership");
  const [yearId, setYearId] = useState<number | "">("");
  const [trimesterId, setTrimesterId] = useState<number | "">("");
  const [schoolId, setSchoolId] = useState<number | "">("");
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [monthTable, setMonthTable] = useState(false);
  const filters = { year_id: yearId, trimester_id: trimesterId, school_id: schoolId, department_id: departmentId };
  const q = useQuery({ queryKey: ["analytics", filters], queryFn: () => api.get<Analytics>("/api/analytics", filters) });
  const exportFile = useMutation({
    mutationFn: (format: "xlsx" | "pdf") => download("/api/reports/export", { ...filters, format }, `openlesson_report.${format}`),
    onError: (e: Error) => toast(e.message, "error"),
  });

  const year = years.data?.find((y) => y.id === yearId);
  const departments = structure.data?.schools.filter((s) => !schoolId || s.id === schoolId).flatMap((s) => s.departments) ?? [];
  const months = useMemo(() => {
    const rows = q.data?.by_month ?? [];
    if (!rows.length) return [];
    const byKey = new Map(rows.map((m) => [m.month, m]));
    const [y0, m0] = rows[0].month.split("-").map(Number);
    const [y1, m1] = rows[rows.length - 1].month.split("-").map(Number);
    const out = [];
    for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? (y++, (m = 1)) : m++) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const r = byKey.get(key) ?? { total: 0, conducted: 0, annulled: 0 };
      out.push({ label: `${a.monthly.monthsShort[m - 1]} ${String(y).slice(2)}`, conducted: r.conducted, annulled: r.annulled, planned: r.total - r.conducted - r.annulled });
    }
    return out;
  }, [q.data, a]);

  const d = q.data;
  const s = d?.summary;
  return (
    <div className="space-y-5">
      <PageHeader
        title={c.nav.analytics}
        subtitle={deanOnly ? a.subtitleDean : a.subtitle}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<FileSpreadsheet className="size-4" />} loading={exportFile.isPending && exportFile.variables === "xlsx"} onClick={() => exportFile.mutate("xlsx")}>
              Excel
            </Button>
            <Button variant="secondary" size="sm" icon={<FileText className="size-4" />} loading={exportFile.isPending && exportFile.variables === "pdf"} onClick={() => exportFile.mutate("pdf")}>
              PDF
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={yearId} onChange={(e) => { setYearId(e.target.value ? Number(e.target.value) : ""); setTrimesterId(""); }} aria-label={a.filters.year}>
          <option value="">{a.filters.allYears}</option>
          {years.data?.map((y) => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </Select>
        <Select value={trimesterId} disabled={!year} onChange={(e) => setTrimesterId(e.target.value ? Number(e.target.value) : "")} aria-label={a.filters.trimester}>
          <option value="">{a.filters.allTrimesters}</option>
          {year?.trimesters.map((tr) => (
            <option key={tr.id} value={tr.id}>{a.filters.trimesterLabel(tr.roman)}</option>
          ))}
        </Select>
        {!deanOnly && (
          <Select value={schoolId} onChange={(e) => { setSchoolId(e.target.value ? Number(e.target.value) : ""); setDepartmentId(""); }} aria-label={a.filters.school}>
            <option value="">{a.filters.allSchools}</option>
            {structure.data?.schools.map((sch) => (
              <option key={sch.id} value={sch.id}>{sch.name}</option>
            ))}
          </Select>
        )}
        <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : "")} aria-label={a.filters.department}>
          <option value="">{a.filters.allDepartments}</option>
          {departments.map((dep) => (
            <option key={dep.id} value={dep.id}>{dep.name}</option>
          ))}
        </Select>
      </div>

      <ErrorBox error={q.error} />
      {q.isLoading || !d || !s ? (
        <StatsSkeleton count={8} />
      ) : s.total === 0 ? (
        <Card>
          <EmptyState icon={<BarChart3 className="size-6" />} title={a.noData} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={a.kpi.total} value={s.total} icon={<CalendarCheck2 className="size-4 text-gray-400" />} hint={a.kpi.plannedHint(s.planned)} />
            <Stat label={a.kpi.conducted} value={s.conducted} icon={<Award className="size-4 text-gray-400" />} hint={a.kpi.annulledHint(s.annulled)} />
            <Stat label={a.kpi.onTime} value={pct(s.materials_on_time_rate)} icon={<Upload className="size-4 text-gray-400" />} hint={a.kpi.onTimeHint} />
            <Stat label={a.kpi.visits} value={s.visits} icon={<Users className="size-4 text-gray-400" />} hint={a.kpi.visitsHint(score(s.avg_visits))} />
            <Stat label={a.kpi.feedback} value={pct(s.feedback_rate)} icon={<MessageSquareText className="size-4 text-gray-400" />} hint={a.kpi.feedbackHint(s.feedback_submitted, s.feedback_expected)} />
            <Stat label={a.kpi.avgScore} value={score(s.avg_score)} icon={<Star className="size-4 text-gray-400" />} hint={a.kpi.avgScoreHint} />
            <Stat label={a.kpi.annulled} value={s.annulled} icon={<CalendarX2 className="size-4 text-gray-400" />} hint={s.total ? a.kpi.annulledShare(Math.round((s.annulled / s.total) * 100)) : undefined} />
            <Stat label={a.kpi.observers} value={d.top_observers.length} icon={<Users className="size-4 text-gray-400" />} hint={a.kpi.observersHint} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader
                title={a.monthly.title}
                subtitle={a.monthly.subtitle}
                action={
                  <Button size="sm" variant="ghost" icon={<Table2 className="size-4" />} onClick={() => setMonthTable((v) => !v)}>
                    {monthTable ? a.monthly.showChart : a.monthly.showTable}
                  </Button>
                }
              />
              <div className="px-3 pb-4">
                {monthTable ? (
                  <table className="mx-2 w-[calc(100%-1rem)] text-sm tabular">
                    <thead className="text-left text-xs text-gray-500">
                      <tr>
                        <th className="py-2 font-medium">{a.monthly.month}</th>
                        <th className="py-2 text-right font-medium">{a.series.conducted}</th>
                        <th className="py-2 text-right font-medium">{a.series.annulled}</th>
                        <th className="py-2 text-right font-medium">{a.series.planned}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {months.map((m) => (
                        <tr key={m.label}>
                          <td className="py-2">{m.label}</td>
                          <td className="py-2 text-right">{m.conducted}</td>
                          <td className="py-2 text-right">{m.annulled}</td>
                          <td className="py-2 text-right">{m.planned}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={months} margin={{ top: 8, right: 12, left: -16, bottom: 0 }} barCategoryGap="28%">
                      <CartesianGrid vertical={false} stroke={GRID} />
                      <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS, fontSize: 12 }} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 12 }} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(17,24,39,0.04)" }} />
                      <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: "#374151" }} />
                      <Bar dataKey="conducted" name={a.series.conducted} stackId="a" fill={SERIES.conducted} stroke="#fff" strokeWidth={1} maxBarSize={24} />
                      <Bar dataKey="annulled" name={a.series.annulled} stackId="a" fill={SERIES.annulled} stroke="#fff" strokeWidth={1} maxBarSize={24} />
                      <Bar dataKey="planned" name={a.series.planned} stackId="a" fill={SERIES.planned} stroke="#fff" strokeWidth={1} maxBarSize={24} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title={a.statuses.title} subtitle={a.statuses.subtitle} />
              <div className="space-y-2.5 px-5 pb-5">
                {d.by_status.filter((b) => b.count > 0).map((b) => {
                  const max = Math.max(...d.by_status.map((x) => x.count));
                  return (
                    <div key={b.status} className="grid grid-cols-[minmax(150px,auto)_1fr_32px] items-center gap-3 text-sm">
                      <span className="truncate text-gray-600">{statusMeta()[b.status]?.label ?? b.label}</span>
                      <div className="h-2.5 rounded-full bg-gray-100">
                        <div className="h-full rounded-full" style={{ width: `${(b.count / max) * 100}%`, background: SERIES.conducted }} />
                      </div>
                      <span className="text-right font-medium tabular">{b.count}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader title={a.criteria.title} subtitle={a.criteria.subtitle} />
              <div className="px-3 pb-4">
                {d.criteria.length ? (
                  <ResponsiveContainer width="100%" height={Math.max(220, d.criteria.length * 38)}>
                    <BarChart data={d.criteria} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
                      <CartesianGrid horizontal={false} stroke={GRID} />
                      <XAxis type="number" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 12 }} />
                      <YAxis type="category" dataKey="title" width={210} tickLine={false} axisLine={false} tick={{ fill: "#374151", fontSize: 12 }} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(17,24,39,0.04)" }} />
                      <Bar dataKey="average" name={a.criteria.series} fill={SERIES.conducted} maxBarSize={18} radius={[0, 4, 4, 0]}>
                        <LabelList dataKey="average" position="right" style={{ fill: "#111827", fontSize: 12, fontWeight: 600 }} formatter={(v: unknown) => score(Number(v))} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState title={a.criteria.empty} />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title={a.top.title} subtitle={a.top.subtitle} />
              <div className="divide-y divide-gray-100 border-t border-gray-100">
                {d.top_lessons.map((l, i) => (
                  <Link key={l.id} to={`/lessons/${l.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                    <span className="w-5 text-sm font-semibold text-gray-400 tabular">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{l.topic}</div>
                      <div className="text-xs text-gray-500">{l.teacher} · {fmtDate(l.date, true)}</div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold tabular">
                      <Star className="size-3.5 fill-amber-400 text-amber-400" /> {score(l.avg_score)}
                    </span>
                  </Link>
                ))}
              </div>
              {d.top_observers.length > 0 && (
                <>
                  <div className="border-t border-gray-100 px-5 pt-4 pb-2 text-sm font-semibold">{a.top.observers}</div>
                  <div className="px-5 pb-4 text-sm">
                    {d.top_observers.slice(0, 5).map((o) => (
                      <div key={o.user_id} className="flex justify-between py-1">
                        <span className="truncate text-gray-700">{o.full_name}</span>
                        <span className="tabular text-gray-500">{o.visits}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader title={a.groups.byDepartment} />
            <GroupTable rows={d.by_department} first="department" firstLabel={a.groups.department} second="school" secondLabel={a.groups.school} />
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title={a.groups.byTeacher} />
            <GroupTable rows={d.by_teacher} first="teacher" firstLabel={a.groups.teacher} second="department" secondLabel={a.groups.department} />
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title={a.groups.byTrimester} />
            <GroupTable rows={d.by_trimester} first="label" firstLabel={a.groups.trimester} />
          </Card>
        </>
      )}
    </div>
  );
}
