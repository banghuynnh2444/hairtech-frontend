import { useEffect, useMemo, useState } from "react";
import {
  createClient,
  deleteClient,
  listClients,
  updateClient,
  type ClientInput,
  type ClientRecord,
} from "../services/clients";
import { listClientDiagrams, type DiagramSummary } from "../services/diagrams";

interface ClientPanelProps {
  activeClient: ClientRecord | null;
  activeProjectId: string | null;
  projectsRevision: number;
  onSelectClient: (client: ClientRecord | null) => Promise<void> | void;
  onCreateProject: (
    client: ClientRecord,
    name: string,
    notes: string,
  ) => Promise<DiagramSummary>;
  onOpenProject: (
    client: ClientRecord,
    project: DiagramSummary,
  ) => Promise<void>;
  onDeleteProject: (project: DiagramSummary) => Promise<void>;
}

const emptyForm: ClientInput = { name: "", phone: "", note: "" };

function messageFrom(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { message?: string } } })
      .response;
    if (response?.data?.message) return response.data.message;
  }
  if (error instanceof Error) return error.message;
  return "Không thể hoàn tất thao tác. Vui lòng thử lại.";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("vi-VN").format(date);
}

export function ClientPanel({
  activeClient,
  activeProjectId,
  projectsRevision,
  onSelectClient,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
}: ClientPanelProps) {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [projects, setProjects] = useState<DiagramSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ClientRecord | "new" | null>(null);
  const [form, setForm] = useState<ClientInput>(emptyForm);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectNotes, setProjectNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const loadCustomers = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listClients();
      setClients(result);
      if (activeClient) {
        const refreshed = result.find(
          (client) => client.id === activeClient.id,
        );
        if (!refreshed) await onSelectClient(null);
      }
    } catch (loadError) {
      setError(messageFrom(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCustomers();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!activeClient) {
      setProjects([]);
      return;
    }
    setProjectsLoading(true);
    setError("");
    void listClientDiagrams(activeClient.id)
      .then((result) => {
        if (!cancelled) setProjects(result);
      })
      .catch((loadError) => {
        if (!cancelled) setError(messageFrom(loadError));
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeClient?.id, projectsRevision]);

  const filteredClients = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("vi");
    if (!query) return clients;
    return clients.filter((client) =>
      `${client.name} ${client.phone ?? ""}`
        .toLocaleLowerCase("vi")
        .includes(query),
    );
  }, [clients, search]);

  const beginCreate = () => {
    setEditing("new");
    setForm(emptyForm);
    setError("");
  };

  const beginEdit = (client: ClientRecord) => {
    setEditing(client);
    setForm({
      name: client.name,
      phone: client.phone ?? "",
      note: client.note ?? "",
    });
    setError("");
  };

  const submitClient = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        phone: form.phone?.trim() || null,
        note: form.note?.trim() || null,
      };
      if (editing === "new") {
        const created = await createClient(payload);
        setClients((current) => [created, ...current]);
        await onSelectClient(created);
      } else if (editing) {
        const updated = await updateClient(editing.id, payload);
        setClients((current) =>
          current.map((client) =>
            client.id === updated.id ? updated : client,
          ),
        );
        if (activeClient?.id === updated.id) await onSelectClient(updated);
      }
      setEditing(null);
      setForm(emptyForm);
    } catch (submitError) {
      setError(messageFrom(submitError));
    } finally {
      setBusy(false);
    }
  };

  const removeClient = async (client: ClientRecord) => {
    if (
      !confirm(
        `Xóa hồ sơ “${client.name}”? Project đang liên kết phải được xóa trước.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await deleteClient(client.id);
      setClients((current) => current.filter((item) => item.id !== client.id));
      if (activeClient?.id === client.id) await onSelectClient(null);
    } catch (removeError) {
      setError(messageFrom(removeError));
    } finally {
      setBusy(false);
    }
  };

  const submitProject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeClient || !projectName.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const created = await onCreateProject(
        activeClient,
        projectName.trim(),
        projectNotes.trim(),
      );
      setProjects((current) => [created, ...current]);
      setProjectFormOpen(false);
      setProjectName("");
      setProjectNotes("");
    } catch (createError) {
      setError(messageFrom(createError));
    } finally {
      setBusy(false);
    }
  };

  const removeProject = async (project: DiagramSummary) => {
    if (
      !confirm(
        `Xóa project “${project.name}”? Thao tác này không thể hoàn tác.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await onDeleteProject(project);
      setProjects((current) =>
        current.filter((item) => item.id !== project.id),
      );
    } catch (removeError) {
      setError(messageFrom(removeError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="clients-workspace">
      <section className="client-directory" aria-label="Danh sách khách hàng">
        <div className="client-panel-heading">
          <div>
            <span className="eyebrow">Khách hàng</span>
            <h2>Hồ sơ salon</h2>
          </div>
          <button className="primary compact-button" onClick={beginCreate}>
            + Thêm
          </button>
        </div>
        <input
          className="client-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm theo tên hoặc số điện thoại"
          aria-label="Tìm khách hàng"
        />
        {editing && (
          <form className="client-form" onSubmit={submitClient}>
            <strong>
              {editing === "new" ? "Khách hàng mới" : "Cập nhật hồ sơ"}
            </strong>
            <label>
              Tên khách hàng
              <input
                autoFocus
                value={form.name}
                maxLength={200}
                required
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </label>
            <label>
              Số điện thoại
              <input
                value={form.phone ?? ""}
                maxLength={32}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
              />
            </label>
            <label>
              Ghi chú
              <textarea
                value={form.note ?? ""}
                maxLength={5000}
                onChange={(event) =>
                  setForm({ ...form, note: event.target.value })
                }
              />
            </label>
            <div className="btnrow">
              <button className="primary" disabled={busy}>
                Lưu hồ sơ
              </button>
              <button type="button" onClick={() => setEditing(null)}>
                Hủy
              </button>
            </div>
          </form>
        )}
        <div className="client-list">
          {loading && <p className="empty-state">Đang tải khách hàng…</p>}
          {!loading && filteredClients.length === 0 && (
            <p className="empty-state">
              Chưa có khách hàng. Bấm “Thêm” để tạo hồ sơ đầu tiên.
            </p>
          )}
          {filteredClients.map((client) => (
            <article
              key={client.id}
              className={`client-list-card ${activeClient?.id === client.id ? "active" : ""}`}
            >
              <button
                className="client-select"
                onClick={() => {
                  void Promise.resolve(onSelectClient(client)).catch(
                    (selectError) => setError(messageFrom(selectError)),
                  );
                }}
              >
                <span className="client-avatar">
                  {client.name.trim().slice(0, 1).toLocaleUpperCase("vi")}
                </span>
                <span>
                  <strong>{client.name}</strong>
                  <small>{client.phone || "Chưa có số điện thoại"}</small>
                </span>
              </button>
              <div className="client-card-actions">
                <button onClick={() => beginEdit(client)}>Sửa</button>
                <button
                  className="danger-text"
                  onClick={() => void removeClient(client)}
                >
                  Xóa
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="client-history" aria-label="Lịch sử project">
        {!activeClient ? (
          <div className="client-empty-hero">
            <span>◎</span>
            <h2>Chọn một khách hàng</h2>
            <p>Hồ sơ và lịch sử kỹ thuật sẽ xuất hiện tại đây.</p>
          </div>
        ) : (
          <>
            <div className="client-detail-header">
              <div>
                <span className="eyebrow">Hồ sơ đang chọn</span>
                <h2>{activeClient.name}</h2>
                <p>
                  {activeClient.phone || "Chưa có số điện thoại"}
                  {activeClient.note ? ` · ${activeClient.note}` : ""}
                </p>
              </div>
              <button
                className="primary"
                onClick={() => setProjectFormOpen(true)}
              >
                + Project mới
              </button>
            </div>
            {projectFormOpen && (
              <form className="project-form" onSubmit={submitProject}>
                <label>
                  Tên project
                  <input
                    autoFocus
                    required
                    maxLength={200}
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    placeholder="Ví dụ: Layer + Uốn S"
                  />
                </label>
                <label>
                  Ghi chú
                  <textarea
                    maxLength={5000}
                    value={projectNotes}
                    onChange={(event) => setProjectNotes(event.target.value)}
                    placeholder="Kỹ thuật, mong muốn hoặc lưu ý"
                  />
                </label>
                <div className="btnrow">
                  <button className="primary" disabled={busy}>
                    Tạo và mở
                  </button>
                  <button
                    type="button"
                    onClick={() => setProjectFormOpen(false)}
                  >
                    Hủy
                  </button>
                </div>
              </form>
            )}
            <div className="project-list">
              {projectsLoading && (
                <p className="empty-state">Đang tải lịch sử project…</p>
              )}
              {!projectsLoading && projects.length === 0 && (
                <p className="empty-state">Khách hàng này chưa có project.</p>
              )}
              {projects.map((project) => (
                <article
                  key={project.id}
                  className={`project-card ${activeProjectId === project.id ? "active" : ""}`}
                >
                  <div className="project-card-icon">✦</div>
                  <div className="project-card-copy">
                    <strong>{project.name}</strong>
                    <span>{project.notes || "Sơ đồ kỹ thuật 3D"}</span>
                    <small>
                      Cập nhật{" "}
                      {formatDate(project.updated_at || project.created_at)}
                    </small>
                  </div>
                  <div className="project-card-actions">
                    <button
                      className="primary"
                      onClick={() => {
                        void onOpenProject(activeClient, project).catch(
                          (openError) => setError(messageFrom(openError)),
                        );
                      }}
                    >
                      {activeProjectId === project.id ? "Đang mở" : "Mở"}
                    </button>
                    <button
                      className="danger-text"
                      onClick={() => void removeProject(project)}
                    >
                      Xóa
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        {error && (
          <p className="panel-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
