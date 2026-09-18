import { useEffect, useState } from "react";
import {
  createClient,
  listClients,
  type ClientRecord,
} from "../services/clients";

interface SaveNewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeClient: ClientRecord | null;
  defaultNotes?: string;
  onSave: (params: {
    name: string;
    clientId: string | null;
    notes: string;
  }) => Promise<void>;
}

export function SaveNewProjectModal({
  isOpen,
  onClose,
  activeClient,
  defaultNotes = "",
  onSave,
}: SaveNewProjectModalProps) {
  const [projectName, setProjectName] = useState("");
  const [notes, setNotes] = useState("");
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [isCreatingNewClient, setIsCreatingNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString("vi-VN");
    const timeStr = now.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    setProjectName(`Thiết kế 3D - ${dateStr} ${timeStr}`);
    setNotes(defaultNotes || "");
    setError("");
    setIsCreatingNewClient(false);
    setNewClientName("");
    setNewClientPhone("");

    void listClients()
      .then((res) => {
        setClients(res);
        if (activeClient) {
          setSelectedClientId(activeClient.id);
        } else if (res.length > 0) {
          setSelectedClientId("");
        }
      })
      .catch(() => {
        setClients([]);
      });
  }, [isOpen, activeClient, defaultNotes]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = projectName.trim();
    if (!trimmedName) {
      setError("Vui lòng nhập tên dự án.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      let finalClientId: string | null = selectedClientId || null;

      if (isCreatingNewClient) {
        const trimmedClientName = newClientName.trim();
        if (!trimmedClientName) {
          setError("Vui lòng nhập tên khách hàng mới.");
          setSubmitting(false);
          return;
        }
        const createdClient = await createClient({
          name: trimmedClientName,
          phone: newClientPhone.trim() || null,
        });
        finalClientId = createdClient.id;
      }

      await onSave({
        name: trimmedName,
        clientId: finalClientId,
        notes: notes.trim(),
      });
      onClose();
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Không thể lưu dự án. Vui lòng thử lại.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="settings-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="settings-modal"
        style={{ maxWidth: 520 }}
        role="dialog"
        aria-modal="true"
      >
        <div className="settings-modal-header">
          <div className="settings-modal-title">
            <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>💾</span>
              <span>Lưu Bản Thiết Kế Mới</span>
            </h3>
            <p>Đặt tên để lưu toàn bộ không gian 3D đang vẽ vào hệ thống</p>
          </div>
          <button
            type="button"
            className="settings-modal-close"
            onClick={onClose}
            disabled={submitting}
            title="Đóng"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="settings-modal-body" style={{ padding: "20px 24px" }}>
            {error && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  color: "#fca5a5",
                  padding: "10px 14px",
                  borderRadius: 8,
                  fontSize: 13,
                  marginBottom: 16,
                }}
              >
                ⚠️ {error}
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#94a3b8",
                  marginBottom: 6,
                }}
              >
                Tên dự án / Mẫu tóc <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="VD: Cắt Bob Layer tầng cao, Uốn sóng C bung..."
                autoFocus
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: 8,
                  color: "#fff",
                  fontSize: 14,
                  outline: "none",
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#94a3b8",
                  }}
                >
                  Khách hàng liên kết
                </label>
                <button
                  type="button"
                  onClick={() => setIsCreatingNewClient((prev) => !prev)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#38bdf8",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {isCreatingNewClient ? "← Chọn từ danh sách" : "+ Thêm khách mới"}
                </button>
              </div>

              {!isCreatingNewClient ? (
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  disabled={submitting}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "rgba(15, 20, 38, 0.9)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 13,
                    outline: "none",
                  }}
                >
                  <option value="">-- Lưu tự do (Chưa gán khách hàng) --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      👤 {c.name} {c.phone ? `(${c.phone})` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: 8,
                    padding: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div>
                    <input
                      type="text"
                      placeholder="Tên khách hàng mới *"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      disabled={submitting}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        borderRadius: 6,
                        color: "#fff",
                        fontSize: 13,
                        outline: "none",
                      }}
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Số điện thoại (tùy chọn)"
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(e.target.value)}
                      disabled={submitting}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        borderRadius: 6,
                        color: "#fff",
                        fontSize: 13,
                        outline: "none",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 8 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#94a3b8",
                  marginBottom: 6,
                }}
              >
                Ghi chú kỹ thuật (tùy chọn)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ghi chú về thuốc uốn, cỡ trục, góc độ kéo mảng..."
                rows={3}
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: 8,
                  color: "#fff",
                  fontSize: 13,
                  outline: "none",
                  resize: "vertical",
                }}
              />
            </div>
          </div>

          <div
            className="settings-modal-footer"
            style={{
              padding: "14px 24px",
              display: "flex",
              justifyContent: "flex-end",
              gap: 12,
              background: "rgba(18, 24, 43, 0.85)",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: "8px 16px",
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: 8,
                color: "#94a3b8",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: "8px 20px",
                background: "linear-gradient(135deg, #2563eb, #3b82f6)",
                border: "none",
                borderRadius: 8,
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(37, 99, 235, 0.4)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {submitting ? (
                <>
                  <span>⏳</span>
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <span>💾</span>
                  <span>Tạo & Lưu Dự Án</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
