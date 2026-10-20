import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  BarChart3,
  Bell,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  Clock3,
  FastForward,
  LayoutDashboard,
  LogOut,
  Mail,
  Map,
  Menu,
  MessageSquareText,
  Settings,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Notification } from "../api/types";
import { useAuth, useSystem } from "../auth";
import { useI18n } from "../i18n";
import { fmtDateTime, localIso, relative, roleLabels } from "../lib/format";
import { LangSwitch } from "./LangSwitch";
import { Avatar } from "./ui";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  show?: boolean;
  end?: boolean;
}

function NavSection({ title, items, onNavigate }: { title?: string; items: NavItem[]; onNavigate: () => void }) {
  const visible = items.filter((i) => i.show !== false);
  if (!visible.length) return null;
  return (
    <div className="mb-6">
      {title && <div className="mb-1.5 px-3 text-xs font-medium text-gray-400">{title}</div>}
      <ul className="flex flex-col gap-0.5">
        {visible.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                clsx(
                  "flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-200",
                  isActive ? "bg-brand-900 text-white shadow-card" : "text-gray-600 hover:bg-gray-900/5 hover:text-gray-900",
                )
              }
            >
              <span className="[&>svg]:size-[18px]" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Logo({ compact }: { compact?: boolean }) {
  const c = useI18n().t.common;
  return (
    <Link to="/" className="flex items-center gap-3 rounded-lg" aria-label={c.nav.toHome}>
      <img src="/aitu-logo.png" alt="Astana IT University" className={clsx("w-auto", compact ? "h-8" : "h-10")} />
      {/* on narrow phones the header also holds the KZ / RU / EN switch — keep only the logo there */}
      <span className={clsx("h-8 w-px bg-gray-200", compact && "max-[459px]:hidden")} aria-hidden />
      <span className={clsx("leading-tight", compact && "max-[459px]:hidden")}>
        <span className="block text-[15px] font-semibold tracking-[-0.01em] text-gray-900">OpenLesson</span>
        <span className="block text-[11px] text-gray-500">{c.appSubtitle}</span>
      </span>
    </Link>
  );
}

function NotificationBell() {
  const c = useI18n().t.common;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { now } = useSystem();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: ["notifications", "bell"],
    queryFn: () => api.get<{ unread: number; items: Notification[] }>("/api/notifications", { limit: 6 }),
    refetchInterval: 30_000,
  });
  const readAll = useMutation({
    mutationFn: () => api.post("/api/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const read = useMutation({
    mutationFn: (id: number) => api.post(`/api/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = q.data?.unread ?? 0;
  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-10 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-900/5 hover:text-gray-900"
        aria-label={unread ? c.bell.unread(unread) : c.bell.title}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={c.bell.recent}
          className="absolute right-0 top-12 z-40 w-[min(92vw,380px)] animate-fade-up overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-overlay"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-sm font-semibold">{c.bell.title}</span>
            {unread > 0 && (
              <button onClick={() => readAll.mutate()} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                <CheckCheck className="size-3.5" /> {c.bell.readAll}
              </button>
            )}
          </div>
          <ul className="max-h-[60dvh] divide-y divide-gray-100 overflow-y-auto">
            {q.data?.items.length ? (
              q.data.items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      if (!n.read_at) read.mutate(n.id);
                      setOpen(false);
                      if (n.link) navigate(n.link.split("#")[0]);
                    }}
                    className={clsx("flex w-full gap-3 px-4 py-3 text-left transition hover:bg-gray-50", !n.read_at && "bg-brand-50/50")}
                  >
                    <span className={clsx("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-brand-500")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900">{n.title}</span>
                      <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-gray-500">{n.body}</span>
                      <span className="mt-1 block text-[11px] text-gray-400">{relative(n.created_at, now)}</span>
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-4 py-8 text-center text-sm text-gray-500">{c.bell.empty}</li>
            )}
          </ul>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-gray-100 px-4 py-2.5 text-center text-sm font-medium text-brand-600 hover:bg-gray-50">
            {c.bell.all}
          </Link>
        </div>
      )}
    </div>
  );
}

interface Tab {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

/** Mobile bottom tab bar: four role-specific sections + «More» (all sections in a bottom sheet). */
function BottomNav({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const { isManager, canAnalytics } = useAuth();
  const c = useI18n().t.common;
  const { pathname } = useLocation();
  const T = c.tabs;
  const home: Tab = { to: "/", label: T.home, icon: <LayoutDashboard />, end: true };
  const schedule: Tab = { to: "/schedule", label: T.schedule, icon: <CalendarDays /> };
  const tabs: Tab[] = isManager
    ? [home, schedule, { to: "/admin/control", label: T.control, icon: <Clock3 /> }, { to: "/analytics", label: T.analytics, icon: <BarChart3 /> }]
    : canAnalytics
      ? [home, schedule, { to: "/analytics", label: T.analytics, icon: <BarChart3 /> }, { to: "/map", label: T.map, icon: <Map /> }]
      : [home, schedule, { to: "/my-lessons", label: T.myLesson, icon: <Upload /> }, { to: "/feedback", label: T.reviews, icon: <MessageSquareText /> }];
  const onTab = tabs.some((t) => (t.end ? pathname === t.to : pathname === t.to || pathname.startsWith(`${t.to}/`)));
  const item = (active: boolean) =>
    clsx(
      "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium leading-none transition-colors",
      active ? "text-brand-800" : "text-gray-500 hover:text-gray-900",
    );
  const pill = (active: boolean) =>
    clsx("flex h-7 w-14 items-center justify-center rounded-full transition-colors [&>svg]:size-[21px]", active && "bg-brand-100/80");
  return (
    <nav
      aria-label={T.label}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {tabs.map((t) => (
          <li key={t.to}>
            <NavLink to={t.to} end={t.end} className={({ isActive }) => item(isActive && !moreOpen)}>
              {({ isActive }) => (
                <>
                  <span className={pill(isActive && !moreOpen)} aria-hidden>
                    {t.icon}
                  </span>
                  <span className="max-w-full truncate px-1">{t.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
        <li>
          <button type="button" onClick={onMore} aria-haspopup="dialog" aria-expanded={moreOpen} className={clsx("w-full", item(moreOpen || !onTab))}>
            <span className={pill(moreOpen || !onTab)} aria-hidden>
              <Menu />
            </span>
            <span>{T.more}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

export default function Layout() {
  const { user, has, isManager, canAnalytics, logout } = useAuth();
  const c = useI18n().t.common;
  const { system, now } = useSystem();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  const sheet = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    // the sheet is modal on phones: lock the page behind it and move focus into it
    document.body.style.overflow = "hidden";
    sheet.current?.querySelector<HTMLElement>("nav a")?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      opener?.focus?.({ preventScroll: true });
    };
  }, [open]);
  if (!user) return null;

  const close = () => setOpen(false);
  const sidebar = (
    <div className="flex flex-col lg:h-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-5 lg:pt-5 lg:pb-7">
        <Logo />
        <button className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden" onClick={close} aria-label={c.nav.closeMenu}>
          <X className="size-5" />
        </button>
      </div>
      <nav aria-label={c.nav.main} className="flex-1 overflow-y-auto px-3">
        <NavSection
          onNavigate={close}
          items={[
            { to: "/", label: c.nav.home, icon: <LayoutDashboard />, end: true },
            { to: "/schedule", label: c.nav.schedule, icon: <CalendarDays /> },
            { to: "/my-lessons", label: c.nav.myLesson, icon: <Upload /> },
            { to: "/feedback", label: c.nav.myFeedback, icon: <MessageSquareText /> },
            { to: "/map", label: c.nav.map, icon: <Map /> },
          ]}
        />
        <NavSection
          title={c.nav.management}
          onNavigate={close}
          items={[
            { to: "/admin/schedule", label: c.nav.adminSchedule, icon: <ClipboardList />, show: isManager },
            { to: "/admin/control", label: c.nav.control, icon: <Clock3 />, show: isManager },
            { to: "/analytics", label: c.nav.analytics, icon: <BarChart3 />, show: canAnalytics },
            { to: "/admin/users", label: c.nav.users, icon: <Users />, show: has("admin") },
            { to: "/admin/emails", label: c.nav.emails, icon: <Mail />, show: isManager },
            { to: "/admin/settings", label: c.nav.settings, icon: <Settings />, show: isManager },
          ]}
        />
      </nav>
      <div className="border-t border-gray-100 p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Avatar name={user.full_name} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.short_name}</div>
            <div className="truncate text-xs text-gray-500">{user.roles.map((r) => roleLabels()[r]).join(", ")}</div>
          </div>
          <button
            onClick={() => void logout()}
            className="flex size-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            title={c.nav.logout}
            aria-label={c.nav.logout}
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="fixed left-3 top-3 z-[70] -translate-y-20 rounded-full bg-brand-900 px-4 py-2 text-sm font-medium text-white shadow-overlay transition focus:translate-y-0"
      >
        {c.nav.skipToContent}
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-gray-200/80 bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-up bg-brand-900/30 backdrop-blur-[2px]" onClick={close} />
          <aside
            ref={sheet}
            role="dialog"
            aria-modal="true"
            aria-label={c.tabs.moreTitle}
            className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] animate-sheet-up flex-col overflow-y-auto rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-overlay"
          >
            <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-gray-300" aria-hidden />
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-gray-200/80 bg-white/80 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <Logo compact />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {system && system.clock_offset_minutes !== 0 && (
              <Link
                to="/admin/settings"
                className="hidden items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200 sm:inline-flex"
                title={c.nav.demoTimeTitle}
              >
                <FastForward className="size-3.5" /> {c.nav.demoTime(fmtDateTime(localIso(now)))}
              </Link>
            )}
            <LangSwitch />
            <NotificationBell />
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto max-w-6xl animate-fade-up px-4 pt-6 pb-[calc(var(--tabbar-h)+1.5rem)] outline-none sm:px-6 sm:pt-8 lg:pb-8"
          key={location.pathname}
        >
          <Outlet />
        </main>
      </div>
      <BottomNav onMore={() => setOpen((v) => !v)} moreOpen={open} />
    </div>
  );
}
