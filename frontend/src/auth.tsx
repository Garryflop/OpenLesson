import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { api } from "./api/client";
import type { Role, SystemInfo, User } from "./api/types";
import { hasStoredLang, useI18n } from "./i18n";
import { parseDate } from "./lib/format";

interface AuthState {
  user: User | null;
  loading: boolean;
  has: (...roles: Role[]) => boolean;
  isManager: boolean;
  canAnalytics: boolean;
  logout: () => Promise<void>;
  refresh: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<User>("/api/auth/me").catch(() => null),
    staleTime: 60_000,
  });

  useEffect(() => {
    const handler = () => qc.setQueryData(["me"], null);
    window.addEventListener("ol:unauthorized", handler);
    return () => window.removeEventListener("ol:unauthorized", handler);
  }, [qc]);

  const user = data ?? null;

  // Interface language: adopt the profile setting on a new device, otherwise save the local choice to the
  // profile so that e-mails and notifications reach the user in the same language.
  const { lang, setLang } = useI18n();
  const profileLang = user?.language ?? null;
  // until the profile language is applied, render nothing — pages would fetch texts in the wrong language
  const adopting = !!profileLang && profileLang !== lang && !hasStoredLang();
  useEffect(() => {
    if (!user) return;
    if (adopting && profileLang) {
      setLang(profileLang, { remember: false });
      return;
    }
    if (profileLang !== lang) {
      api
        .put("/api/auth/me/language", { language: lang })
        .then(() => qc.setQueryData<User | null>(["me"], (u) => (u ? { ...u, language: lang } : u)))
        .catch(() => undefined);
    }
  }, [user, lang, setLang, qc, adopting, profileLang]);
  const has = (...roles: Role[]) => !!user && roles.some((r) => user.roles.includes(r));
  const value: AuthState = {
    user,
    loading: isLoading,
    has,
    isManager: has("admin", "methodist"),
    canAnalytics: has("admin", "methodist", "dean", "leadership"),
    logout: async () => {
      await api.post("/api/auth/logout");
      qc.clear();
      qc.setQueryData(["me"], null);
    },
    refresh: () => void refetch(),
  };
  return <AuthContext.Provider value={value}>{adopting ? null : children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

/** Platform clock (respects the demo time offset configured by the administrator). */
export function useSystem() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["system"],
    queryFn: () => api.get<SystemInfo>("/api/system"),
    enabled: !!user,
    refetchInterval: 60_000,
  });
  const fetchedAt = q.dataUpdatedAt || Date.now();
  const now = q.data ? new Date(parseDate(q.data.now).getTime() + (Date.now() - fetchedAt)) : new Date();
  return { system: q.data, now };
}
