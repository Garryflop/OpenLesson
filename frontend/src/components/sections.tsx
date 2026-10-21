import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  Bot,
  CheckCheck,
  Download,
  FileDown,
  History,
  ImageIcon,
  MessageCircleReply,
  QrCode,
  RefreshCw,
  Send,
  Sparkles,
  Star,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { api, download } from "../api/client";
import type {
  Analysis,
  Attendance,
  FeedbackSummaryResult,
  LessonDetail,
  LessonFeedback,
  PlanResult,
  User,
} from "../api/types";
import { useI18n } from "../i18n";
import { fmtDate, fmtDateTime, score } from "../lib/format";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Input, Modal, RowsSkeleton, Skeleton, Spinner, Textarea, useConfirm, useToast } from "./ui";

/* ------------------------------------------------------------------ AI */

const ASSESS_TONES = {
  good: "green",
  partial: "amber",
  missing: "red",
} as const;

function AiSource({ a }: { a: Analysis<object> }) {
  const t = useI18n().t.lesson.ai;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
      <Bot className="size-3.5" />
      {a.provider === "openai" ? `OpenAI API (${a.model})` : a.provider === "local_llm" ? t.localLlm(a.model ?? "") : t.local} · {fmtDateTime(a.created_at)}
      {a.error && <span className="text-amber-600">· {a.error}</span>}
      <span>· {t.disclaimer}</span>
    </div>
  );
}

