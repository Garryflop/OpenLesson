import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { AlertCircle, ArrowLeft, Check, CheckCircle2, CloudUpload, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { FeedbackForm } from "../api/types";
import { useSystem } from "../auth";
import { Badge, Button, Card, ErrorBox, Field, InfoRow, Skeleton, Textarea, useConfirm, usePageTitle, useToast } from "../components/ui";
import { LOCALES, useI18n } from "../i18n";
import { fmtDate, fmtDateTime, relative } from "../lib/format";

type Draft = { scores: Record<string, number>; strengths: string; improvements: string; comment: string };
const snapshot = (d: Draft) => JSON.stringify(d);

function FormSkeleton() {
  const fb = useI18n().t.feedback;
  return (
    <div className="mx-auto max-w-3xl space-y-5" role="status" aria-label={fb.loadingForm}>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-8 w-80" />
      <Card className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-48" />
          </div>
        ))}
      </Card>
      <Card className="space-y-4 p-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-10 w-56" />
          </div>
        ))}
      </Card>
    </div>
  );
}

export default function FeedbackFormPage() {
  const { t, lang } = useI18n();
  const fb = t.feedback;
  // 1–5 scale; labels come from the dictionary (index 0 = score 1)
  const scale = fb.scale.map((label, i) => ({ v: i + 1, label }));
  usePageTitle(fb.formTitle);
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { now } = useSystem();
  const q = useQuery({ queryKey: ["feedback", Number(id)], queryFn: () => api.get<FeedbackForm>(`/api/feedback/${id}`) });
  const [draft, setDraft] = useState<Draft>({ scores: {}, strengths: "", improvements: "", comment: "" });
  const [saved, setSaved] = useState<string>("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!q.data) return;
    const d = { scores: q.data.scores ?? {}, strengths: q.data.strengths ?? "", improvements: q.data.improvements ?? "", comment: q.data.comment ?? "" };
    setDraft(d);
    setSaved(snapshot(d));
  }, [q.data]);

  const editable = !!q.data?.editable;
  const dirty = editable && saved !== "" && snapshot(draft) !== saved;

  const save = useMutation({
    mutationFn: (d: Draft) => api.put(`/api/feedback/${id}`, d),
    onSuccess: (_, d) => {
      setSaved(snapshot(d));
      setSavedAt(new Date());
      void qc.invalidateQueries({ queryKey: ["feedback", "my"] });
    },
    onError: (e: Error) => toast(fb.draftNotSaved(e.message), "error"),
  });
  const submit = useMutation({
    mutationFn: (d: Draft) => api.post(`/api/feedback/${id}/submit`, d),
    onSuccess: (_, d) => {
      setSaved(snapshot(d));
      toast(fb.submittedToast);
      void qc.invalidateQueries({ queryKey: ["feedback"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  // autosave the draft 2.5 s after the last change
  useEffect(() => {
    if (!dirty || submit.isPending) return;
    const t = setTimeout(() => save.mutate(draft), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty]);

  // warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const setScore = useCallback((cid: string, v: number) => setDraft((d) => ({ ...d, scores: { ...d.scores, [cid]: v } })), []);

  if (q.isLoading) return <FormSkeleton />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const f = q.data!;
  const l = f.lesson;
  const missing = f.criteria.filter((c) => !draft.scores[String(c.id)]);
  const textMissing = !draft.strengths.trim() && !draft.improvements.trim();
  const filled = f.criteria.length - missing.length;

  const onSubmit = async () => {
    if (missing.length || textMissing) {
      setShowErrors(true);
      const first = missing[0] ? rowRefs.current[String(missing[0].id)] : document.getElementById("fb-strengths");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      toast(missing.length ? fb.rateAll(missing.length) : fb.textRequired, "error");
      return;
    }
    const ok = await confirm({
      title: fb.confirmTitle,
      text: fb.confirmText,
      confirmLabel: fb.confirmLabel,
    });
    if (ok) submit.mutate(draft);
  };

  const saveState = save.isPending ? (
    <span className="inline-flex items-center gap-1.5">
      <CloudUpload className="size-4 animate-pulse" aria-hidden /> {fb.saving}
    </span>
  ) : dirty ? (
    <span>{fb.unsaved}</span>
  ) : savedAt ? (
    <span className="inline-flex items-center gap-1.5 text-emerald-700">
      <Check className="size-4" aria-hidden />{" "}
      {fb.savedAt(savedAt.toLocaleTimeString(LOCALES[lang], { hour: "2-digit", minute: "2-digit" }))}
    </span>
  ) : (
    <span>{fb.autosave}</span>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/feedback" className="inline-flex items-center gap-1.5 rounded-lg text-sm text-gray-500 transition hover:text-gray-900">
        <ArrowLeft className="size-4" aria-hidden /> {t.common.nav.myFeedback}
      </Link>
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em]">{fb.formTitle}</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-gray-500">
          {editable ? (
            <>{fb.introEditable(fmtDateTime(f.due_at), relative(f.due_at, now))}</>
          ) : f.status === "submitted" ? (
            <>{fb.introSubmitted(fmtDateTime(f.submitted_at))}</>
          ) : (
            <>{fb.introExpired(fmtDateTime(f.due_at))}</>
          )}
        </p>
      </div>

      <Card className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <InfoRow label={fb.teacher}>
          {l.teacher.full_name}
          <div className="text-sm text-gray-500">{l.teacher_position}</div>
        </InfoRow>
        <InfoRow label={fb.topic}>
          <Link to={`/lessons/${l.id}`} className="underline decoration-gray-300 underline-offset-4 hover:decoration-gray-500">
            {l.topic}
          </Link>
        </InfoRow>
        <InfoRow label={fb.discipline}>{l.discipline}</InfoRow>
        <InfoRow label={fb.datePlace}>
          {fmtDate(l.date, true)}, {l.start_time}–{l.end_time} · {l.place}
        </InfoRow>
      </Card>

      <Card className="p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-semibold">{fb.criteria}</h2>
          <Badge tone={filled === f.criteria.length ? "green" : "gray"}>{fb.filledOf(filled, f.criteria.length)}</Badge>
        </div>
        <p className="mb-2 text-xs text-gray-500">{fb.scaleLegend}</p>
        <div className="divide-y divide-gray-100">
          {f.criteria.map((c) => {
            const cid = String(c.id);
            const value = draft.scores[cid];
            const invalid = showErrors && !value;
            return (
              <div
                key={c.id}
                ref={(el) => {
                  rowRefs.current[cid] = el;
                }}
                className={clsx("-mx-2 flex flex-col gap-2 rounded-xl px-2 py-3.5 transition-colors md:flex-row md:items-center md:justify-between", invalid && "bg-red-50/70")}
              >
                <div className="min-w-0">
                  <div id={`crit-${cid}`} className="text-[15px] font-medium">
                    {c.title}
                  </div>
                  {c.description && <div className="text-[13px] text-gray-500">{c.description}</div>}
                  {invalid && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-red-600">
                      <AlertCircle className="size-3.5" aria-hidden /> {fb.rateThis}
                    </div>
                  )}
                </div>
                <div className="w-full md:w-auto md:shrink-0">
                  <div className="grid grid-cols-5 gap-2 md:flex md:gap-1.5" role="radiogroup" aria-labelledby={`crit-${cid}`} aria-invalid={invalid || undefined}>
                    {scale.map((s) => (
                      <button
                        key={s.v}
                        type="button"
                        role="radio"
                        aria-checked={value === s.v}
                        aria-label={`${s.v} — ${s.label}`}
                        disabled={!editable}
                        title={s.label}
                        onClick={() => setScore(cid, s.v)}
                        className={clsx(
                          "h-12 rounded-xl border text-base font-semibold tabular transition-[background-color,border-color,color,transform] duration-150 md:size-10 md:text-sm",
                          value === s.v
                            ? "border-brand-900 bg-brand-900 text-white shadow-card"
                            : "border-gray-200 bg-white text-gray-700 enabled:hover:border-brand-500 enabled:hover:text-brand-700 enabled:active:scale-95",
                          invalid && "border-red-200",
                          !editable && "cursor-default",
                        )}
                      >
                        {s.v}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 h-4 text-right text-xs text-gray-500">{value ? scale[value - 1].label : ""}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <Field label={fb.strengths} error={showErrors && textMissing && fb.textRequired}>
          <Textarea
            id="fb-strengths"
            rows={3}
            value={draft.strengths}
            onChange={(e) => setDraft((d) => ({ ...d, strengths: e.target.value }))}
            disabled={!editable}
            placeholder={fb.strengthsPlaceholder}
            aria-invalid={(showErrors && textMissing) || undefined}
          />
        </Field>
        <Field label={fb.improvements}>
          <Textarea
            rows={3}
            value={draft.improvements}
            onChange={(e) => setDraft((d) => ({ ...d, improvements: e.target.value }))}
            disabled={!editable}
            placeholder={fb.improvementsPlaceholder}
            aria-invalid={(showErrors && textMissing) || undefined}
          />
        </Field>
        <Field label={fb.comment} hint={fb.optional}>
          <Textarea rows={2} value={draft.comment} onChange={(e) => setDraft((d) => ({ ...d, comment: e.target.value }))} disabled={!editable} />
        </Field>
      </Card>

      {f.replies.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">{fb.teacherReply}</h2>
          <div className="space-y-2">
            {f.replies.map((r) => (
              <div key={r.id} className="rounded-xl border-l-4 border-brand-500 bg-brand-50/60 px-3 py-2 text-sm">
                <div className="text-xs text-gray-500">
                  {r.author.full_name} · {fmtDateTime(r.created_at)}
                </div>
                <div className="mt-0.5">{r.text}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {editable ? (
        <div className="sticky bottom-[calc(var(--tabbar-h)+0.75rem)] z-10 flex items-center justify-between gap-3 rounded-2xl border border-gray-200/80 bg-white/90 p-2.5 pl-4 shadow-overlay backdrop-blur-md sm:p-3 sm:pl-4">
          <div className="min-w-0 truncate text-xs text-gray-500 sm:text-sm" aria-live="polite">
            {saveState}
          </div>
          <Button className="shrink-0" loading={submit.isPending} icon={<Send className="size-4" />} onClick={() => void onSubmit()}>
            {fb.submit}
          </Button>
        </div>
      ) : (
        f.status === "submitted" && (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="size-5" aria-hidden /> {fb.submittedBanner(fmtDateTime(f.submitted_at))}
          </div>
        )
      )}
    </div>
  );
}
