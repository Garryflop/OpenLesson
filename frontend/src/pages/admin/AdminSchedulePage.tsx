import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { CheckCircle2, FileSpreadsheet, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, download } from "../../api/client";
import type { AcademicYear, Lesson, Trimester } from "../../api/types";
import { useSystem } from "../../auth";
import LessonFormModal from "../../components/LessonFormModal";
import { Badge, Button, Card, CardListSkeleton, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, RowsSkeleton, Select, StatusBadge, useConfirm, usePageTitle, useToast } from "../../components/ui";
import { useI18n } from "../../i18n";
import { fmtDateShort, fmtDateTime, localIso } from "../../lib/format";
import { pickTrimester, useYears } from "../SchedulePage";

interface ImportResult {
  created: number;
  errors: { row: number; error: string }[];
}

function YearModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useI18n().t.admin.schedule;
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [current, setCurrent] = useState(true);
  const create = useMutation({
    mutationFn: () => api.post("/api/years", { name, start_date: start || null, end_date: end || null, is_current: current }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["years"] });
      onClose();
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={s.yearModal.title}
      persistent
      footer={
        <Button loading={create.isPending} disabled={!/^\d{4}[–-]\d{4}$/.test(name)} onClick={() => create.mutate()}>
          {s.yearModal.create}
        </Button>
      }
    >
      <div className="space-y-4">
        <ErrorBox error={create.error} />
        <Field label={s.year} hint={s.yearModal.hint}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="2027–2028" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={s.yearModal.start}>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label={s.yearModal.end}>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} className="accent-gray-900" />
          {s.yearModal.current}
        </label>
      </div>
    </Modal>
  );
}

