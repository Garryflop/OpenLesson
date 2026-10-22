import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Bot, ClipboardList, Clock4, FastForward, ImageIcon, KeyRound, ListChecks, Mail, Plus, RotateCcw, Save, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { AppSettings, Criterion, SystemInfo } from "../../api/types";
import { useAuth, useSystem } from "../../auth";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, StatsSkeleton, useConfirm, usePageTitle, useToast } from "../../components/ui";
import { useI18n } from "../../i18n";
import { fmtDateTime, localIso } from "../../lib/format";

// titles and descriptions live in the i18n dictionary: t.admin.settings.policy.options[value]
const POLICIES: AppSettings["annul_policy"][] = ["auto", "admin_confirm", "grace"];

function NumberField({ label, value, onChange, hint, disabled }: { label: string; value: number; onChange: (v: number) => void; hint?: string; disabled?: boolean }) {
  return (
    <Field label={label} hint={hint}>
      <Input type="number" min={0} value={value} disabled={disabled} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))} />
    </Field>
  );
}

function CriteriaEditor({ readOnly }: { readOnly: boolean }) {
  const { t } = useI18n();
  const s = t.admin.settings.criteria;
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["criteria", "all"], queryFn: () => api.get<Criterion[]>("/api/feedback/criteria", { all: true }) });
  const [title, setTitle] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [titleKk, setTitleKk] = useState("");
  // send the stored RU/EN/KK texts, never the display title (it follows the interface language)
  const raw = (c: Criterion) => ({
    title: c.title_ru ?? c.title,
    description: c.description_ru ?? c.description,
    title_en: c.title_en ?? null,
    description_en: c.description_en ?? null,
    title_kk: c.title_kk ?? null,
    order: c.order,
    is_active: c.is_active,
  });
  const save = useMutation({
    mutationFn: (c: Partial<Criterion> & { id?: number }) =>
      c.id ? api.put(`/api/feedback/criteria/${c.id}`, c) : api.post("/api/feedback/criteria", { ...c, order: (q.data?.length ?? 0) + 1 }),
    onSuccess: () => {
      setTitle("");
      setTitleEn("");
      setTitleKk("");
      void qc.invalidateQueries({ queryKey: ["criteria"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  return (
    <Card>
      <CardHeader icon={<ListChecks className="size-5" />} title={s.title} subtitle={s.subtitle} />
      <div className="divide-y divide-gray-100 border-t border-gray-100">
        {q.data?.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-5 py-3">
            <span className="w-6 text-sm text-gray-400 tabular">{c.order}</span>
            <div className={clsx("min-w-0 flex-1", !c.is_active && "opacity-50")}>
              <div className="text-sm font-medium">{c.title_ru ?? c.title}</div>
              <div className="text-xs text-gray-500">
                <span lang="en">EN: {c.title_en || "—"}</span>
                {" · "}
                <span lang="kk">KZ: {c.title_kk || "—"}</span>
                {(c.description_ru ?? c.description) && <> · {c.description_ru ?? c.description}</>}
              </div>
            </div>
            {!readOnly && (
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" className="accent-gray-900" checked={c.is_active} onChange={(e) => save.mutate({ id: c.id, ...raw(c), is_active: e.target.checked })} />
                {s.active}
              </label>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className="flex flex-col gap-2 border-t border-gray-100 px-5 py-3 sm:flex-row">
          <Input placeholder={s.newPlaceholder} value={title} onChange={(e) => setTitle(e.target.value)} lang="ru" aria-label={s.newPlaceholder} />
          <Input placeholder={s.newPlaceholderEn} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} lang="en" aria-label={s.newPlaceholderEn} />
          <Input placeholder={s.newPlaceholderKk} value={titleKk} onChange={(e) => setTitleKk(e.target.value)} lang="kk" aria-label={s.newPlaceholderKk} />
          <Button
            variant="secondary"
            icon={<Plus className="size-4" />}
            disabled={title.trim().length < 3}
            onClick={() => save.mutate({ title, title_en: titleEn.trim() || null, title_kk: titleKk.trim() || null, is_active: true })}
          >
            {t.common.actions.add}
          </Button>
        </div>
      )}
    </Card>
  );
}

function DemoClock({ system }: { system: SystemInfo }) {
  const { t } = useI18n();
  const s = t.admin.settings.demo;
  const qc = useQueryClient();
  const toast = useToast();
  const { now } = useSystem();
  const [target, setTarget] = useState(localIso(now).slice(0, 16));
  const set = useMutation({
    mutationFn: (minutes: number) => api.put("/api/settings/clock", { offset_minutes: minutes }),
    onSuccess: async () => {
      await api.post("/api/automation/run");
      toast(s.changedToast);
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const offset = system.clock_offset_minutes;
  const shift = (days: number) => set.mutate(offset + days * 1440);
  const real = new Date(new Date().getTime());
  return (
    <Card className="border-amber-200">
      <CardHeader
        icon={<FastForward className="size-5 text-amber-600" />}
        title={s.title}
        subtitle={s.subtitle}
        action={offset !== 0 ? <Badge tone="amber">{s.shift(Math.round(offset / 60))}</Badge> : <Badge>{s.realTime}</Badge>}
      />
      <div className="space-y-3 px-5 pb-5">
        <div className="text-sm text-gray-600">
          {s.platformTime} <b>{fmtDateTime(system.now, true)}</b>
        </div>
        <div className="flex flex-wrap gap-2">
          {[1, 3, 7].map((d) => (
            <Button key={d} size="sm" variant="secondary" loading={set.isPending} onClick={() => shift(d)}>
              {s.plusDays(d)}
            </Button>
          ))}
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => set.mutate(0)}>
            {t.common.actions.reset}
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label={s.jumpTo} className="min-w-[220px] flex-1">
            <Input type="datetime-local" value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
          <Button
            size="sm"
            className="mb-0.5"
            onClick={() => {
              const diff = Math.round((new Date(target).getTime() - real.getTime()) / 60000);
              set.mutate(diff);
            }}
          >
            {s.apply}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const st = t.admin.settings;
  usePageTitle(st.pageTitle);
  const confirm = useConfirm();
  const qc = useQueryClient();
  const toast = useToast();
  const { has } = useAuth();
  const readOnly = !has("admin");
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.get<AppSettings>("/api/settings") });
  const system = useQuery({ queryKey: ["system"], queryFn: () => api.get<SystemInfo>("/api/system") });
  const [s, setS] = useState<AppSettings | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (settings.data) setS(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => api.put<AppSettings>("/api/settings", s),
    onSuccess: () => {
      toast(st.savedToast);
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const logo = useMutation({
    mutationFn: (f: File) => api.upload("/api/settings/logo", f),
    onSuccess: () => {
      toast(st.logoUploaded);
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const resetLogo = useMutation({
    mutationFn: () => api.delete("/api/settings/logo"),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  if (!s || !system.data) return <StatsSkeleton count={4} />;
  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => setS((p) => (p ? { ...p, [k]: v } : p));
  const sys = system.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title={st.title}
        subtitle={st.subtitle}
        actions={
          !readOnly && (
            <Button icon={<Save className="size-4" />} loading={save.isPending} onClick={() => save.mutate()}>
              {t.common.actions.save}
            </Button>
          )
        }
      />
      {readOnly && <p className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-600">{st.readOnly}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<Clock4 className="size-5" />} title={st.deadlines.title} subtitle={st.deadlines.subtitle} />
          <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
            <NumberField label={st.deadlines.preReminder} value={s.pre_reminder_days} onChange={(v) => set("pre_reminder_days", v)} disabled={readOnly} hint={st.deadlines.preReminderHint} />
            <NumberField label={st.deadlines.reminder} value={s.reminder_days} onChange={(v) => set("reminder_days", v)} disabled={readOnly} hint={st.deadlines.daysBefore} />
            <NumberField label={st.deadlines.deadline} value={s.deadline_days} onChange={(v) => set("deadline_days", v)} disabled={readOnly} hint={st.deadlines.daysBefore} />
            <Field label={st.deadlines.deadlineTime}>
              <Input type="time" value={s.deadline_time} disabled={readOnly} onChange={(e) => set("deadline_time", e.target.value)} />
            </Field>
            <NumberField label={st.deadlines.poster} value={s.poster_days} onChange={(v) => set("poster_days", v)} disabled={readOnly} hint={st.deadlines.daysBefore} />
            <NumberField label={st.deadlines.feedback} value={s.feedback_days} onChange={(v) => set("feedback_days", v)} disabled={readOnly} hint={st.deadlines.feedbackHint} />
          </div>
        </Card>

        <Card>
          <CardHeader icon={<ShieldCheck className="size-5" />} title={st.policy.title} subtitle={st.policy.subtitle} />
          <div className="space-y-2 px-5 pb-5">
            {POLICIES.map((value) => ({ value, ...st.policy.options[value] })).map((p) => (
              <label
                key={p.value}
                className={clsx(
                  "flex cursor-pointer gap-3 rounded-2xl border p-4 transition",
                  s.annul_policy === p.value ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300",
                  readOnly && "cursor-default",
                )}
              >
                <input type="radio" name="policy" className="mt-1 size-4 accent-gray-900" checked={s.annul_policy === p.value} disabled={readOnly} onChange={() => set("annul_policy", p.value)} />
                <div>
                  <div className="font-medium">{p.title}</div>
                  <div className="mt-0.5 text-sm text-gray-500">{p.text}</div>
                  {p.value === "grace" && s.annul_policy === "grace" && (
                    <div className="mt-3 max-w-[200px]">
                      <NumberField label={st.policy.graceHours} value={s.grace_hours} onChange={(v) => set("grace_hours", v)} disabled={readOnly} />
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader icon={<ClipboardList className="size-5" />} title={st.attendance.title} subtitle={st.attendance.subtitle} />
          <div className="space-y-3 px-5 pb-5 text-sm">
            <p className="rounded-xl bg-gray-50 p-3 text-gray-600">
              {st.attendance.main}
            </p>
            <label className="flex items-start justify-between gap-3">
              <span>
                <span className="font-medium">{st.attendance.qr}</span>
                <span className="block text-xs text-gray-500">{st.attendance.qrHint}</span>
              </span>
              <input type="checkbox" className="mt-1 size-4 accent-gray-900" checked={s.qr_checkin_enabled} disabled={readOnly} onChange={(e) => set("qr_checkin_enabled", e.target.checked)} />
            </label>
            {s.qr_checkin_enabled && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <NumberField label={st.attendance.opens} value={s.checkin_before_minutes} onChange={(v) => set("checkin_before_minutes", v)} disabled={readOnly} hint={st.attendance.opensHint} />
                <NumberField label={st.attendance.closes} value={s.checkin_after_minutes} onChange={(v) => set("checkin_after_minutes", v)} disabled={readOnly} hint={st.attendance.closesHint} />
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader icon={<ImageIcon className="size-5" />} title={st.poster.title} subtitle={st.poster.subtitle} />
          <div className="space-y-4 px-5 pb-5">
            <div className="flex items-center gap-4 rounded-2xl p-4" style={{ background: s.poster_primary_color }}>
              <div className="rounded-xl bg-white px-3 py-2">
                <img src={s.poster_logo ? `/api/files/branding/${s.poster_logo}` : "/aitu-logo.png"} alt={st.poster.logoAlt} className="h-10 w-auto" />
              </div>
              <div className="text-2xl font-black leading-none text-white">
                OPEN <span style={{ color: s.poster_accent_color }}>LESSON</span>
              </div>
            </div>
            <Field label={st.poster.university}>
              <Input value={s.university_name} disabled={readOnly} onChange={(e) => set("university_name", e.target.value)} />
            </Field>
            <Field label={st.poster.language}>
              <Select value={s.poster_language} disabled={readOnly} onChange={(e) => set("poster_language", e.target.value as AppSettings["poster_language"])}>
                <option value="kk">{t.common.lang.kk}</option>
                <option value="ru">{t.common.lang.ru}</option>
                <option value="en">{t.common.lang.en}</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={st.poster.primary}>
                <div className="flex items-center gap-2">
                  <input type="color" value={s.poster_primary_color} disabled={readOnly} onChange={(e) => set("poster_primary_color", e.target.value)} className="h-10 w-12 rounded-lg border border-gray-200" />
                  <Input value={s.poster_primary_color} disabled={readOnly} onChange={(e) => set("poster_primary_color", e.target.value)} />
                </div>
              </Field>
              <Field label={st.poster.accent}>
                <div className="flex items-center gap-2">
                  <input type="color" value={s.poster_accent_color} disabled={readOnly} onChange={(e) => set("poster_accent_color", e.target.value)} className="h-10 w-12 rounded-lg border border-gray-200" />
                  <Input value={s.poster_accent_color} disabled={readOnly} onChange={(e) => set("poster_accent_color", e.target.value)} />
                </div>
              </Field>
            </div>
            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <input
                  ref={logoRef}
                  type="file"
                  accept=".png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) logo.mutate(f);
                    e.target.value = "";
                  }}
                />
                <Button size="sm" variant="secondary" icon={<Upload className="size-3.5" />} loading={logo.isPending} onClick={() => logoRef.current?.click()}>
                  {st.poster.uploadLogo}
                </Button>
                {s.poster_logo && (
                  <Button size="sm" variant="ghost" onClick={async () => (await confirm({ title: st.poster.resetTitle, text: st.poster.resetText, confirmLabel: st.poster.resetConfirm })) && resetLogo.mutate()}>
                    {st.poster.resetButton}
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader icon={<Mail className="size-5" />} title={st.integrations.title} subtitle={st.integrations.subtitle} />
          <div className="space-y-3 px-5 pb-5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <KeyRound className="size-4 text-gray-400" /> OpenID Connect (Microsoft Entra ID)
              </span>
              {sys.oidc_enabled ? <Badge tone="green">{st.integrations.connected}</Badge> : <Badge tone="amber">{st.integrations.oidcOff}</Badge>}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Mail className="size-4 text-gray-400" /> {st.integrations.mail}
              </span>
              <Badge tone={sys.email_backend === "console" ? "amber" : "green"}>{sys.email_backend === "console" ? st.integrations.consoleMail : sys.email_backend}</Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Bot className="size-4 text-gray-400" /> AI Assistant
              </span>
              <Badge tone={sys.ai_provider === "local" ? "amber" : "green"}>
                {sys.ai_provider === "openai" ? `OpenAI API · ${sys.ai_model}` : sys.ai_provider === "local_llm" ? st.integrations.localLlm(sys.ai_model ?? "") : st.integrations.localAi}
              </Badge>
            </div>
            <label className="flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
              <span>{st.integrations.mailingEnabled}</span>
              <input type="checkbox" className="size-4 accent-gray-900" checked={s.mailing_enabled} disabled={readOnly} onChange={(e) => set("mailing_enabled", e.target.checked)} />
            </label>
            <div className="text-xs text-gray-500">{st.integrations.footer(sys.timezone, sys.scheduler_enabled)}</div>
          </div>
        </Card>

        <div className="lg:col-span-2">
          <CriteriaEditor readOnly={readOnly} />
        </div>
        {!readOnly && sys.environment !== "production" && (
          <div className="lg:col-span-2">
            <DemoClock system={sys} />
          </div>
        )}
      </div>
    </div>
  );
}
