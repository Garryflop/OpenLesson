import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ArrowLeft,
  Ban,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  MapPin,
  MessageSquareText,
  RotateCcw,
  ShieldAlert,
  TimerReset,
  User as UserIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { LessonDetail, Location } from "../api/types";
import { useSystem } from "../auth";
import { useI18n } from "../i18n";
import { MaterialsPanel } from "../components/lesson";
import { AttendanceSection, FeedbackSection, HistorySection, PlanAnalysisCard, PosterCard, QrCard } from "../components/sections";
import { Button, Card, ErrorBox, Field, InfoRow, Input, Modal, Select, Skeleton, StatusBadge, Textarea, usePageTitle, useToast } from "../components/ui";
import { fmtDate, fmtDateTime, localIso, relative, statusMeta, weekday } from "../lib/format";

const CampusMap = lazy(() => import("../map/CampusMap"));

/* ------------------------------------------------------------------ status steps */

const STEPS = ["plan", "materials", "confirmed", "poster", "held", "feedback", "closed"] as const;

function stepIndex(l: LessonDetail): number {
  switch (l.status) {
    case "draft":
      return -1;
    case "scheduled":
      return 0;
    case "materials_ready":
    case "violation":
      return 1;
    case "confirmed":
      return l.poster_sent_at ? 3 : 2;
    case "completed":
      return 4;
    case "feedback":
      return 5;
    case "closed":
      return 6;
    default:
      return 0;
  }
}

