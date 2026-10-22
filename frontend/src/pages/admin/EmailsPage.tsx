import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Paperclip, RefreshCw, Search, Send } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { EmailItem, SystemInfo } from "../../api/types";
import { Badge, Button, Card, Input, Modal, PageHeader, RowsSkeleton, Segmented, Spinner, usePageTitle, useToast } from "../../components/ui";
import { useI18n } from "../../i18n";
import { fmtDateTime } from "../../lib/format";

const STATUS_TONE = {
  pending: "amber" as const,
  sent: "green" as const,
  failed: "red" as const,
};

export default function EmailsPage() {
  const { t } = useI18n();
  const s = t.admin.emails;
  usePageTitle(s.pageTitle);
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<string>("");
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<EmailItem | null>(null);
  const system = useQuery({ queryKey: ["system"], queryFn: () => api.get<SystemInfo>("/api/system") });
  const emails = useQuery({
    queryKey: ["emails", status, q],
    queryFn: () => api.get<{ total: number; counts: Record<string, number>; items: EmailItem[] }>("/api/emails", { status, q, limit: 200 }),
  });
  const html = useQuery({
    queryKey: ["email-html", preview?.id],
    queryFn: () => api.get<string>(`/api/emails/${preview!.id}`),
    enabled: !!preview,
  });
  const retry = useMutation({
    mutationFn: (id: number) => api.post<EmailItem>(`/api/emails/${id}/retry`),
    onSuccess: (m) => {
      toast(m.status === "sent" ? s.sentToast : s.retryFailed(String(m.last_error)), m.status === "sent" ? "ok" : "error");
      void qc.invalidateQueries({ queryKey: ["emails"] });
    },
  });
  const process = useMutation({
    mutationFn: () => api.post<{ sent: number; failed: number }>("/api/emails/process"),
    onSuccess: (r) => {
      toast(s.processed(r.sent, r.failed));
      void qc.invalidateQueries({ queryKey: ["emails"] });
    },
  });
  const counts = emails.data?.counts ?? {};
  return (
    <div>
      <PageHeader
        title={s.title}
        subtitle={s.subtitle(system.data?.email_backend ?? "…")}
        actions={
          <Button variant="secondary" size="sm" icon={<Send className="size-4" />} loading={process.isPending} onClick={() => process.mutate()}>
            {s.processQueue}
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: s.filter.all(Object.values(counts).reduce((a, b) => a + b, 0)) },
            { value: "sent", label: s.filter.sent(counts.sent ?? 0) },
            { value: "pending", label: s.filter.pending(counts.pending ?? 0) },
            { value: "failed", label: s.filter.failed(counts.failed ?? 0) },
          ]}
        />
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <Input className="pl-9" placeholder={s.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <Card className="overflow-hidden">
        {emails.isLoading ? (
          <RowsSkeleton rows={8} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{s.cols.created}</th>
                  <th className="px-3 py-2.5 font-medium">{s.cols.recipient}</th>
                  <th className="px-3 py-2.5 font-medium">{s.cols.subject}</th>
                  <th className="px-3 py-2.5 font-medium">{s.cols.attempts}</th>
                  <th className="px-3 py-2.5 font-medium">{s.cols.status}</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {emails.data?.items.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap px-5 py-2.5 text-gray-600">{fmtDateTime(m.created_at)}</td>
                    <td className="px-3 py-2.5">{m.to_email}</td>
                    <td className="max-w-[340px] px-3 py-2.5">
                      <div className="truncate">{m.subject}</div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        {s.kinds[m.kind] ?? m.kind}
                        {m.attachments.length > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <Paperclip className="size-3" /> {m.attachments.length}
                          </span>
                        )}
                        {m.lesson_id && (
                          <Link to={`/lessons/${m.lesson_id}`} className="text-brand-600 hover:underline">
                            {s.lessonLink}
                          </Link>
                        )}
                      </div>
                      {m.last_error && <div className="truncate text-xs text-red-600">{m.last_error}</div>}
                    </td>
                    <td className="px-3 py-2.5 tabular">{m.attempts}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={STATUS_TONE[m.status]}>{s.status[m.status]}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <button className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100" onClick={() => setPreview(m)} title={s.preview} aria-label={s.preview}>
                        <Eye className="size-4" />
                      </button>
                      {m.status !== "sent" && (
                        <button className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100" onClick={() => retry.mutate(m.id)} title={s.resend} aria-label={t.common.actions.retry}>
                          <RefreshCw className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.subject ?? ""} wide>
        <div className="mb-3 text-xs text-gray-500">
          {s.to(preview?.to_email ?? "")} · {preview?.sent_at ? s.deliveredAt(fmtDateTime(preview.sent_at)) : s.notDelivered}
        </div>
        {html.data ? <iframe title={s.iframeTitle} srcDoc={html.data} className="h-[60vh] w-full rounded-xl border border-gray-200" sandbox="" /> : <Spinner />}
      </Modal>
    </div>
  );
}
