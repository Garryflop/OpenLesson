import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, KeyRound, Loader2, MessageSquareText, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Role, User } from "../api/types";
import { useAuth } from "../auth";
import { LangSwitch } from "../components/LangSwitch";
import { Logo } from "../components/Layout";
import { Badge, Button, ErrorBox, Input, usePageTitle } from "../components/ui";
import { useI18n } from "../i18n";
import { roleLabels } from "../lib/format";
import { useDebounced } from "../lib/hooks";

interface AuthConfig {
  oidc_enabled: boolean;
  provider_name: string;
  dev_login_enabled: boolean;
  allowed_domains: string[];
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 21 21" className="size-4" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

const ROLE_ORDER: Role[] = ["admin", "methodist", "dean", "leadership", "teacher"];

export default function LoginPage() {
  const { t } = useI18n();
  const lt = t.login;
  usePageTitle(lt.title);
  const { user } = useAuth();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const next = params.get("next") || "/";
  const [filter, setFilter] = useState("");
  const { data: config } = useQuery({ queryKey: ["auth-config"], queryFn: () => api.get<AuthConfig>("/api/auth/config") });
  const search = useDebounced(filter.trim(), 250);
  const { data: demoUsers, isFetching } = useQuery({
    queryKey: ["dev-users", search],
    queryFn: () => api.get<User[]>("/api/auth/dev-users", { q: search, limit: 40 }),
    enabled: !!config?.dev_login_enabled,
    placeholderData: keepPreviousData,
  });
  const login = useMutation({
    mutationFn: (userId: number) => api.post<User>("/api/auth/dev-login", { user_id: userId }),
    onSuccess: (u) => qc.setQueryData(["me"], u),
  });
  const grouped = useMemo(() => {
    const list = demoUsers ?? [];
    return ROLE_ORDER.map((role) => ({
      role,
      users: list.filter((u) => ROLE_ORDER.find((r) => u.roles.includes(r)) === role),
    })).filter((g) => g.users.length);
  }, [demoUsers]);

  if (user) return <Navigate to={next} replace />;

  return (
    <div className="relative grid grid-cols-1 min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <LangSwitch className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6" />
      <section className="relative hidden overflow-hidden bg-brand-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 size-[460px] rounded-full bg-accent-500/25" />
        <div className="absolute -bottom-24 right-24 size-[280px] rounded-full bg-accent-500/15" />
        <div className="relative inline-flex w-fit items-center gap-4 rounded-2xl bg-white px-5 py-3 shadow-sm">
          <img src="/aitu-logo.png" alt="Astana IT University" className="h-12 w-auto" />
          <div className="h-9 w-px bg-gray-200" />
          <span className="text-lg font-semibold text-brand-900">OpenLesson</span>
        </div>
        <div className="relative max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            {lt.heroTitle} <span className="text-accent-400">{lt.heroAccent}</span>
          </h1>
          <p className="mt-4 text-white/75">{lt.heroText}</p>
          <div className="mt-8 grid gap-3">
            {[
              { icon: <CalendarCheck className="size-5" />, text: lt.featureSchedule },
              { icon: <MessageSquareText className="size-5" />, text: lt.featureReviews },
              { icon: <Sparkles className="size-5" />, text: lt.featureAi },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-3 rounded-2xl bg-white/8 px-4 py-3 text-sm">
                <span className="text-accent-400">{f.icon}</span>
                {f.text}
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-white/50">© Astana IT University · OpenLesson</p>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{lt.heading}</h2>
          <p className="mt-1 text-sm text-gray-500">{lt.hint}</p>

          <div className="mt-6 space-y-4">
            {params.get("error") && <ErrorBox error={params.get("error")} />}
            <a
              href={config?.oidc_enabled ? `/api/auth/login?next=${encodeURIComponent(next)}` : undefined}
              aria-disabled={!config?.oidc_enabled}
              className={
                "flex h-11 w-full items-center justify-center gap-3 rounded-full border border-gray-300 bg-white text-sm font-medium transition " +
                (config?.oidc_enabled ? "hover:bg-gray-50" : "pointer-events-none opacity-50")
              }
            >
              <MicrosoftIcon /> {lt.signInWith(config?.provider_name ?? "Microsoft")}
            </a>
            {config && !config.oidc_enabled && (
              <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <KeyRound className="mt-0.5 size-4 shrink-0" />
                {lt.oidcMissing}
              </p>
            )}
          </div>

          {config?.dev_login_enabled && (
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">{lt.demoTitle}</h3>
                <Badge tone="amber">{lt.devOnly}</Badge>
              </div>
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                <Input type="search" className="pl-9 pr-9" aria-label={lt.searchLabel} placeholder={lt.searchPlaceholder} value={filter} onChange={(e) => setFilter(e.target.value)} />
                {isFetching && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-gray-400" aria-hidden />}
              </div>
              <ErrorBox error={login.error} />
              <div className="max-h-[46vh] space-y-4 overflow-y-auto pr-1">
                {grouped.map((g) => (
                  <div key={g.role}>
                    <div className="mb-1.5 text-xs font-medium text-gray-400">{roleLabels()[g.role]}</div>
                    <div className="space-y-1.5">
                      {g.users.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => login.mutate(u.id)}
                          disabled={login.isPending}
                          className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left transition hover:border-gray-300 hover:bg-gray-50"
                        >
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xs font-semibold text-brand-700">
                            {u.full_name.split(" ").slice(0, 2).map((p) => p[0]).join("")}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{u.full_name}</div>
                            <div className="truncate text-xs text-gray-500">{u.position ?? u.school_name ?? u.email ?? t.common.roles.teacher}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!config?.dev_login_enabled && !config?.oidc_enabled && config && (
            <Button className="mt-6 w-full" disabled>
              {lt.unavailable}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
