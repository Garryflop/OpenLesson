import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { AlertCircle, CheckCircle2, Clock, Download, FileText, MapPin, Presentation, Trash2, Upload, Users, Star, MessageSquareText } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Lesson, LessonDetail, LessonStatus, Material } from "../api/types";
import { useSystem } from "../auth";
import { useI18n } from "../i18n";
import { fileSize, fmtDate, fmtDateTime, parseDate, relative, score, weekday } from "../lib/format";
import { Card, StatusBadge, useConfirm, useToast } from "./ui";

export function LessonCard({ lesson, showStatus = true }: { lesson: Lesson; showStatus?: boolean }) {
  const t = useI18n().t.lesson;
  const otherYear = lesson.date.slice(0, 4) !== String(new Date().getFullYear());
  return (
    <Link
      to={`/lessons/${lesson.id}`}
      className="group block rounded-2xl"
      aria-label={`${lesson.topic}, ${fmtDate(lesson.date, true)}, ${lesson.teacher.full_name}`}
    >
      <Card
        className={clsx(
          "p-5 transition-[border-color,box-shadow,transform] duration-200 group-hover:-translate-y-px group-hover:border-gray-300 group-hover:shadow-lift",
          lesson.status === "annulled" && "bg-gray-50/70",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="text-lg font-medium tracking-[-0.01em] text-gray-900">
            {fmtDate(lesson.date, otherYear)} <span className="text-gray-300">·</span> {lesson.start_time}–{lesson.end_time}
            <span className="ml-2 text-sm font-normal text-gray-400">{weekday(lesson.date)}</span>
          </div>
          {showStatus && <StatusBadge status={lesson.status} />}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <div>
              <div className="text-[13px] text-gray-500">{t.fields.topic}</div>
              <div
                className={clsx(
                  "mt-0.5 text-[17px] font-medium leading-snug text-gray-900 transition-colors group-hover:text-brand-700",
                  lesson.status === "annulled" && "text-gray-500 line-through decoration-gray-300",
                )}
              >
                {lesson.topic}
              </div>
            </div>
            <div>
              <div className="text-[13px] text-gray-500">{t.fields.discipline}</div>
              <div className="mt-0.5 text-[15px] text-gray-900">{lesson.discipline}</div>
            </div>
          </div>
          <div className="space-y-2 border-t border-gray-100 pt-3 md:border-l md:border-t-0 md:pl-5 md:pt-0">
            <div className="text-[13px] text-gray-500">{t.fields.teacher}</div>
            <div className="text-[15px] font-medium text-gray-900">{lesson.teacher.short_name}</div>
            <div className="text-sm text-gray-500">{lesson.teacher_position}</div>
            <div className="flex items-center gap-1.5 pt-1 text-sm text-gray-700">
              <MapPin className="size-4 shrink-0 text-gray-400" aria-hidden />
              <span className="truncate">{lesson.place}</span>
            </div>
          </div>
        </div>
        {(lesson.feedback_total > 0 || lesson.attendance_count > 0) && (
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-gray-100 pt-3 text-[13px] text-gray-600">
            {lesson.attendance_count > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5 text-gray-400" aria-hidden /> {t.card.attendees(lesson.attendance_count)}
              </span>
            )}
            {lesson.feedback_total > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <MessageSquareText className="size-3.5 text-gray-400" aria-hidden /> {t.card.reviews(lesson.feedback_submitted, lesson.feedback_total)}
              </span>
            )}
            {lesson.avg_score !== null && (
              <span className="inline-flex items-center gap-1.5 font-medium text-gray-900">
                <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden /> {score(lesson.avg_score)}
              </span>
            )}
          </div>
        )}
      </Card>
    </Link>
  );
}

export function DeadlineChip({ deadline, status }: { deadline: string | null; status: LessonStatus }) {
  const t = useI18n().t.lesson;
  const { now } = useSystem();
  if (!deadline || !["scheduled", "materials_ready", "violation"].includes(status)) return null;
  const passed = parseDate(deadline) <= now;
  const soon = !passed && parseDate(deadline).getTime() - now.getTime() < 3 * 86400000;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
        passed ? "bg-red-50 text-red-700" : soon ? "bg-amber-50 text-amber-800" : "bg-gray-100 text-gray-600",
      )}
    >
      <Clock className="size-3.5" aria-hidden />
      <span>
        {t.deadline} {fmtDateTime(deadline)} <span className="font-normal opacity-80">({relative(deadline, now)})</span>
      </span>
    </span>
  );
}

const KIND_META = {
  presentation: { accept: ".ppt,.pptx", exts: [".ppt", ".pptx"], formats: "PPT / PPTX", icon: Presentation },
  plan: { accept: ".doc,.docx,.pdf", exts: [".doc", ".docx", ".pdf"], formats: "DOC / DOCX / PDF", icon: FileText },
} as const;