function TrimesterCard({ t, active, onSelect }: { t: Trimester; active: boolean; onSelect: () => void }) {
  const s = useI18n().t.admin.schedule;
  return (
    <button
      onClick={onSelect}
      className={clsx(
        "rounded-2xl border bg-white p-4 text-left transition",
        active ? "border-gray-900 ring-1 ring-gray-900" : "border-gray-200 hover:border-gray-300",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">{s.trimester(t.roman)}</span>
        {t.status === "approved" ? <Badge tone="green">{s.approvedBadge}</Badge> : <Badge tone="amber">{s.draftBadge}</Badge>}
      </div>
      <div className="mt-1 text-sm text-gray-500">
        {t.start_date ? `${fmtDateShort(t.start_date)} – ${fmtDateShort(t.end_date)}` : s.noDates}
      </div>
      <div className="mt-3 text-sm">
        {s.lessonsLabel} <b className="tabular">{t.lesson_count}</b>
        {t.approved_at && <span className="text-gray-500"> · {s.approvedAt(fmtDateTime(t.approved_at))}</span>}
      </div>
    </button>
  );
}

export default function AdminSchedulePage() {
  const { t: msg } = useI18n();
  const s = msg.admin.schedule;
  const c = msg.common;
  usePageTitle(s.pageTitle);
  const confirm = useConfirm();
  const qc = useQueryClient();
  const toast = useToast();
  const { now } = useSystem();
  const years = useYears();
  const [yearId, setYearId] = useState<number>();
  const [trimesterId, setTrimesterId] = useState<number>();
  const [yearModal, setYearModal] = useState(false);
  const [lessonModal, setLessonModal] = useState(false);
  const [approveModal, setApproveModal] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const year: AcademicYear | undefined = years.data?.find((y) => y.id === yearId) ?? years.data?.find((y) => y.is_current) ?? years.data?.[0];
  const trimester = year?.trimesters.find((t) => t.id === trimesterId);

  useEffect(() => {
    if (year && !year.trimesters.some((t) => t.id === trimesterId)) setTrimesterId(pickTrimester(year, localIso(now).slice(0, 10)));
  }, [year, trimesterId, now]);

  const lessons = useQuery({
    queryKey: ["lessons", "admin", trimesterId],
    queryFn: () => api.get<Lesson[]>("/api/lessons", { trimester_id: trimesterId }),
    enabled: !!trimesterId,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["lessons"] });
    void qc.invalidateQueries({ queryKey: ["years"] });
  };
  const importFile = useMutation({
    mutationFn: (f: File) => api.upload<ImportResult>(`/api/trimesters/${trimesterId}/import`, f),
    onSuccess: (r) => {
      setImportResult(r);
      refresh();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const approve = useMutation({
    mutationFn: () => api.post<{ approved: number }>(`/api/trimesters/${trimesterId}/approve`),
    onSuccess: (r) => {
      setApproveModal(false);
      toast(s.approvedToast(r.approved));
      refresh();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const clearDrafts = useMutation({
    mutationFn: () => api.delete<{ removed: number }>(`/api/trimesters/${trimesterId}/drafts`),
    onSuccess: (r) => {
      toast(s.clearedToast(r.removed));
      refresh();
    },
  });
  const removeLesson = useMutation({
    mutationFn: (id: number) => api.delete(`/api/lessons/${id}`),
    onSuccess: refresh,
    onError: (e: Error) => toast(e.message, "error"),
  });

  if (years.isLoading) return <CardListSkeleton count={2} />;
  const isDraft = trimester?.status === "draft";

  return (
    <div>
      <PageHeader
        title={s.title}
        subtitle={s.subtitle}
        actions={
          <>
            <Select value={year?.id} onChange={(e) => setYearId(Number(e.target.value))} className="w-36" aria-label={s.year}>
              {years.data?.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </Select>
            <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setYearModal(true)}>
              {s.year}
            </Button>
          </>
        }
      />

      {year && (
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          {year.trimesters.map((t) => (
            <TrimesterCard key={t.id} t={t} active={t.id === trimesterId} onSelect={() => setTrimesterId(t.id)} />
          ))}
        </div>
      )}

      {trimester && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="font-semibold">
                {s.trimester(trimester.roman)} · {trimester.year_name}
              </h2>
              <p className="text-sm text-gray-500">
                {isDraft ? s.draftHint : s.approvedHint}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" icon={<FileSpreadsheet className="size-4" />} onClick={() => void download("/api/schedule/template", undefined, "template.xlsx")}>
                {s.excelTemplate}
              </Button>
              {isDraft && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) importFile.mutate(f);
                      e.target.value = "";
                    }}
                  />
                  <Button variant="secondary" size="sm" loading={importFile.isPending} icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
                    {s.uploadSchedule}
                  </Button>
                </>
              )}
              <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => setLessonModal(true)}>
                {s.addLesson}
              </Button>
              {isDraft && (
                <Button size="sm" icon={<CheckCircle2 className="size-4" />} disabled={!lessons.data?.length} onClick={() => setApproveModal(true)}>
                  {s.approveSchedule}
                </Button>
              )}
            </div>
          </div>
          <ErrorBox error={lessons.error} />
          {lessons.isLoading ? (
            <RowsSkeleton rows={6} />
          ) : !lessons.data?.length ? (
            <EmptyState
              icon={<FileSpreadsheet className="size-6" />}
              title={s.emptyTitle}
              text={s.emptyText}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">{s.cols.date}</th>
                    <th className="px-3 py-2.5 font-medium">{s.cols.time}</th>
                    <th className="px-3 py-2.5 font-medium">{s.cols.teacher}</th>
                    <th className="px-3 py-2.5 font-medium">{s.cols.topic}</th>
                    <th className="px-3 py-2.5 font-medium">{s.cols.place}</th>
                    <th className="px-3 py-2.5 font-medium">{s.cols.status}</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lessons.data.map((l) => (
                    <tr key={l.id} className="hover:bg-gray-50/70">
                      <td className="px-5 py-3 tabular">{fmtDateShort(l.date)}</td>
                      <td className="px-3 py-3 tabular">
                        {l.start_time}–{l.end_time}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium">{l.teacher.full_name}</div>
                        <div className="text-xs text-gray-500">
                          {l.teacher_position} · {l.department_name}
                        </div>
                      </td>
                      <td className="max-w-[280px] px-3 py-3">
                        <Link to={`/lessons/${l.id}`} className="font-medium hover:underline">
                          {l.topic}
                        </Link>
                        <div className="text-xs text-gray-500">{l.discipline}</div>
                      </td>
                      <td className="px-3 py-3 text-gray-600">{l.location?.code ?? l.location_text ?? c.dash}</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={l.status} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        {l.status === "draft" && (
                          <button className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600" title={c.actions.delete} onClick={async () => (await confirm({ title: s.removeTitle, text: s.removeText(l.topic, l.teacher.full_name), confirmLabel: c.actions.delete, danger: true })) && removeLesson.mutate(l.id)} aria-label={s.removeAria(l.topic)}>
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {isDraft && !!lessons.data?.length && (
            <div className="border-t border-gray-100 px-5 py-3 text-right">
              <Button variant="ghost" size="sm" className="text-red-600" loading={clearDrafts.isPending} onClick={async () => (await confirm({ title: s.clearTitle, text: s.clearText(lessons.data?.length ?? 0), confirmLabel: s.clearConfirm, danger: true })) && clearDrafts.mutate()}>
                {s.clearButton}
              </Button>
            </div>
          )}
        </Card>
      )}

      <YearModal open={yearModal} onClose={() => setYearModal(false)} />
      {trimester && <LessonFormModal open={lessonModal} onClose={() => setLessonModal(false)} trimester={trimester} />}
      <Modal
        open={approveModal}
        onClose={() => setApproveModal(false)}
        title={s.approveTitle}
        footer={
          <>
            <Button variant="ghost" onClick={() => setApproveModal(false)}>
              {c.actions.cancel}
            </Button>
            <Button loading={approve.isPending} onClick={() => approve.mutate()}>
              {s.approve}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">{s.approveText(lessons.data?.length ?? 0)}</p>
      </Modal>
      <Modal open={!!importResult} onClose={() => setImportResult(null)} title={s.importTitle}>
        {importResult && (
          <div className="space-y-3 text-sm">
            <p>
              {s.importCreated} <b>{importResult.created}</b>
            </p>
            {importResult.errors.length > 0 && (
              <div className="rounded-xl bg-red-50 p-3 text-red-800">
                <div className="mb-1 font-medium">{s.importErrors(importResult.errors.length)}</div>
                <ul className="space-y-1">
                  {importResult.errors.map((e) => (
                    <li key={e.row}>{s.importRow(e.row, e.error)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
