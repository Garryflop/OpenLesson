import { getLang, msgs } from "../i18n";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Params = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

function buildUrl(path: string, params?: Params): string {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, String(v)));
    else url.searchParams.set(key, String(value));
  }
  return url.pathname + url.search;
}

async function parseError(res: Response): Promise<ApiError> {
  let message = msgs().common.error(res.status);
  try {
    const body = await res.json();
    if (typeof body.detail === "string") message = body.detail;
    else if (Array.isArray(body.detail)) message = body.detail.map((d: { msg: string }) => d.msg).join("; ");
  } catch {
    /* not JSON */
  }
  return new ApiError(res.status, message);
}

async function request<T>(method: string, path: string, opts: { params?: Params; json?: unknown; form?: FormData } = {}): Promise<T> {
  const init: RequestInit = { method, credentials: "include", headers: { "X-Lang": getLang() } };
  if (opts.json !== undefined) {
    init.body = JSON.stringify(opts.json);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  } else if (opts.form) {
    init.body = opts.form;
  }
  const res = await fetch(buildUrl(path, opts.params), init);
  if (!res.ok) {
    const err = await parseError(res);
    if (res.status === 401 && !path.startsWith("/api/auth/")) {
      window.dispatchEvent(new CustomEvent("ol:unauthorized"));
    }
    throw err;
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>("GET", path, { params }),
  post: <T>(path: string, json?: unknown, params?: Params) => request<T>("POST", path, { json: json ?? {}, params }),
  put: <T>(path: string, json?: unknown) => request<T>("PUT", path, { json }),
  patch: <T>(path: string, json?: unknown) => request<T>("PATCH", path, { json }),
  delete: <T>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, file: File, field = "file") => {
    const form = new FormData();
    form.append(field, file);
    return request<T>("POST", path, { form });
  },
};

export async function download(path: string, params?: Params, fallbackName = "download"): Promise<void> {
  const res = await fetch(buildUrl(path, params), { credentials: "include", headers: { "X-Lang": getLang() } });
  if (!res.ok) throw await parseError(res);
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
