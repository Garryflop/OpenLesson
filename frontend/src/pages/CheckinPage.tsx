import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, MapPin, QrCode } from "lucide-react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Attendance, Lesson } from "../api/types";
import { Button, Card, ErrorBox, Spinner, usePageTitle, useToast } from "../components/ui";
import { useI18n } from "../i18n";
import { fmtDate } from "../lib/format";

interface CheckinInfo {
  lesson: Lesson;
  open: boolean;
  message: string;
  is_teacher: boolean;
  attendance: Attendance | null;
}

export default function CheckinPage() {
  const ck = useI18n().t.checkin;
  usePageTitle(ck.title);
  const { token } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["checkin", token], queryFn: () => api.get<CheckinInfo>(`/api/checkin/${token}`) });
  const checkin = useMutation({
    mutationFn: () => api.post(`/api/checkin/${token}`),
    onSuccess: () => {
      toast(ck.checkedIn);
      void qc.invalidateQueries({ queryKey: ["checkin", token] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const { lesson, attendance } = q.data!;
  return (
    <div className="mx-auto max-w-md">
      <Card className="overflow-hidden">
        <div className="bg-brand-900 px-6 py-6 text-white">
          <div className="flex items-center gap-2 text-sm text-white/70">
            <QrCode className="size-4" /> {ck.title}
          </div>
          <h1 className="mt-2 text-xl font-semibold leading-snug">{lesson.topic}</h1>
          <p className="mt-1 text-sm text-white/80">{lesson.teacher.full_name}</p>
        </div>
        <div className="space-y-3 px-6 py-5 text-sm">
          <div className="flex items-center gap-2 text-gray-700">
            <Clock className="size-4 text-gray-400" /> {fmtDate(lesson.date, true)}, {lesson.start_time}–{lesson.end_time}
          </div>
          <div className="flex items-center gap-2 text-gray-700">
            <MapPin className="size-4 text-gray-400" /> {lesson.place}
          </div>
          <div className="pt-3">
            {q.data!.is_teacher ? (
              <p className="rounded-xl bg-gray-50 p-3 text-gray-600">{ck.teacherNote}</p>
            ) : attendance ? (
              <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-emerald-800">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                <div>
                  {ck.registered}
                  {attendance.status === "pending" && ` ${ck.pendingNote}`}
                  {attendance.status === "confirmed" && ` ${ck.confirmedNote}`}
                </div>
              </div>
            ) : q.data!.open ? (
              <Button className="w-full" size="md" loading={checkin.isPending} onClick={() => checkin.mutate()}>
                {ck.markPresent}
              </Button>
            ) : (
              <p className="rounded-xl bg-amber-50 p-3 text-amber-800">{q.data!.message}</p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
