import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Pencil, Plus, Search, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { api, download } from "../../api/client";
import type { Role, User } from "../../api/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, RowsSkeleton, Select, usePageTitle, useToast } from "../../components/ui";
import { useI18n } from "../../i18n";
import { roleLabels } from "../../lib/format";
import { useDebounced } from "../../lib/hooks";
import { useStructure } from "../SchedulePage";

const ROLES: Role[] = ["teacher", "methodist", "dean", "leadership", "admin"];

type Draft = Pick<User, "email" | "full_name" | "position" | "department_id" | "managed_school_id" | "roles" | "is_active" | "is_faculty">;

function UserModal({ user, onClose }: { user: User | "new" | null; onClose: () => void }) {
  const { t } = useI18n();
  const m = t.admin.users.modal;
  const qc = useQueryClient();
  const structure = useStructure();
  const initial: Draft =
    user && user !== "new"
      ? { ...user }
      : { email: null, full_name: "", position: "", department_id: null, managed_school_id: null, roles: ["teacher"], is_active: true, is_faculty: true };
  const [d, setD] = useState<Draft>(initial);
  const save = useMutation({
    mutationFn: () => (user === "new" ? api.post("/api/users", d) : api.put(`/api/users/${(user as User).id}`, d)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
  });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  return (
    <Modal
      open={!!user}
      onClose={onClose}
      persistent
      title={user === "new" ? m.newTitle : m.editTitle}
      footer={
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          {t.common.actions.save}
        </Button>
      }
    >
      <div className="space-y-4">
        <ErrorBox error={save.error} />
        <Field label={m.fullName}>
          <Input value={d.full_name} onChange={(e) => set("full_name", e.target.value)} />
        </Field>
        <Field label={m.email} hint={m.emailHint}>
          <Input type="email" value={d.email ?? ""} placeholder={m.emailPlaceholder} onChange={(e) => set("email", e.target.value.trim() || null)} />
        </Field>
        <Field label={m.position}>
          <Input value={d.position ?? ""} onChange={(e) => set("position", e.target.value)} />
        </Field>
        <Field label={m.department}>
          <Select value={d.department_id ?? ""} onChange={(e) => set("department_id", e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {structure.data?.schools.map((s) => (
              <optgroup key={s.id} label={s.name}>
                {s.departments.map((dep) => (
                  <option key={dep.id} value={dep.id}>
                    {dep.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <div>
          <div className="mb-1.5 text-sm font-medium text-gray-700">{m.roles}</div>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <label key={r} className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5 text-sm">
                <input
                  type="checkbox"
                  className="accent-gray-900"
                  checked={d.roles.includes(r)}
                  onChange={(e) => set("roles", e.target.checked ? [...d.roles, r] : d.roles.filter((x) => x !== r))}
                />
                {roleLabels()[r]}
              </label>
            ))}
          </div>
        </div>
        {d.roles.includes("dean") && (
          <Field label={m.managedSchool}>
            <Select value={d.managed_school_id ?? ""} onChange={(e) => set("managed_school_id", e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {structure.data?.schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-gray-900" checked={d.is_faculty} onChange={(e) => set("is_faculty", e.target.checked)} />
            {m.faculty}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-gray-900" checked={d.is_active} onChange={(e) => set("is_active", e.target.checked)} />
            {m.active}
          </label>
        </div>
      </div>
    </Modal>
  );
}

export default function UsersPage() {
  const { t } = useI18n();
  const s = t.admin.users;
  usePageTitle(s.pageTitle);
  const qc = useQueryClient();
  const toast = useToast();
  const structure = useStructure();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [limit, setLimit] = useState(100);
  const [edit, setEdit] = useState<User | "new" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const search = useDebounced(q.trim(), 250);
  const users = useQuery({
    queryKey: ["users", "admin", search, role, schoolId, limit],
    queryFn: () => api.get<{ total: number; items: User[] }>("/api/users", { q: search, role, school_id: schoolId || undefined, limit }),
    placeholderData: keepPreviousData,
  });
  const importFile = useMutation({
    mutationFn: (f: File) => api.upload<{ created: number; updated: number; errors: { row: number; error: string }[] }>("/api/users/import", f),
    onSuccess: (r) => {
      toast(s.imported(r.created, r.updated, r.errors.length));
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  return (
    <div>
      <PageHeader
        title={s.title}
        subtitle={s.subtitle}
        actions={
          <>
            <Button variant="ghost" size="sm" icon={<FileSpreadsheet className="size-4" />} onClick={() => void download("/api/users/import/template", undefined, "staff.xlsx")}>
              {s.template}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.json,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile.mutate(f);
                e.target.value = "";
              }}
            />
            <Button variant="secondary" size="sm" loading={importFile.isPending} icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
              {s.import}
            </Button>
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEdit("new")}>
              {t.common.actions.add}
            </Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-[1fr_260px_200px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <Input type="search" className="pl-9" placeholder={s.searchPlaceholder} value={q} onChange={(e) => { setQ(e.target.value); setLimit(100); }} aria-label={s.searchAria} />
        </div>
        <Select value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setLimit(100); }} aria-label={s.school}>
          <option value="">{s.allSchools}</option>
          {structure.data?.schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select value={role} onChange={(e) => { setRole(e.target.value); setLimit(100); }} aria-label={s.role}>
          <option value="">{s.allRoles}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabels()[r]}
            </option>
          ))}
        </Select>
      </div>
      <Card className="overflow-hidden">
        {users.isLoading ? (
          <RowsSkeleton rows={8} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{s.cols.name}</th>
                  <th className="px-3 py-2.5 font-medium">{s.cols.schoolPosition}</th>
                  <th className="px-3 py-2.5 font-medium">{s.cols.roles}</th>
                  <th className="px-3 py-2.5 font-medium">{s.cols.status}</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.data?.items.map((u) => (
                  <tr key={u.id} className={u.is_active ? "" : "opacity-50"}>
                    <td className="px-5 py-3">
                      <div className="font-medium">{u.full_name}</div>
                      <div className="text-xs text-gray-500">{u.email ?? <span className="text-gray-400">{s.emailPending}</span>}</div>
                    </td>
                    <td className="px-3 py-3 text-gray-600">
                      {u.school_name ?? u.managed_school_name ?? <span className="text-gray-400">{s.noSchool}</span>}
                      {u.position && <div className="text-xs text-gray-400">{u.position}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <Badge key={r} tone={r === "admin" ? "red" : r === "teacher" ? "gray" : "blue"}>
                            {roleLabels()[r]}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3">{u.is_faculty ? <Badge tone="green">{s.inMailing}</Badge> : <Badge>{s.notFaculty}</Badge>}</td>
                    <td className="px-3 py-3 text-right">
                      <button className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100" onClick={() => setEdit(u)} aria-label={s.editAria}>
                        <Pencil className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-5 py-2.5 text-xs text-gray-500">
          <span className="tabular">
            {s.shown(users.data?.items.length ?? 0, users.data?.total ?? 0)}
          </span>
          {users.data && users.data.items.length < users.data.total && (
            <Button size="sm" variant="secondary" loading={users.isFetching} onClick={() => setLimit((l) => l + 100)}>
              {s.showMore}
            </Button>
          )}
        </div>
      </Card>
      {edit && <UserModal key={edit === "new" ? "new" : edit.id} user={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
