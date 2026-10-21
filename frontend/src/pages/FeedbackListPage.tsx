import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MessageSquareText } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Feedback, Lesson } from "../api/types";
import { useSystem } from "../auth";
import { Stars } from "../components/sections";
import { Badge, Card, EmptyState, ErrorBox, PageHeader, RowsSkeleton, SectionTitle, usePageTitle } from "../components/ui";
import { useI18n } from "../i18n";
import { fmtDate, fmtDateTime, relative } from "../lib/format";

type Item = Feedback & { lesson: Lesson };

const STATUS_TONE = {
  pending: "amber" as const,
  draft: "blue" as const,
  submitted: "green" as const,
  expired: "red" as const,
};

function Row({ f }: { f: Item }) {
  const fb = useI18n().t.feedback;
  const { now } = useSystem();
  const open = f.status === "pending" || f.status === "draft";
  return (
    <Link to={`/feedback/${f.id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-gray-50">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-gray-900">{f.lesson.topic}</div>
        <div className="mt-0.5 truncate text-sm text-gray-500">
          {f.lesson.teacher.full_name} · {fmtDate(f.lesson.date)} · {f.lesson.discipline}
        </div>
        <div className="mt-1 text-xs text-gray-500">
          {open ? (
            <span className="text-amber-700">{fb.fillBy(fmtDateTime(f.due_at), relative(f.due_at, now))}</span>
          ) : f.submitted_at ? (
            fb.sentAt(fmtDateTime(f.submitted_at))
          ) : (
            fb.expiredAt(fmtDateTime(f.due_at))
          )}
          {f.replies.length > 0 && <span className="ml-2 text-brand-600">· {fb.hasReply}</span>}
        </div>
      </div>
      {f.status === "submitted" && <Stars value={f.average} />}
      <Badge tone={STATUS_TONE[f.status]}>{fb.status[f.status]}</Badge>
      <ChevronRight className="size-4 text-gray-400" />
    </Link>
  );
}

export default function FeedbackListPage() {
  const { t } = useI18n();
  const fb = t.feedback;
  usePageTitle(t.common.nav.myFeedback);
  const q = useQuery({ queryKey: ["feedback", "my"], queryFn: () => api.get<Item[]>("/api/feedback/my") });
  const items = q.data ?? [];
  const open = items.filter((f) => f.status === "pending" || f.status === "draft");
  const done = items.filter((f) => !(f.status === "pending" || f.status === "draft"));
  return (
    <div>
      <PageHeader title={t.common.nav.myFeedback} subtitle={fb.listSubtitle} />
      <ErrorBox error={q.error} />
      {q.isLoading ? (
        <Card className="overflow-hidden">
          <RowsSkeleton rows={4} />
        </Card>
      ) : !items.length ? (
        <Card>
          <EmptyState icon={<MessageSquareText className="size-6" />} title={fb.emptyTitle} text={fb.emptyText} />
        </Card>
      ) : (
        <div className="space-y-6">
          {open.length > 0 && (
            <section>
              <SectionTitle count={open.length}>{fb.awaiting}</SectionTitle>
              <Card className="divide-y divide-gray-100 overflow-hidden">
                {open.map((f) => (
                  <Row key={f.id} f={f} />
                ))}
              </Card>
            </section>
          )}
          {done.length > 0 && (
            <section>
              <SectionTitle count={done.length}>{fb.history}</SectionTitle>
              <Card className="divide-y divide-gray-100 overflow-hidden">
                {done.map((f) => (
                  <Row key={f.id} f={f} />
                ))}
              </Card>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
