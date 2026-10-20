import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Lesson, LessonDetail } from "../api/types";
import { useSystem } from "../auth";
import { DeadlineChip, LessonCard, MaterialsPanel } from "../components/lesson";
import { PlanAnalysisCard } from "../components/sections";
import { Button, Card, CardListSkeleton, EmptyState, ErrorBox, InfoRow, PageHeader, SectionTitle, StatusBadge, usePageTitle } from "../components/ui";
import { useI18n } from "../i18n";
import { fmtDate, localIso } from "../lib/format";

function ActiveLesson({ id }: { id: number }) {
  const m = useI18n().t.myLessons;
  const q = useQuery({ queryKey: ["lesson", id], queryFn: () => api.get<LessonDetail>(`/api/lessons/${id}`) });
  if (q.isLoading) return <CardListSkeleton count={2} />;
  if (q.error) return <ErrorBox error={q.error} />;
  const l = q.data!;
  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm text-gray-500">{m.trimester(l.trimester_roman, l.year_name)}</div>
            <h2 className="mt-1 text-xl font-semibold leading-snug">{l.topic}</h2>
          </div>
          <StatusBadge status={l.status} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <InfoRow label={m.discipline}>{l.discipline}</InfoRow>
          <InfoRow label={m.date}>{fmtDate(l.date, true)}</InfoRow>
          <InfoRow label={m.time}>
            {l.start_time}–{l.end_time}
          </InfoRow>
          <InfoRow label={m.place}>{l.place}</InfoRow>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <DeadlineChip deadline={l.materials_deadline} status={l.status} />
          <Link to={`/lessons/${l.id}`}>
            <Button variant="secondary" size="sm" icon={<ArrowRight className="size-4" />}>
              {m.lessonCard}
            </Button>
          </Link>
        </div>
      </Card>
      <MaterialsPanel lesson={l} />
      <PlanAnalysisCard lesson={l} />
    </div>
  );
}

export default function MyLessonsPage() {
  const { t } = useI18n();
  const m = t.myLessons;
  usePageTitle(t.common.nav.myLesson);
  const { now } = useSystem();
  const today = localIso(now).slice(0, 10);
  const q = useQuery({ queryKey: ["lessons", "mine"], queryFn: () => api.get<Lesson[]>("/api/lessons", { mine: true }) });
  const lessons = q.data ?? [];
  const active = lessons.find((l) => l.date >= today && l.status !== "annulled") ?? lessons.find((l) => ["violation", "completed", "feedback"].includes(l.status));
  const others = lessons.filter((l) => l.id !== active?.id).reverse();

  return (
    <div>
      <PageHeader title={t.common.nav.myLesson} subtitle={m.subtitle} />
      <ErrorBox error={q.error} />
      {q.isLoading ? (
        <CardListSkeleton count={1} />
      ) : !lessons.length ? (
        <Card>
          <EmptyState icon={<CalendarPlus className="size-6" />} title={m.emptyTitle} text={m.emptyText} />
        </Card>
      ) : (
        <div className="space-y-8">
          {active && <ActiveLesson id={active.id} />}
          {others.length > 0 && (
            <section>
              <SectionTitle count={others.length}>{m.others}</SectionTitle>
              <div className="space-y-3">
                {others.map((l) => (
                  <LessonCard key={l.id} lesson={l} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