export function PlanAnalysisCard({ lesson }: { lesson: LessonDetail }) {
  const t = useI18n().t.lesson.ai;
  const qc = useQueryClient();
  const toast = useToast();
  const analysis = lesson.analyses.plan;
  const run = useMutation({
    mutationFn: () => api.post(`/api/lessons/${lesson.id}/ai/plan`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lesson", lesson.id] }),
    onError: (e: Error) => toast(e.message, "error"),
  });
  const canRun = lesson.materials.plan && (lesson.permissions.is_teacher || lesson.permissions.manage);
  const r = analysis?.result as PlanResult | undefined;
  return (
    <Card id="ai-plan">
      <CardHeader
        icon={<Sparkles className="size-5 text-violet-500" />}
        title={t.planTitle}
        subtitle={t.planSubtitle}
        action={
          canRun && (
            <Button size="sm" variant="secondary" loading={run.isPending} icon={<RefreshCw className="size-3.5" />} onClick={() => run.mutate()}>
              {analysis ? t.refresh : t.analyze}
            </Button>
          )
        }
      />
      <div className="px-5 pb-5">
        {!r ? (
          <p className="text-sm text-gray-500">
            {lesson.materials.plan ? t.planPending : t.planMissing}
          </p>
        ) : (
          <>
            <div className="flex items-start gap-4">
              <div className="relative flex size-16 shrink-0 items-center justify-center">
                <svg viewBox="0 0 36 36" className="size-16 -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#eef0f3" strokeWidth="3.5" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke={r.score >= 75 ? "#059669" : r.score >= 45 ? "#d97706" : "#dc2626"}
                    strokeWidth="3.5"
                    strokeDasharray={`${(r.score / 100) * 97.4} 97.4`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute text-sm font-semibold tabular">{r.score}</span>
              </div>
              <p className="text-sm leading-relaxed text-gray-700">{r.summary}</p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {r.sections.map((s) => (
                <div key={s.area} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{t.areas[s.area] ?? s.area}</span>
                    <Badge tone={ASSESS_TONES[s.assessment]}>{t.assess[s.assessment]}</Badge>
                  </div>
                  <p className="mt-1.5 text-[13px] text-gray-600">{s.comment}</p>
                  {s.recommendations.length > 0 && (
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[13px] text-gray-700">
                      {s.recommendations.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            {r.priorities.length > 0 && (
              <div className="mt-4 rounded-xl bg-violet-50 p-3">
                <div className="text-sm font-medium text-violet-900">{t.priorities}</div>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-violet-900/90">
                  {r.priorities.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ol>
              </div>
            )}
            <AiSource a={analysis!} />
          </>
        )}
      </div>
    </Card>
  );
}

export function FeedbackSummaryCard({ analysis }: { analysis: Analysis<FeedbackSummaryResult> }) {
  const t = useI18n().t.lesson.feedbackSummary;
  const r = analysis.result;
  const tone = { positive: "green", mixed: "amber", negative: "red" } as const;
  const label = t.sentiment;
  return (
    <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-violet-900">
          <Sparkles className="size-4" /> {t.title}
        </div>
        <Badge tone={tone[r.sentiment]}>{label[r.sentiment]}</Badge>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-gray-700">{r.summary}</p>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          [t.strengths, r.strengths],
          [t.improvements, r.improvements],
          [t.recommendations, r.recommendations],
        ].map(([title, items]) => (
          <div key={title as string}>
            <div className="text-[13px] font-medium text-gray-900">{title as string}</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px] text-gray-700">
              {(items as string[]).map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <AiSource a={analysis} />
    </div>
  );
}

/* ------------------------------------------------------------------ poster */

export function PosterCard({ lesson }: { lesson: LessonDetail }) {
  const { t: tt } = useI18n();
  const t = tt.lesson.poster;
  const qc = useQueryClient();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(lesson.invitation_text ?? "");
  const refresh = () => qc.invalidateQueries({ queryKey: ["lesson", lesson.id] });
  const generate = useMutation({
    mutationFn: (regen: boolean) => api.post(`/api/lessons/${lesson.id}/poster`, {}, { regenerate_text: regen }),
    onSuccess: () => {
      toast(t.generated);
      void refresh();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const send = useMutation({
    mutationFn: () => api.post<{ sent_to: number }>(`/api/lessons/${lesson.id}/poster/send`),
    onSuccess: (r) => {
      toast(t.sent(r.sent_to));
      void refresh();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const save = useMutation({
    mutationFn: () => api.put(`/api/lessons/${lesson.id}/invitation`, { invitation_text: text }),
    onSuccess: () => {
      setEdit(false);
      toast(t.textSaved);
      void refresh();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const manage = lesson.permissions.manage;
  if (!lesson.poster_png && !manage) return null;
  return (
    <Card>
      <CardHeader
        icon={<ImageIcon className="size-5" />}
        title={t.title}
        subtitle={lesson.poster_sent_at ? t.sentAt(fmtDateTime(lesson.poster_sent_at)) : t.auto}
      />
      <div className="space-y-3 px-5 pb-5">
        {lesson.poster_png ? (
          <a href={lesson.poster_png} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-gray-200">
            <img src={lesson.poster_png} alt={t.alt} className="w-full" loading="lazy" />
          </a>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">{t.none}</div>
        )}
        {lesson.poster_png && (
          <div className="flex gap-2">
            <a href={lesson.poster_png} download className="flex-1">
              <Button variant="secondary" size="sm" className="w-full" icon={<Download className="size-3.5" />}>
                PNG
              </Button>
            </a>
            {lesson.poster_pdf && (
              <a href={lesson.poster_pdf} download className="flex-1">
                <Button variant="secondary" size="sm" className="w-full" icon={<FileDown className="size-3.5" />}>
                  PDF
                </Button>
              </a>
            )}
          </div>
        )}
        {manage && !["annulled", "draft"].includes(lesson.status) && (
          <div className="space-y-2 border-t border-gray-100 pt-3">
            <div className="text-[13px] font-medium text-gray-700">{t.textLabel}</div>
            {edit ? (
              <>
                <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={400} />
                <div className="flex gap-2">
                  <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
                    {tt.common.actions.save}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>
                    {tt.common.actions.cancel}
                  </Button>
                </div>
              </>
            ) : (
              <p className="cursor-pointer rounded-xl bg-gray-50 p-3 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setEdit(true)} title={t.editHint}>
                {lesson.invitation_text ?? t.textPlaceholder}
              </p>
            )}
            <p className="text-xs text-gray-500">{t.aiNote}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" loading={generate.isPending} icon={<Sparkles className="size-3.5" />} onClick={() => generate.mutate(true)}>
                {t.generate}
              </Button>
              {lesson.status === "confirmed" && (
                <Button size="sm" loading={send.isPending} icon={<Send className="size-3.5" />} onClick={() => send.mutate()}>
                  {lesson.poster_sent_at ? t.resend : t.send}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ QR */

export function QrCard({ lesson }: { lesson: LessonDetail }) {
  const { t: tt } = useI18n();
  const t = tt.lesson.qr;
  if (!lesson.qr_token || !["confirmed", "completed", "feedback"].includes(lesson.status)) return null;
  const url = `${window.location.origin}/checkin/${lesson.qr_token}`;
  return (
    <Card>
      <CardHeader icon={<QrCode className="size-5" />} title={t.title} subtitle={t.subtitle} />
      <div className="px-5 pb-5">
        <img src={`/api/lessons/${lesson.id}/qr.svg`} alt={t.alt} className="mx-auto w-44 rounded-xl border border-gray-100 p-2" />
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => void navigator.clipboard?.writeText(url)}>
            {t.copyLink}
          </Button>
          <a href={`/api/lessons/${lesson.id}/qr.svg`} target="_blank" rel="noreferrer" className="flex-1">
            <Button size="sm" variant="secondary" className="w-full">
              {tt.common.actions.open}
            </Button>
          </a>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ attendance */

function UserPicker({ open, onClose, onPick, exclude }: { open: boolean; onClose: () => void; onPick: (ids: number[]) => void; exclude: number[] }) {
  const { t: tt } = useI18n();
  const t = tt.lesson.attendance;
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const users = useQuery({
    queryKey: ["users", "picker", q],
    queryFn: () => api.get<{ items: User[] }>("/api/users", { q, active: true, limit: 50 }),
    enabled: open,
  });
  const list = (users.data?.items ?? []).filter((u) => !exclude.includes(u.id) && u.is_faculty);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.pickerTitle}
      persistent
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tt.common.actions.cancel}
          </Button>
          <Button
            disabled={!picked.length}
            onClick={() => {
              onPick(picked);
              setPicked([]);
            }}
          >
            {tt.common.actions.add} ({picked.length})
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-gray-500">{t.pickerHint}</p>
      <Input autoFocus placeholder={t.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-3 max-h-[50vh] divide-y divide-gray-100 overflow-y-auto">
        {users.isLoading && <Spinner />}
        {list.map((u) => (
          <label key={u.id} className="flex cursor-pointer items-center gap-3 py-2.5">
            <input
              type="checkbox"
              className="size-4 accent-gray-900"
              checked={picked.includes(u.id)}
              onChange={(e) => setPicked((p) => (e.target.checked ? [...p, u.id] : p.filter((x) => x !== u.id)))}
            />
            <div className="min-w-0">
              <div className="text-sm font-medium">{u.full_name}</div>
              <div className="text-xs text-gray-500">
                {u.position} · {u.department_name ?? "—"}
              </div>
            </div>
          </label>
        ))}
      </div>
    </Modal>
  );
}

export function AttendanceSection({ lesson }: { lesson: LessonDetail }) {
  const t = useI18n().t.lesson.attendance;
  const ask = useConfirm();
  const qc = useQueryClient();
  const toast = useToast();
  const [picker, setPicker] = useState(false);
  const q = useQuery({
    queryKey: ["attendance", lesson.id],
    queryFn: () =>
      api.get<{ items: Attendance[]; confirmed_at: string | null; can_register: boolean; can_confirm: boolean; qr_enabled: boolean }>(`/api/lessons/${lesson.id}/attendance`),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["attendance", lesson.id] });
    void qc.invalidateQueries({ queryKey: ["lesson", lesson.id] });
  };
  const add = useMutation({
    mutationFn: (ids: number[]) => api.post<{ added: Attendance[]; skipped: { reason: string }[] }>(`/api/lessons/${lesson.id}/attendance`, { user_ids: ids }),
    onSuccess: (r) => {
      setPicker(false);
      toast(`${t.added(r.added.length)}${r.skipped.length ? t.skipped(r.skipped.map((s) => s.reason).join("; ")) : ""}`);
      refresh();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const confirm = useMutation({
    mutationFn: () => api.post(`/api/lessons/${lesson.id}/attendance/confirm`, {}),
    onSuccess: () => {
      toast(t.confirmed);
      refresh();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const reject = useMutation({
    mutationFn: (id: number) => api.post(`/api/attendance/${id}/reject`),
    onSuccess: refresh,
    onError: (e: Error) => toast(e.message, "error"),
  });
  const manage = lesson.permissions.manage;
  const items = q.data?.items ?? [];
  const pending = items.filter((a) => a.status === "pending").length;
  // the method column only matters when the optional QR check-in is (or was) in use
  const showSource = !!q.data?.qr_enabled || items.some((a) => a.source === "qr");
  return (
    <Card id="attendance">
      <CardHeader
        icon={<Users className="size-5" />}
        title={t.title}
        subtitle={
          q.data?.confirmed_at
            ? t.confirmedAt(fmtDateTime(q.data.confirmed_at))
            : t.subtitle
        }
        action={
          manage &&
          q.data?.can_register && (
            <Button size="sm" variant="secondary" icon={<UserPlus className="size-3.5" />} onClick={() => setPicker(true)}>
              {t.register}
            </Button>
          )
        }
      />
      <div className="px-5 pb-5">
        {q.isLoading ? (
          <RowsSkeleton rows={3} />
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500">
            {manage && q.data?.can_register
              ? t.emptyManage
              : t.empty}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="py-2 pr-3 font-medium">{t.colName}</th>
                  <th className="py-2 pr-3 font-medium">{t.colPosition}</th>
                  {showSource && <th className="py-2 pr-3 font-medium">{t.colSource}</th>}
                  <th className="py-2 pr-3 font-medium">{t.colStatus}</th>
                  {manage && <th />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((a) => (
                  <tr key={a.id} className={clsx(a.status === "rejected" && "opacity-50")}>
                    <td className="py-2.5 pr-3 font-medium">{a.full_name}</td>
                    <td className="py-2.5 pr-3 text-gray-600">
                      {a.position ?? "—"}
                      <div className="text-xs text-gray-400">{a.department_name}</div>
                    </td>
                    {showSource && <td className="py-2.5 pr-3">{a.source === "qr" ? <Badge tone="sky">{t.sourceQr}</Badge> : <Badge>{t.sourceSheet}</Badge>}</td>}
                    <td className="py-2.5 pr-3">
                      {a.status === "confirmed" ? (
                        <Badge tone="green">{t.statusConfirmed}</Badge>
                      ) : a.status === "pending" ? (
                        <Badge tone="amber">{t.statusPending}</Badge>
                      ) : (
                        <Badge tone="red">{t.statusRejected}</Badge>
                      )}
                    </td>
                    {manage && (
                      <td className="py-2.5 text-right">
                        {a.status !== "rejected" && (
                          <button className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600" title={t.reject} onClick={async () => (await ask({ title: t.rejectTitle, text: t.rejectText(a.full_name), confirmLabel: t.reject, danger: true })) && reject.mutate(a.id)} aria-label={t.rejectAria(a.full_name)}>
                            <X className="size-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {manage && q.data?.can_confirm && (lesson.status === "completed" || pending > 0) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-50 p-3">
            <span className="text-sm text-gray-600">
              {lesson.status === "completed" ? t.confirmHint : t.pendingCount(pending)}
            </span>
            <Button size="sm" loading={confirm.isPending} icon={<CheckCheck className="size-4" />} onClick={() => confirm.mutate()}>
              {t.confirmList}
            </Button>
          </div>
        )}
      </div>
      <UserPicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(ids) => add.mutate(ids)}
        exclude={[lesson.teacher.id, ...items.map((a) => a.user_id)]}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ feedback */

export function Stars({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1 font-medium tabular">
      <Star className="size-4 fill-amber-400 text-amber-400" /> {score(value)}
    </span>
  );
}

function ReplyForm({ feedbackId, lessonId }: { feedbackId: number; lessonId: number }) {
  const { t: tt } = useI18n();
  const t = tt.lesson.feedback;
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const send = useMutation({
    mutationFn: () => api.post(`/api/feedback/${feedbackId}/replies`, { text }),
    onSuccess: () => {
      setText("");
      setOpen(false);
      toast(t.replySent);
      void qc.invalidateQueries({ queryKey: ["lesson-feedback", lessonId] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <MessageCircleReply className="size-4" /> {t.reply}
      </button>
    );
  return (
    <div className="mt-3 space-y-2">
      <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={t.replyPlaceholder} autoFocus />
      <div className="flex gap-2">
        <Button size="sm" disabled={!text.trim()} loading={send.isPending} onClick={() => send.mutate()}>
          {tt.common.actions.send}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {tt.common.actions.cancel}
        </Button>
      </div>
    </div>
  );
}

export function FeedbackSection({ lesson }: { lesson: LessonDetail }) {
  const t = useI18n().t.lesson.feedback;
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["lesson-feedback", lesson.id], queryFn: () => api.get<LessonFeedback>(`/api/lessons/${lesson.id}/feedback`) });
  const ai = useMutation({
    mutationFn: () => api.post(`/api/lessons/${lesson.id}/ai/feedback`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lesson-feedback", lesson.id] }),
    onError: (e: Error) => toast(e.message, "error"),
  });
  const pdf = useMutation({
    mutationFn: () => download(`/api/lessons/${lesson.id}/feedback/pdf`, undefined, "feedback.pdf"),
    onError: (e: Error) => toast(e.message, "error"),
  });
  if (q.isLoading)
    return (
      <Card className="space-y-3 p-5">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  if (q.error) return <ErrorBox error={q.error} />;
  const data = q.data!;
  const titles = Object.fromEntries(data.stats.criteria.map((c) => [String(c.id), c.title]));
  return (
    <Card id="feedback">
      <CardHeader
        icon={<Star className="size-5" />}
        title={t.title}
        subtitle={t.subtitle(data.stats.submitted, data.stats.total, score(data.stats.overall))}
        action={
          <div className="flex gap-2">
            {data.stats.submitted > 0 && (lesson.permissions.is_teacher || lesson.permissions.manage) && (
              <Button size="sm" variant="secondary" loading={ai.isPending} icon={<Sparkles className="size-3.5" />} onClick={() => ai.mutate()}>
                {t.aiAnalysis}
              </Button>
            )}
            <Button size="sm" variant="secondary" loading={pdf.isPending} icon={<FileDown className="size-3.5" />} onClick={() => pdf.mutate()}>
              PDF
            </Button>
          </div>
        }
      />
      <div className="space-y-5 px-5 pb-5">
        {data.stats.submitted > 0 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.stats.criteria.map((c) => (
              <div key={c.id} className="rounded-xl bg-gray-50 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-gray-700">{c.title}</span>
                  <span className="font-semibold tabular">{score(c.average)}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-200">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${((c.average ?? 0) / 5) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
        {data.ai_summary && <FeedbackSummaryCard analysis={data.ai_summary} />}
        {data.items.length === 0 ? (
          <EmptyState title={t.emptyTitle} text={t.emptyText} />
        ) : (
          <div className="space-y-3">
            {data.items.map((f) => (
              <div key={f.id} className="rounded-2xl border border-gray-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{f.author?.full_name}</div>
                    <div className="text-xs text-gray-500">
                      {f.author?.position} · {t.submittedAt(fmtDateTime(f.submitted_at))}
                    </div>
                  </div>
                  <Stars value={f.average} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Object.entries(f.scores).map(([cid, v]) => (
                    <span key={cid} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                      {titles[cid] ?? cid}: <b className="tabular">{v}</b>
                    </span>
                  ))}
                </div>
                <dl className="mt-3 space-y-2 text-sm">
                  {f.strengths && (
                    <div>
                      <dt className="text-[13px] text-gray-500">{t.strengths}</dt>
                      <dd className="text-gray-800">{f.strengths}</dd>
                    </div>
                  )}
                  {f.improvements && (
                    <div>
                      <dt className="text-[13px] text-gray-500">{t.improvements}</dt>
                      <dd className="text-gray-800">{f.improvements}</dd>
                    </div>
                  )}
                  {f.comment && (
                    <div>
                      <dt className="text-[13px] text-gray-500">{t.comment}</dt>
                      <dd className="text-gray-800">{f.comment}</dd>
                    </div>
                  )}
                </dl>
                {f.replies.map((r) => (
                  <div key={r.id} className="mt-3 rounded-xl border-l-4 border-brand-500 bg-brand-50/60 px-3 py-2 text-sm">
                    <div className="text-xs text-gray-500">
                      {t.teacherReply} · {fmtDateTime(r.created_at)}
                    </div>
                    <div className="mt-0.5 text-gray-800">{r.text}</div>
                  </div>
                ))}
                {data.can_reply && <ReplyForm feedbackId={f.id} lessonId={lesson.id} />}
              </div>
            ))}
          </div>
        )}
        {data.stats.pending.length > 0 && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-medium">{t.notSubmitted} ({data.stats.pending.length})</div>
            <div className="mt-1 text-[13px]">
              {data.stats.pending.map((p) => `${p.full_name}${p.status === "expired" ? ` (${t.expired})` : ""}`).join(", ")}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ history */

export function HistorySection({ lesson }: { lesson: LessonDetail }) {
  const t = useI18n().t.lesson.history;
  if (!lesson.events.length) return null;
  return (
    <Card id="history">
      <CardHeader icon={<History className="size-5" />} title={t.title} />
      <ol className="relative mx-5 mb-5 border-l border-gray-200">
        {[...lesson.events].reverse().map((e) => (
          <li key={e.id} className="mb-4 ml-4 last:mb-0">
            <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-white bg-gray-400" />
            <div className="text-sm text-gray-800">{e.message}</div>
            <div className="text-xs text-gray-500">
              {fmtDateTime(e.created_at, true)}
              {e.actor ? ` · ${e.actor.short_name}` : ` · ${t.auto}`}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function lessonDateLabel(l: LessonDetail) {
  return `${fmtDate(l.date, true)}, ${l.start_time}–${l.end_time}`;
}
