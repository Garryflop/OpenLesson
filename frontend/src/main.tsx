import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth";
import { ConfirmProvider, ToastProvider } from "./components/ui";
import { LangProvider, useI18n } from "./i18n";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (count, err) => count < 1 && (err as { status?: number }).status !== 401, refetchOnWindowFocus: false },
  },
});

/** Remounts the routed app when the language changes and reloads server texts (notifications, history…). */
function LocalizedApp() {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void qc.invalidateQueries();
  }, [lang, qc]);
  return <App key={lang} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LangProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ToastProvider>
            <ConfirmProvider>
              <AuthProvider>
                <LocalizedApp />
              </AuthProvider>
            </ConfirmProvider>
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </LangProvider>
  </StrictMode>,
);
