import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Notification } from "../api/types";
import { useSystem } from "../auth";
import { Button, Card, EmptyState, ErrorBox, PageHeader, RowsSkeleton, Segmented, usePageTitle } from "../components/ui";
import { useI18n } from "../i18n";
import { relative } from "../lib/format";
import { useState } from "react";

export default function NotificationsPage() {
  const { t } = useI18n();
  const nt = t.notifications;
  usePageTitle(t.common.bell.title);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { now } = useSystem();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const q = useQuery({
    queryKey: ["notifications", unreadOnly],
    queryFn: () => api.get<{ unread: number; items: Notification[] }>("/api/notifications", { unread_only: unreadOnly, limit: 100 }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const readAll = useMutation({ mutationFn: () => api.post("/api/notifications/read-all"), onSuccess: refresh });
  const read = useMutation({ mutationFn: (id: number) => api.post(`/api/notifications/${id}/read`), onSuccess: refresh });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t.common.bell.title}
        subtitle={nt.subtitle}
        actions={
          <Button variant="secondary" size="sm" icon={<CheckCheck className="size-4" />} onClick={() => readAll.mutate()} disabled={!q.data?.unread}>
            {t.common.bell.readAll}
          </Button>
        }
      />
      <Segmented
        className="mb-4"
        value={unreadOnly ? "unread" : "all"}
        onChange={(v) => setUnreadOnly(v === "unread")}
        options={[
          { value: "all", label: t.common.actions.all },
          { value: "unread", label: `${nt.unread}${q.data?.unread ? ` (${q.data.unread})` : ""}` },
        ]}
      />
      <ErrorBox error={q.error} />
      {q.isLoading ? (
        <Card className="overflow-hidden">
          <RowsSkeleton rows={5} />
        </Card>
      ) : !q.data?.items.length ? (
        <Card>
          <EmptyState icon={<Bell className="size-6" />} title={nt.empty} />
        </Card>
      ) : (
        <Card className="divide-y divide-gray-100 overflow-hidden">
          {q.data.items.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                if (!n.read_at) read.mutate(n.id);
                if (n.link) navigate(n.link.split("#")[0]);
              }}
              className={clsx("flex w-full gap-3 px-5 py-4 text-left transition hover:bg-gray-50", !n.read_at && "bg-brand-50/40")}
            >
              <span className={clsx("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-brand-500")} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-gray-900">{n.title}</span>
                  <span className="text-xs text-gray-500">{relative(n.created_at, now)}</span>
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-gray-600">{n.body}</p>
              </div>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}
