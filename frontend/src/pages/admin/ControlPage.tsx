import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, MessageSquareWarning, PlayCircle, Upload, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { Lesson, UserBrief } from "../../api/types";
import { useSystem } from "../../auth";
import { Badge, Button, Card, CardHeader, CardListSkeleton, EmptyState, PageHeader, RowsSkeleton, usePageTitle, useToast } from "../../components/ui";
import { useI18n } from "../../i18n";
import { fmtDate, fmtDateTime, parseDate, relative } from "../../lib/format";

interface Missing {
  id: number;
  status: string;
  due_at: string;
  overdue: boolean;
  reminders_sent: number;
  author: UserBrief;
  lesson: { id: number; topic: string; teacher: string; date: string };
}

function LessonList({ items, badge }: { items: Lesson[]; badge: (l: Lesson) => React.ReactNode }) {
  const s = useI18n().t.admin.control;
  if (!items.length) return <p className="px-5 pb-5 text-sm text-gray-500">{s.noLessons}</p>;
  return (
    <div className="divide-y divide-gray-100 border-t border-gray-100">
      {items.map((l) => (
        <Link key={l.id} to={`/lessons/${l.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{l.topic}</div>
            <div className="text-xs text-gray-500">
              {l.teacher.full_name} · {fmtDate(l.date)} {l.start_time}
            </div>
          </div>
          {badge(l)}
        </Link>
      ))}
    </div>
  );
}

export default function ControlPage() {
  const s = useI18n().t.admin.control;
  usePageTitle(s.pageTitle);
  const qc = useQueryClient();
  const toast = useToast();
  const { now } = useSystem();
  const lessons = useQuery({
    queryKey: ["lessons", "control"],
    queryFn: () => api.get<Lesson[]>("/api/lessons", { status: ["scheduled", "materials_ready", "violation", "completed"] }),
  });
  const missing = useQuery({ queryKey: ["feedback-control"], queryFn: () => api.get<Missing[]>("/api/feedback-control") });
  const run = useMutation({
    mutationFn: () => api.post<Record<string, unknown>>("/api/automation/run"),
    onSuccess: (r) => {
      const parts = Object.entries(r)
        .filter(([, v]) => Array.isArray(v) && v.length)
        .map(([k, v]) => `${k}: ${(v as unknown[]).length}`);
      toast(parts.length ? s.runDone(parts.join(", ")) : s.runNothing);
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  if (lessons.isLoading) return <CardListSkeleton count={2} />;
  const all = lessons.data ?? [];
  const violations = all.filter((l) => l.status === "violation");
  const pendingMaterials = all
    .filter((l) => l.status === "scheduled" && l.materials_deadline)
    .sort((a, b) => a.materials_deadline!.localeCompare(b.materials_deadline!));
  const completed = all.filter((l) => l.status === "completed");
  const open = (missing.data ?? []).filter((m) => !m.overdue);
  const overdue = (missing.data ?? []).filter((m) => m.overdue);

  return (
    <div>
      <PageHeader
        title={s.title}
        subtitle={s.subtitle}
        actions={
          <Button icon={<PlayCircle className="size-4" />} loading={run.isPending} onClick={() => run.mutate()}>
            {s.run}
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<AlertTriangle className="size-5 text-amber-500" />} title={s.violations.title} subtitle={s.violations.subtitle} />
          <LessonList items={violations} badge={() => <Badge tone="amber">{s.violations.badge}</Badge>} />
        </Card>
        <Card>
          <CardHeader icon={<Users className="size-5 text-violet-500" />} title={s.attendees.title} subtitle={s.attendees.subtitle} />
          <LessonList items={completed} badge={() => <Badge tone="violet">{s.attendees.badge}</Badge>} />
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader icon={<Upload className="size-5 text-red-500" />} title={s.materials.title} subtitle={s.materials.subtitle} />
          <LessonList
            items={pendingMaterials}
            badge={(l) => {
              const left = parseDate(l.materials_deadline!).getTime() - now.getTime();
              return (
                <div className="flex items-center gap-2">
                  <span className="hidden text-xs text-gray-500 sm:inline">{s.materials.ofTwo(Number(l.materials.plan) + Number(l.materials.presentation))}</span>
                  <Badge tone={left < 3 * 86400000 ? "red" : "gray"}>{s.materials.due(relative(l.materials_deadline, now))}</Badge>
                </div>
              );
            }}
          />
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader
            icon={<MessageSquareWarning className="size-5 text-sky-600" />}
            title={s.feedback.title}
            subtitle={s.feedback.subtitle(open.length, overdue.length)}
          />
          {missing.isLoading ? (
            <RowsSkeleton rows={4} />
          ) : !missing.data?.length ? (
            <EmptyState title={s.feedback.empty} />
          ) : (
            <div className="overflow-x-auto border-t border-gray-100">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">{s.feedback.cols.attendee}</th>
                    <th className="px-3 py-2.5 font-medium">{s.feedback.cols.lesson}</th>
                    <th className="px-3 py-2.5 font-medium">{s.feedback.cols.due}</th>
                    <th className="px-3 py-2.5 font-medium">{s.feedback.cols.reminders}</th>
                    <th className="px-3 py-2.5 font-medium">{s.feedback.cols.status}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...open, ...overdue].map((m) => (
                    <tr key={m.id}>
                      <td className="px-5 py-2.5 font-medium">{m.author.full_name}</td>
                      <td className="px-3 py-2.5">
                        <Link to={`/lessons/${m.lesson.id}`} className="hover:underline">
                          {m.lesson.topic}
                        </Link>
                        <div className="text-xs text-gray-500">{m.lesson.teacher}</div>
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{fmtDateTime(m.due_at)}</td>
                      <td className="px-3 py-2.5 tabular">{m.reminders_sent}</td>
                      <td className="px-3 py-2.5">{m.overdue ? <Badge tone="red">{s.feedback.overdue}</Badge> : <Badge tone="amber">{m.status === "draft" ? s.feedback.draft : s.feedback.notStarted}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