function StatusSteps({ lesson }: { lesson: LessonDetail }) {
  const t = useI18n().t.lesson;
  const current = stepIndex(lesson);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    // on a narrow screen show the current step instead of the first ones (scrolls only this row)
    const el = list.current;
    const step = el?.querySelector<HTMLElement>("[aria-current=step]");
    if (el && step) el.scrollLeft = step.offsetLeft - (el.clientWidth - step.offsetWidth) / 2;
  }, [current]);
  if (lesson.status === "annulled") return null;
  return (
    <ol ref={list} className="no-scrollbar relative flex snap-x items-center gap-1 overflow-x-auto pb-1">
      {STEPS.map((s, i) => (
        <li key={s} className="flex min-w-fit flex-1 snap-center items-center gap-1" aria-current={i === current ? "step" : undefined}>
          <div
            className={clsx(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
              i < current && "bg-emerald-50 text-emerald-700",
              i === current && "bg-brand-900 text-white",
              i > current && "bg-gray-100 text-gray-400",
            )}
          >
            {i < current ? <Check className="size-3.5" /> : <span className="tabular">{i + 1}</span>}
            {t.steps[s]}
          </div>
          {i < STEPS.length - 1 && <div className={clsx("h-px min-w-3 flex-1", i < current ? "bg-emerald-300" : "bg-gray-200")} />}
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ admin actions */

type Action = "reschedule" | "annul" | "restore" | "extend" | "confirm" | null;

function AdminActions({ lesson }: { lesson: LessonDetail }) {
  const { t: tt } = useI18n();
  const t = tt.lesson;
  const qc = useQueryClient();
  const toast = useToast();
  const { now } = useSystem();
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(lesson.date);
  const [start, setStart] = useState(lesson.start_time);
  const [end, setEnd] = useState(lesson.end_time);
  const [locationId, setLocationId] = useState<number | "">(lesson.location?.id ?? "");
  const [until, setUntil] = useState(localIso(new Date(now.getTime() + 2 * 86400000)).slice(0, 16));
  const locations = useQuery({ queryKey: ["locations"], queryFn: () => api.get<Location[]>("/api/locations", { active: true }), enabled: action === "reschedule" });

  const run = useMutation({
    mutationFn: () => {
      const id = lesson.id;
      switch (action) {
        case "reschedule":
          return api.post(`/api/lessons/${id}/reschedule`, { date, start_time: start, end_time: end, location_id: locationId || null, reason });
        case "annul":
          return api.post(`/api/lessons/${id}/annul`, { reason });
        case "restore":
          return api.post(`/api/lessons/${id}/restore`, { reason, new_deadline: lesson.materials.plan && lesson.materials.presentation ? null : until });
        case "extend":
          return api.post(`/api/lessons/${id}/extend`, { reason, until });
        case "confirm":
          return api.post(`/api/lessons/${id}/confirm`, { reason });
        default:
          return Promise.resolve();
      }
    },
    onSuccess: () => {
      toast(t.admin.saved);
      setAction(null);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["lesson", lesson.id] });
      void qc.invalidateQueries({ queryKey: ["lessons"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const s = lesson.status;
  const buttons: { a: Action; label: string; icon: React.ReactNode; show: boolean; variant?: "danger" | "secondary" }[] = [
    { a: "confirm", label: t.admin.actions.confirm, icon: <CheckCircle2 className="size-4" />, show: s === "violation" || s === "materials_ready" },
    { a: "extend", label: t.admin.actions.extend, icon: <TimerReset className="size-4" />, show: ["scheduled", "materials_ready", "violation"].includes(s) },
    { a: "restore", label: t.admin.actions.restore, icon: <RotateCcw className="size-4" />, show: s === "annulled" && !lesson.is_past },
    { a: "reschedule", label: t.admin.actions.reschedule, icon: <CalendarClock className="size-4" />, show: !["completed", "feedback", "closed"].includes(s) },
    { a: "annul", label: t.admin.actions.annul, icon: <Ban className="size-4" />, show: !["annulled", "completed", "feedback", "closed"].includes(s), variant: "danger" },
  ];
  const visible = buttons.filter((b) => b.show);
  if (!visible.length) return null;
  const titles: Record<string, string> = t.admin.titles;
  const needsDeadline = action === "extend" || (action === "restore" && !(lesson.materials.plan && lesson.materials.presentation));

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <ShieldAlert className="size-4 text-gray-500" /> {t.admin.title}
      </div>
      <div className="flex flex-col gap-2">
        {visible.map((b) => (
          <Button key={b.a} variant={b.variant === "danger" ? "secondary" : "secondary"} className={clsx("justify-start", b.variant === "danger" && "text-red-600")} icon={b.icon} onClick={() => setAction(b.a)}>
            {b.label}
          </Button>
        ))}
      </div>
      <Modal
        open={!!action}
        onClose={() => setAction(null)}
        persistent
        title={action ? titles[action] : ""}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAction(null)}>
              {tt.common.actions.cancel}
            </Button>
            <Button variant={action === "annul" ? "danger" : "primary"} loading={run.isPending} disabled={reason.trim().length < 3} onClick={() => run.mutate()}>
              {tt.common.actions.save}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {action === "reschedule" && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Field label={t.fields.date} className="col-span-3 sm:col-span-1">
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label={t.fields.start}>
                  <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
                </Field>
                <Field label={t.fields.end}>
                  <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                </Field>
              </div>
              <Field label={t.fields.room}>
                <Select value={locationId} onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">{t.admin.roomUnchanged}</option>
                  {locations.data?.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} {l.title ? `· ${l.title}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          {needsDeadline && (
            <Field label={t.admin.newDeadline}>
              <Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
            </Field>
          )}
          <Field label={action === "annul" ? t.admin.annulReason : t.admin.reason} hint={t.admin.reasonHint}>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

/* ------------------------------------------------------------------ page */

function LessonSkeleton() {
  const t = useI18n().t.lesson;
  return (
    <div className="space-y-5" role="status" aria-label={t.loadingLabel}>
      <Skeleton className="h-4 w-20" />
      <Card className="space-y-4 p-6">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-6 w-28" />
        </div>
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
        <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
        <Skeleton className="h-7 w-full" />
      </Card>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="space-y-3 p-5">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </Card>
        <Card className="space-y-3 p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="aspect-[1240/1754] w-full rounded-xl" />
        </Card>
      </div>
    </div>
  );
}

function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  const t = useI18n().t.lesson;
  if (items.length < 3) return null;
  return (
    <nav aria-label={t.sectionNavLabel} className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
      {items.map((i) => (
        <a
          key={i.id}
          href={`#${i.id}`}
          className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-gray-600 shadow-card ring-1 ring-gray-200/80 transition hover:text-gray-900 hover:ring-gray-300"
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}

export default function LessonPage() {
  const { t: tt } = useI18n();
  const t = tt.lesson;
  const { id } = useParams();
  const navigate = useNavigate();
  const { now } = useSystem();
  const q = useQuery({ queryKey: ["lesson", Number(id)], queryFn: () => api.get<LessonDetail>(`/api/lessons/${id}`) });
  usePageTitle(q.data?.topic ?? t.pageTitle);
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/schedule"));

  if (q.isLoading) return <LessonSkeleton />;
  if (q.error)
    return (
      <div className="space-y-4">
        <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
        <Button variant="secondary" icon={<ArrowLeft className="size-4" />} onClick={back}>
          {tt.common.actions.back}
        </Button>
      </div>
    );
  const l = q.data!;
  const p = l.permissions;
  const showPlan = p.view_details && (l.materials.plan || p.is_teacher);
  const showFeedback = p.view_details && ["feedback", "closed"].includes(l.status);
  const showAttendance = p.view_details && ["confirmed", "completed", "feedback", "closed"].includes(l.status) && (p.manage || l.attendance_count > 0);
  const sections = [
    p.view_details && { id: "materials", label: t.sections.materials },
    showPlan && { id: "ai-plan", label: t.sections.aiPlan },
    showAttendance && { id: "attendance", label: t.sections.attendance },
    showFeedback && { id: "feedback", label: t.sections.feedback },
    p.view_details && l.events.length > 0 && { id: "history", label: t.sections.history },
  ].filter(Boolean) as { id: string; label: string }[];

  return (
    <div className="space-y-5">
      <button onClick={back} className="inline-flex items-center gap-1.5 rounded-lg text-sm text-gray-500 transition hover:text-gray-900">
        <ArrowLeft className="size-4" aria-hidden /> {tt.common.actions.back}
      </button>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="text-sm text-gray-500">
            {t.trimesterLine(l.trimester_roman, l.year_name)}
            {l.department_name && ` · ${l.department_name}`}
          </div>
          <StatusBadge status={l.status} />
        </div>
        <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.025em] text-gray-950">{l.topic}</h1>
        <p className="mt-1 text-[15px] text-gray-600">{l.discipline}</p>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InfoRow label={t.fields.dateTime}>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4 shrink-0 text-gray-400" aria-hidden />
              {fmtDate(l.date, true)}, {weekday(l.date)} · {l.start_time}–{l.end_time}
            </span>
          </InfoRow>
          <InfoRow label={t.fields.place}>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4 shrink-0 text-gray-400" aria-hidden />
              {l.location ? (
                <Link
                  to={`/map?room=${encodeURIComponent(l.location.map_key ?? l.location.code)}`}
                  className="text-brand-700 underline decoration-brand-100 underline-offset-4 transition hover:decoration-brand-500"
                >
                  {l.place}
                </Link>
              ) : (
                l.place
              )}
            </span>
          </InfoRow>
          <InfoRow label={t.fields.teacher}>
            <span className="inline-flex items-center gap-1.5">
              <UserIcon className="size-4 shrink-0 text-gray-400" aria-hidden />
              {l.teacher.full_name}
            </span>
            <div className="text-sm text-gray-500">{l.teacher_position}</div>
          </InfoRow>
        </div>
        <div className="mt-5">
          <StatusSteps lesson={l} />
        </div>
        {l.status === "annulled" && (
          <div role="status" className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <b>{t.banner.annulled}</b> {l.annulled_at && fmtDateTime(l.annulled_at, true)}. {l.annul_reason}
            </div>
          </div>
        )}
        {l.status === "violation" && (
          <div role="status" className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <b>{t.banner.violation}</b>{" "}
              {p.manage ? t.banner.violationManage : t.banner.violationWait}
            </div>
          </div>
        )}
        {l.status !== "annulled" && l.status !== "violation" && <p className="mt-3 text-sm text-gray-500">{statusMeta()[l.status].hint}.</p>}
      </Card>

      {l.my_feedback && !p.is_teacher && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-sky-200 bg-sky-50/70 p-4">
          <div className="flex items-center gap-3 text-sm text-sky-900">
            <MessageSquareText className="size-5 shrink-0" aria-hidden />
            {l.my_feedback.status === "submitted"
              ? t.myFeedback.submitted
              : t.myFeedback.pending(relative(l.my_feedback.due_at, now))}
          </div>
          <Link to={`/feedback/${l.my_feedback.id}`}>
            <Button size="sm">{l.my_feedback.status === "submitted" ? t.myFeedback.open : t.myFeedback.fill}</Button>
          </Link>
        </Card>
      )}

      <SectionNav items={sections} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {p.view_details && <MaterialsPanel lesson={l} />}
          {showPlan && <PlanAnalysisCard lesson={l} />}
          {showAttendance && <AttendanceSection lesson={l} />}
          {showFeedback && <FeedbackSection lesson={l} />}
          {p.view_details && <HistorySection lesson={l} />}
        </div>
        <aside className="space-y-5" aria-label={t.asideLabel}>
          {p.manage && <AdminActions lesson={l} />}
          <PosterCard lesson={l} />
          {(p.manage || p.is_teacher) && <QrCard lesson={l} />}
          {l.location?.map_key && (
            <Card className="overflow-hidden">
              <Link
                to={`/map?room=${encodeURIComponent(l.location.map_key)}`}
                className="flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium transition hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  <MapPin className="size-4 text-gray-400" aria-hidden /> {l.location.title ?? l.location.code} · {t.floor(l.location.floor)}
                </span>
                <span className="text-brand-600">{t.openMap}</span>
              </Link>
              <Suspense fallback={<Skeleton className="h-[250px] rounded-none" />}>
                <CampusMap compact selected={l.location.map_key} height={250} className="rounded-none border-0" />
              </Suspense>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