function MaterialRow({ lesson, kind, material }: { lesson: LessonDetail; kind: "presentation" | "plan"; material?: Material }) {
  const { t: tt } = useI18n();
  const t = tt.lesson.materials;
  const meta = { ...KIND_META[kind], ...t.kinds[kind] };
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const upload = useMutation({
    mutationFn: (file: File) => api.upload<Material>(`/api/lessons/${lesson.id}/materials/${kind}`, file),
    onSuccess: () => {
      toast(kind === "plan" ? t.planUploaded : t.presentationUploaded);
      void qc.invalidateQueries({ queryKey: ["lesson", lesson.id] });
      void qc.invalidateQueries({ queryKey: ["lessons"] });
      if (kind === "plan") setTimeout(() => void qc.invalidateQueries({ queryKey: ["lesson", lesson.id] }), 2500);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/materials/${material!.id}`),
    onSuccess: () => {
      toast(t.removed);
      void qc.invalidateQueries({ queryKey: ["lesson", lesson.id] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const canUpload = lesson.permissions.upload;
  const present = lesson.materials[kind];
  const Icon = meta.icon;

  const accept = (file: File) => {
    const ok = (meta.exts as readonly string[]).some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!ok) return toast(t.wrongFormat(meta.formats), "error");
    upload.mutate(file);
  };
  const dropProps = canUpload
    ? {
        onDragOver: (e: DragEvent) => {
          e.preventDefault();
          setDragging(true);
        },
        onDragLeave: () => setDragging(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) accept(f);
        },
      }
    : {};

  return (
    <div
      {...dropProps}
      className={clsx(
        "-mx-2 flex flex-wrap items-center gap-3 rounded-xl px-2 py-3 transition-colors",
        dragging && "bg-brand-50 outline-2 outline-offset-0 outline-dashed outline-brand-500",
      )}
    >
      {present ? (
        <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-label={t.uploaded} />
      ) : (
        <AlertCircle className="size-5 shrink-0 text-red-500" aria-label={t.notUploaded} />
      )}
      <div className="min-w-0 flex-1 basis-[190px]">
        <div className="flex items-center gap-2 text-[15px] font-medium text-gray-900">
          <Icon className="size-4 shrink-0 text-gray-400" aria-hidden />
          <span className="truncate">{material ? material.original_name : meta.title}</span>
        </div>
        <div className="mt-0.5 text-[13px] text-gray-500">
          {dragging ? (
            <span className="font-medium text-brand-700">{t.dropHere}</span>
          ) : (
            <>
              {present ? meta.ok : meta.missing}
              {material && (
                <>
                  {" · "}
                  {fileSize(material.size)} · {fmtDateTime(material.uploaded_at)}
                  {!material.on_time && <span className="text-red-600"> · {t.late}</span>}
                </>
              )}
              {!present && (
                <>
                  {` · ${meta.formats}`}
                  {canUpload && <span className="hidden md:inline"> · {t.dragHint}</span>}
                </>
              )}
            </>
          )}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {material && (
          <a
            href={material.url}
            className="flex size-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            title={tt.common.actions.download}
            aria-label={t.downloadAria(material.original_name)}
          >
            <Download className="size-4" />
          </a>
        )}
        {material && canUpload && ["scheduled", "materials_ready", "draft"].includes(lesson.status) && (
          <button
            onClick={async () => {
              const ok = await confirm({
                title: t.deleteTitle,
                text: t.deleteText(material.original_name),
                confirmLabel: tt.common.actions.delete,
                danger: true,
              });
              if (ok) remove.mutate();
            }}
            className="flex size-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-red-50 hover:text-red-600"
            title={tt.common.actions.delete}
            aria-label={t.deleteAria(material.original_name)}
          >
            <Trash2 className="size-4" />
          </button>
        )}
        {canUpload && (
          <>
            <input
              ref={input}
              type="file"
              accept={meta.accept}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) accept(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => input.current?.click()}
              disabled={upload.isPending}
              className={clsx(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition active:scale-[0.98] disabled:opacity-50",
                present ? "border border-gray-200 bg-white hover:bg-gray-50" : "bg-brand-900 text-white hover:bg-brand-800",
              )}
            >
              <Upload className="size-3.5" aria-hidden />
              {upload.isPending ? t.uploading : present ? t.replace : t.upload}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function MaterialsPanel({ lesson }: { lesson: LessonDetail }) {
  const t = useI18n().t.lesson.materials;
  const count = Number(lesson.materials.presentation) + Number(lesson.materials.plan);
  const byKind = (k: "presentation" | "plan") => lesson.materials_list.find((m) => m.kind === k);
  return (
    <Card id="materials">
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{t.title}</h2>
        <span
          className={clsx(
            "whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium tabular",
            count === 2 ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700",
          )}
        >
          {t.count(count, 2)}
        </span>
      </div>
      <div className="mx-5 mt-3 h-1 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuemin={0} aria-valuemax={2} aria-valuenow={count} aria-label={t.progressLabel}>
        <div className={clsx("h-full rounded-full transition-[width] duration-500", count === 2 ? "bg-emerald-500" : "bg-orange-400")} style={{ width: `${count * 50}%` }} />
      </div>
      <div className="divide-y divide-gray-100 px-5 pt-1">
        <MaterialRow lesson={lesson} kind="presentation" material={byKind("presentation")} />
        <MaterialRow lesson={lesson} kind="plan" material={byKind("plan")} />
      </div>
      <div className="space-y-2 border-t border-gray-100 px-5 py-4 text-sm text-gray-500">
        <p>{t.note}</p>
        <DeadlineChip deadline={lesson.materials_deadline} status={lesson.status} />
      </div>
    </Card>
  );
}
