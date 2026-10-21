import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { LessonDetail, Location, Trimester, User } from "../api/types";
import { useI18n } from "../i18n";
import { kindLabels, statusMeta } from "../lib/format";
import { Button, ErrorBox, Field, Input, Modal, Select, Spinner } from "./ui";

const CampusMap = lazy(() => import("../map/CampusMap"));

export default function LessonFormModal({ open, onClose, trimester }: { open: boolean; onClose: () => void; trimester: Trimester }) {
  const { t: tt } = useI18n();
  const t = tt.lesson;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [teacherQ, setTeacherQ] = useState("");
  const [teacherId, setTeacherId] = useState<number | "">("");
  const [topic, setTopic] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("10:50");
  const [mapKey, setMapKey] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);

  const teachers = useQuery({
    queryKey: ["users", "teachers", teacherQ],
    queryFn: () => api.get<{ items: User[] }>("/api/users", { q: teacherQ, role: "teacher", active: true, limit: 30 }),
    enabled: open,
  });
  // searching by name usually narrows the list to one person — pick them instead of making the user open the list
  useEffect(() => {
    const items = teachers.data?.items ?? [];
    if (teacherQ.trim() && items.length === 1 && teacherId !== items[0].id) setTeacherId(items[0].id);
  }, [teachers.data, teacherQ, teacherId]);
  const locations = useQuery({ queryKey: ["locations"], queryFn: () => api.get<Location[]>("/api/locations"), enabled: open });
  const byKey = useMemo(() => new Map((locations.data ?? []).filter((l) => l.map_key).map((l) => [l.map_key!, l])), [locations.data]);
  const location = mapKey ? byKey.get(mapKey) : undefined;

  const create = useMutation({
    mutationFn: () =>
      api.post<LessonDetail>("/api/lessons", {
        trimester_id: trimester.id,
        teacher_id: teacherId,
        topic,
        discipline,
        date,
        start_time: start,
        end_time: end,
        location_id: location?.id ?? null,
      }),
    onSuccess: (l) => {
      void qc.invalidateQueries({ queryKey: ["lessons"] });
      void qc.invalidateQueries({ queryKey: ["years"] });
      onClose();
      navigate(`/lessons/${l.id}`);
    },
  });

  const valid = teacherId && topic.trim().length >= 3 && discipline.trim().length >= 2 && date && start < end;

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      persistent
      title={t.form.title(trimester.roman, trimester.year_name)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tt.common.actions.cancel}
          </Button>
          <Button disabled={!valid} loading={create.isPending} onClick={() => create.mutate()}>
            {t.form.submit}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorBox error={create.error} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t.form.teacherSearch}>
            <Input placeholder={t.form.teacherSearchPlaceholder} value={teacherQ} onChange={(e) => setTeacherQ(e.target.value)} />
          </Field>
          <Field label={t.fields.teacher}>
            <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">{t.form.selectPlaceholder}</option>
              {teachers.data?.items.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} · {u.department_name ?? "—"}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t.fields.topic}>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
        </Field>
        <Field label={t.fields.discipline}>
          <Input value={discipline} onChange={(e) => setDiscipline(e.target.value)} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t.fields.date} className="col-span-3 sm:col-span-1">
            <Input type="date" value={date} min={trimester.start_date ?? undefined} max={trimester.end_date ?? undefined} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t.fields.start}>
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label={t.fields.end}>
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">{t.form.venue}</span>
            <button className="text-sm text-brand-600 hover:underline" onClick={() => setShowMap((v) => !v)}>
              {showMap ? t.form.hideMap : t.form.showMap}
            </button>
          </div>
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm">
            <MapPin className="size-4 text-gray-400" />
            {location ? (
              <span>
                <b>{location.title ?? location.code}</b> · {t.floor(location.floor)} · {kindLabels()[location.kind] ?? location.kind}
              </span>
            ) : (
              <span className="text-gray-500">{t.form.pickRoom}</span>
            )}
          </div>
          {showMap && (
            <Suspense fallback={<Spinner />}>
              <CampusMap
                selected={mapKey}
                height={360}
                onRoomClick={setMapKey}
                describe={(k) => {
                  const l = byKey.get(k);
                  return l ? `${l.title ?? l.code} · ${kindLabels()[l.kind] ?? l.kind}` : k;
                }}
              />
            </Suspense>
          )}
        </div>
        {trimester.status === "approved" && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t.form.approvedNote(statusMeta().scheduled.label)}
          </p>
        )}
      </div>
    </Modal>
  );
}
