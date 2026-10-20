import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, BarChart3, CalendarDays, ClipboardCheck, MapPin, MessageSquareText, Upload, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Feedback, Lesson } from "../api/types";
import { useAuth, useSystem } from "../auth";
import { DeadlineChip } from "../components/lesson";
import { Badge, Button, Card, CardHeader, EmptyState, RowsSkeleton, Skeleton, Stat, StatusBadge, usePageTitle } from "../components/ui";
import { useI18n, type Lang } from "../i18n";
import { fmtDate, fmtDateTime, localIso, parseDate, relative, weekday } from "../lib/format";

function LessonRow({ l, extra }: { l: Lesson; extra?: React.ReactNode }) {
  return (
    <Link to={`/lessons/${l.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-gray-50">
      <div className="w-14 shrink-0 text-center">
        <div className="text-lg font-semibold leading-none tabular">{parseDate(l.date).getDate()}</div>
        <div className="mt-1 text-[11px] text-gray-500">{fmtDate(l.date).split(" ")[1]?.slice(0, 3)} · {weekday(l.date)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900">{l.topic}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
          <span>{l.teacher.short_name}</span>
          <span>·</span>
          <span>
            {l.start_time}–{l.end_time}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {l.location?.code ?? l.place}
          </span>
        </div>
        <div className="mt-1.5 sm:hidden">{extra ?? <StatusBadge status={l.status} />}</div>
      </div>
      <div className="hidden shrink-0 sm:block">{extra ?? <StatusBadge status={l.status} />}</div>
    </Link>
  );
}

/** Names are stored as «Фамилия Имя Отчество»: RU greets by name + patronymic, EN by the given name. */
function greetingName(fullName: string, lang: Lang): string {
  const parts = fullName.split(" ");
  if (lang === "en") return parts[1] ?? fullName;
  return parts.length >= 3 ? `${parts[1]} ${parts[2]}` : parts[1] ?? fullName;
}

export default function HomePage() {
  const { lang, t } = useI18n();
  const c = t.common;
  const h = t.home;
  usePageTitle(c.nav.home);
  const { user, isManager, canAnalytics } = useAuth();
  const { now } = useSystem();
  const today = localIso(now).slice(0, 10);
  const inTwoWeeks = localIso(new Date(now.getTime() + 14 * 86400000)).slice(0, 10);

  const mine = useQuery({ queryKey: ["lessons", "mine"], queryFn: () => api.get<Lesson[]>("/api/lessons", { mine: true }) });
  const feedback = useQuery({ queryKey: ["feedback", "my"], queryFn: () => api.get<(Feedback & { lesson: Lesson })[]>("/api/feedback/my") });
  const upcoming = useQuery({
    queryKey: ["lessons", "upcoming", today],
    queryFn: () => api.get<Lesson[]>("/api/lessons", { date_from: today, date_to: inTwoWeeks, status: ["scheduled", "materials_ready", "confirmed"] }),
  });
  const attention = useQuery({
    queryKey: ["lessons", "attention"],
    queryFn: () => api.get<Lesson[]>("/api/lessons", { status: ["violation", "completed", "scheduled"] }),
    enabled: isManager,
  });

  const myNext = mine.data?.find((l) => l.date >= today && l.status !== "annulled");
  const tasks = (feedback.data ?? []).filter((f) => f.status === "pending" || f.status === "draft");
  const violations = attention.data?.filter((l) => l.status === "violation") ?? [];
  const awaiting = attention.data?.filter((l) => l.status === "completed") ?? [];
  const missing = (attention.data ?? []).filter(
    (l) => l.status === "scheduled" && l.materials_deadline && parseDate(l.materials_deadline).getTime() - now.getTime() < 4 * 86400000,
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500">{fmtDate(today, true)}, {weekday(today)}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{h.greeting(user ? greetingName(user.full_name, lang) : "")}</h1>
      </div>

      {isManager && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label={h.stats.violations} value={violations.length} icon={<AlertTriangle className="size-4 text-amber-500" />} hint={h.stats.violationsHint} />
          <Stat label={h.stats.awaiting} value={awaiting.length} icon={<Users className="size-4 text-violet-500" />} hint={h.stats.awaitingHint} />
          <Stat label={h.stats.missing} value={missing.length} icon={<Upload className="size-4 text-red-500" />} hint={h.stats.missingHint} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            icon={<Upload className="size-5" />}
            title={c.nav.myLesson}
            action={
              <Link to="/my-lessons">
                <Button size="sm" variant="ghost" icon={<ArrowRight className="size-4" />}>
                  {c.actions.open}
                </Button>
              </Link>
            }
          />
          {mine.isLoading ? (
            <div className="space-y-3 px-5 pb-5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-6 w-56" />
            </div>
          ) : myNext ? (
            <div className="space-y-3 px-5 pb-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-gray-500">
                  {fmtDate(myNext.date, true)} · {myNext.start_time}–{myNext.end_time} · {myNext.location?.code ?? myNext.place}
                </span>
                <StatusBadge status={myNext.status} />
              </div>
              <div className="text-[17px] font-medium leading-snug">{myNext.topic}</div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={myNext.materials.plan && myNext.materials.presentation ? "green" : "amber"}>
                  {h.myLesson.materials(Number(myNext.materials.plan) + Number(myNext.materials.presentation), 2)}
                </Badge>
                <DeadlineChip deadline={myNext.materials_deadline} status={myNext.status} />
              </div>
            </div>
          ) : (
            <EmptyState title={h.myLesson.emptyTitle} text={h.myLesson.emptyText} />
          )}
        </Card>

        <Card>
          <CardHeader
            icon={<MessageSquareText className="size-5" />}
            title={h.feedback.title}
            subtitle={h.feedback.subtitle}
            action={
              <Link to="/feedback">
                <Button size="sm" variant="ghost" icon={<ArrowRight className="size-4" />}>
                  {c.actions.all}
                </Button>
              </Link>
            }
          />
          {feedback.isLoading ? (
            <RowsSkeleton rows={2} />
          ) : tasks.length ? (
            <div className="divide-y divide-gray-100 border-t border-gray-100">
              {tasks.map((f) => (
                <Link key={f.id} to={`/feedback/${f.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{f.lesson.topic}</div>
                    <div className="text-xs text-gray-500">{f.lesson.teacher.full_name}</div>
                  </div>
                  <Badge tone="amber">{h.feedback.due(fmtDateTime(f.due_at))}</Badge>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title={h.feedback.emptyTitle} text={h.feedback.emptyText} />
          )}
        </Card>
      </div>

      {isManager && (violations.length > 0 || awaiting.length > 0 || missing.length > 0) && (
        <Card>
          <CardHeader
            icon={<ClipboardCheck className="size-5" />}
            title={h.attention.title}
            action={
              <Link to="/admin/control">
                <Button size="sm" variant="ghost" icon={<ArrowRight className="size-4" />}>
                  {c.nav.control}
                </Button>
              </Link>
            }
          />
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {violations.map((l) => (
              <LessonRow key={l.id} l={l} extra={<Badge tone="amber">{c.status.violation.label}</Badge>} />
            ))}
            {awaiting.map((l) => (
              <LessonRow key={l.id} l={l} extra={<Badge tone="violet">{h.attention.confirmAttendees}</Badge>} />
            ))}
            {missing.map((l) => (
              <LessonRow key={l.id} l={l} extra={<Badge tone="red">{h.attention.deadline(relative(l.materials_deadline, now))}</Badge>} />
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          icon={<CalendarDays className="size-5" />}
          title={h.upcoming.title}
          subtitle={h.upcoming.subtitle}
          action={
            <Link to="/schedule">
              <Button size="sm" variant="ghost" icon={<ArrowRight className="size-4" />}>
                {c.nav.schedule}
              </Button>
            </Link>
          }
        />
        {upcoming.isLoading ? (
          <RowsSkeleton rows={4} />
        ) : upcoming.data?.length ? (
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {upcoming.data.map((l) => (
              <LessonRow key={l.id} l={l} />
            ))}
          </div>
        ) : (
          <EmptyState title={h.upcoming.empty} />
        )}
      </Card>

      {canAnalytics && !isManager && (
        <Link to="/analytics">
          <Card className="flex items-center justify-between p-5 hover:border-gray-300">
            <div className="flex items-center gap-3">
              <BarChart3 className="size-5 text-brand-600" />
              <div>
                <div className="font-medium">{c.nav.analytics}</div>
                <div className="text-sm text-gray-500">{h.analyticsText}</div>
              </div>
            </div>
            <ArrowRight className="size-5 text-gray-400" />
          </Card>
        </Link>
      )}
    </div>
  );
}
