import React, { useState, useEffect, useCallback } from "react";
import {
  getAdminStats,
  listAdminUsers,
  approveUser,
  revokeUser,
  assignSubscription,
  resetUserDevice,
  AdminStats,
  AdminUserItem,
  ListUsersParams,
} from "../services/admin";

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 15;

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "active" | "expired"
  >("all");

  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Sub-modals
  const [subModalUser, setSubModalUser] = useState<AdminUserItem | null>(null);
  const [planTier, setPlanTier] = useState<"pro_monthly" | "pro_yearly">(
    "pro_monthly",
  );
  const [durationMonths, setDurationMonths] = useState<number>(1);
  const [submittingSub, setSubmittingSub] = useState(false);

  const [resetModalUser, setResetModalUser] = useState<AdminUserItem | null>(
    null,
  );
  const [submittingReset, setSubmittingReset] = useState(false);

  const showToast = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((current) => (current?.message === message ? null : current));
    }, 4000);
  };

  const loadStats = useCallback(async () => {
    try {
      const data = await getAdminStats();
      setStats(data);
    } catch (err: any) {
      console.error("Failed to load admin stats:", err);
    }
  }, []);

  const loadUsers = useCallback(
    async (
      targetPage: number = page,
      targetSearch: string = search,
      targetStatus = statusFilter,
    ) => {
      setLoading(true);
      try {
        const params: ListUsersParams = {
          page: targetPage,
          limit,
          status: targetStatus,
        };
        if (targetSearch.trim()) {
          params.search = targetSearch.trim();
        }
        const data = await listAdminUsers(params);
        setUsers(data.users);
        setTotalUsers(data.total);
        setPage(data.page);
      } catch (err: any) {
        showToast(
          "error",
          err.response?.data?.message ||
            err.message ||
            "Không thể tải danh sách tài khoản salon.",
        );
      } finally {
        setLoading(false);
      }
    },
    [page, search, statusFilter],
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([loadStats(), loadUsers()]);
  }, [loadStats, loadUsers]);

  useEffect(() => {
    if (isOpen) {
      void refreshAll();
    }
  }, [isOpen, refreshAll]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (subModalUser) {
          setSubModalUser(null);
        } else if (resetModalUser) {
          setResetModalUser(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, subModalUser, resetModalUser, onClose]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
    void loadUsers(1, searchInput, statusFilter);
  };

  const handleFilterChange = (
    newStatus: "all" | "pending" | "active" | "expired",
  ) => {
    setStatusFilter(newStatus);
    setPage(1);
    void loadUsers(1, search, newStatus);
  };

  const handleApprove = async (user: AdminUserItem) => {
    setActionLoadingId(user.id);
    try {
      const res = await approveUser(user.id);
      showToast("success", res.message || `Đã duyệt salon ${user.email}`);
      await refreshAll();
    } catch (err: any) {
      showToast(
        "error",
        err.response?.data?.message || err.message || "Duyệt tài khoản thất bại.",
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRevoke = async (user: AdminUserItem) => {
    if (
      !window.confirm(
        `Bạn có chắc chắn muốn khóa quyền truy cập của ${user.email}? Salon này sẽ không thể đăng nhập hoặc dùng hệ thống.`,
      )
    ) {
      return;
    }
    setActionLoadingId(user.id);
    try {
      const res = await revokeUser(user.id);
      showToast("success", res.message || `Đã khóa salon ${user.email}`);
      await refreshAll();
    } catch (err: any) {
      showToast(
        "error",
        err.response?.data?.message || err.message || "Khóa tài khoản thất bại.",
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAssignSubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subModalUser) return;
    setSubmittingSub(true);
    try {
      const res = await assignSubscription(
        subModalUser.id,
        planTier,
        durationMonths,
      );
      showToast("success", res.message || "Đã cấp gói thành công!");
      setSubModalUser(null);
      await refreshAll();
    } catch (err: any) {
      showToast(
        "error",
        err.response?.data?.message || err.message || "Cấp gói thất bại.",
      );
    } finally {
      setSubmittingSub(false);
    }
  };

  const handleResetDeviceSubmit = async () => {
    if (!resetModalUser) return;
    setSubmittingReset(true);
    try {
      const res = await resetUserDevice(resetModalUser.id);
      showToast("success", res.message || "Đã mở khóa thiết bị thành công!");
      setResetModalUser(null);
      await refreshAll();
    } catch (err: any) {
      showToast(
        "error",
        err.response?.data?.message ||
          err.message ||
          "Không thể mở khóa thiết bị.",
      );
    } finally {
      setSubmittingReset(false);
    }
  };

  if (!isOpen) return null;

  const totalPages = Math.max(1, Math.ceil(totalUsers / limit));

  return (
    <div className="admin-overlay" role="dialog" aria-modal="true">
      <div className="admin-modal">
        {/* MODAL HEADER */}
        <div className="admin-modal-header">
          <div className="admin-modal-title">
            <span className="admin-badge-shield">🛡️</span>
            <div>
              <h2>Quản Trị Salon & Bản Quyền HairTech 3D</h2>
              <p className="admin-modal-desc">
                Phê duyệt tài khoản salon, kích hoạt bản quyền PRO và quản lý
                khóa thiết bị phần cứng.
              </p>
            </div>
          </div>
          <div className="admin-header-actions">
            <button
              className="admin-btn-refresh"
              onClick={() => void refreshAll()}
              title="Làm mới dữ liệu"
              disabled={loading}
            >
              ↻ {loading ? "Đang tải..." : "Làm mới"}
            </button>
            <button
              className="admin-btn-close"
              onClick={onClose}
              title="Đóng bảng quản trị (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* TOAST FEEDBACK */}
        {feedback && (
          <div className={`admin-feedback-bar ${feedback.type}`}>
            <span>
              {feedback.type === "success" ? "✓" : "⚠"} {feedback.message}
            </span>
            <button onClick={() => setFeedback(null)}>✕</button>
          </div>
        )}

        {/* DASHBOARD STATS */}
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <div className="admin-stat-icon">👥</div>
            <div className="admin-stat-data">
              <div className="admin-stat-value">{stats?.totalUsers ?? "—"}</div>
              <div className="admin-stat-label">Tổng số salon đăng ký</div>
            </div>
          </div>

          <div
            className={`admin-stat-card ${
              stats && stats.pendingApprovals > 0 ? "highlight-pending" : ""
            }`}
          >
            <div className="admin-stat-icon">⏳</div>
            <div className="admin-stat-data">
              <div className="admin-stat-value">
                {stats?.pendingApprovals ?? "—"}
              </div>
              <div className="admin-stat-label">Chờ duyệt tài khoản</div>
            </div>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-icon">⚡</div>
            <div className="admin-stat-data">
              <div className="admin-stat-value text-success">
                {stats?.activeSubscribers ?? "—"}
              </div>
              <div className="admin-stat-label">Bản quyền PRO hoạt động</div>
            </div>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-icon">⚠️</div>
            <div className="admin-stat-data">
              <div className="admin-stat-value text-warning">
                {stats?.expiredSubscribers ?? "—"}
              </div>
              <div className="admin-stat-label">Hết hạn / Chưa cấp gói</div>
            </div>
          </div>
        </div>

        {/* TOOLBAR & SEARCH */}
        <div className="admin-toolbar">
          <form className="admin-search-form" onSubmit={handleSearchSubmit}>
            <div className="admin-search-input-wrap">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Tìm salon theo Email hoặc Họ tên..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              {searchInput && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => {
                    setSearchInput("");
                    setSearch("");
                    void loadUsers(1, "", statusFilter);
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            <button type="submit" className="admin-btn-primary">
              Tìm kiếm
            </button>
          </form>

          <div className="admin-filter-tabs">
            <button
              className={`filter-tab ${statusFilter === "all" ? "active" : ""}`}
              onClick={() => handleFilterChange("all")}
            >
              Tất cả ({stats?.totalUsers ?? 0})
            </button>
            <button
              className={`filter-tab ${
                statusFilter === "pending" ? "active" : ""
              }`}
              onClick={() => handleFilterChange("pending")}
            >
              Chờ duyệt{" "}
              {stats && stats.pendingApprovals > 0 && (
                <span className="filter-badge">{stats.pendingApprovals}</span>
              )}
            </button>
            <button
              className={`filter-tab ${
                statusFilter === "active" ? "active" : ""
              }`}
              onClick={() => handleFilterChange("active")}
            >
              Đang hoạt động ({stats?.activeSubscribers ?? 0})
            </button>
            <button
              className={`filter-tab ${
                statusFilter === "expired" ? "active" : ""
              }`}
              onClick={() => handleFilterChange("expired")}
            >
              Hết hạn / Chưa gói ({stats?.expiredSubscribers ?? 0})
            </button>
          </div>
        </div>

        {/* TABLE CONTENT */}
        <div className="admin-table-container">
          {loading && users.length === 0 ? (
            <div className="admin-loading-state">
              <div className="admin-spinner"></div>
              <span>Đang tải danh sách salon...</span>
            </div>
          ) : users.length === 0 ? (
            <div className="admin-empty-state">
              <span className="admin-empty-icon">📭</span>
              <h4>Không tìm thấy salon nào</h4>
              <p>Thử thay đổi từ khóa tìm kiếm hoặc chuyển bộ lọc trạng thái.</p>
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Salon / Chủ tiệm</th>
                  <th>Phê duyệt</th>
                  <th>Gói Bản quyền</th>
                  <th>Thiết bị kích hoạt</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isBusy = actionLoadingId === u.id;
                  const hasSub = !!u.subscription;
                  const isExpired = u.subscription?.isExpired ?? true;
                  const planName =
                    u.subscription?.planTier === "pro_yearly"
                      ? "PRO Năm"
                      : u.subscription?.planTier === "pro_monthly"
                        ? "PRO Tháng"
                        : "Chưa kích hoạt";

                  const subEndDateStr = u.subscription?.currentPeriodEnd
                    ? new Date(
                        u.subscription.currentPeriodEnd,
                      ).toLocaleDateString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })
                    : null;

                  return (
                    <tr key={u.id}>
                      {/* Cột 1: Thông tin Salon */}
                      <td>
                        <div className="user-profile-cell">
                          <div className="user-avatar-circle">
                            {(u.fullName || u.email || "S")
                              .slice(0, 1)
                              .toUpperCase()}
                          </div>
                          <div className="user-details">
                            <span className="user-name">
                              {u.fullName || "Chưa đặt tên"}
                            </span>
                            <span className="user-email">{u.email}</span>
                            <span className="user-created">
                              Đăng ký:{" "}
                              {new Date(u.createdAt).toLocaleDateString(
                                "vi-VN",
                              )}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Cột 2: Trạng thái duyệt */}
                      <td>
                        {u.isApproved ? (
                          <span className="admin-badge badge-approved">
                            ✓ Đã duyệt
                          </span>
                        ) : (
                          <span className="admin-badge badge-pending">
                            ⏳ Chờ duyệt
                          </span>
                        )}
                      </td>

                      {/* Cột 3: Gói Bản quyền */}
                      <td>
                        <div className="sub-info-cell">
                          <div className="sub-plan-row">
                            <span
                              className={`admin-badge ${
                                hasSub && !isExpired
                                  ? "badge-plan-active"
                                  : "badge-plan-expired"
                              }`}
                            >
                              {planName}
                            </span>
                          </div>
                          {hasSub && subEndDateStr && (
                            <span
                              className={`sub-expiry ${
                                isExpired ? "text-danger" : "text-muted"
                              }`}
                            >
                              {isExpired
                                ? `Hết hạn: ${subEndDateStr}`
                                : `Đến: ${subEndDateStr}`}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Cột 4: Thiết bị */}
                      <td>
                        {u.activeDevice ? (
                          <div className="device-info-cell">
                            <div className="device-name-row">
                              <span className="device-icon">💻</span>
                              <span className="device-name">
                                {u.activeDevice.deviceName || "Desktop"}
                              </span>
                              <span className="device-os">
                                ({u.activeDevice.platform})
                              </span>
                            </div>
                            <span className="device-fp" title={u.activeDevice.deviceFingerprint}>
                              FP: {u.activeDevice.deviceFingerprint.slice(0, 12)}…
                            </span>
                          </div>
                        ) : (
                          <span className="device-none">Chưa liên kết máy</span>
                        )}
                      </td>

                      {/* Cột 5: Hành động */}
                      <td>
                        <div className="admin-actions-cell">
                          {!u.isApproved ? (
                            <button
                              className="admin-btn-action btn-approve"
                              onClick={() => void handleApprove(u)}
                              disabled={isBusy}
                              title="Duyệt tài khoản salon"
                            >
                              {isBusy ? "..." : "✓ Duyệt"}
                            </button>
                          ) : (
                            <button
                              className="admin-btn-action btn-revoke"
                              onClick={() => void handleRevoke(u)}
                              disabled={isBusy}
                              title="Thu hồi quyền sử dụng"
                            >
                              {isBusy ? "..." : "Khóa"}
                            </button>
                          )}

                          <button
                            className="admin-btn-action btn-sub"
                            onClick={() => {
                              setSubModalUser(u);
                              setPlanTier(
                                u.subscription?.planTier === "pro_yearly"
                                  ? "pro_yearly"
                                  : "pro_monthly",
                              );
                              setDurationMonths(
                                u.subscription?.planTier === "pro_yearly"
                                  ? 12
                                  : 1,
                              );
                            }}
                            disabled={isBusy}
                            title="Gia hạn hoặc cấp gói bản quyền"
                          >
                            ⭐ Gói PRO
                          </button>

                          {u.activeDevice && (
                            <button
                              className="admin-btn-action btn-reset"
                              onClick={() => setResetModalUser(u)}
                              disabled={isBusy}
                              title="Mở khóa thiết bị để salon đổi máy"
                            >
                              🔄 Đổi máy
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* PAGINATION */}
        <div className="admin-pagination">
          <span className="admin-pagination-info">
            Trang {page} / {totalPages} (Tổng {totalUsers} salon)
          </span>
          <div className="admin-pagination-btns">
            <button
              className="admin-btn-page"
              disabled={page <= 1 || loading}
              onClick={() => {
                const prev = page - 1;
                setPage(prev);
                void loadUsers(prev, search, statusFilter);
              }}
            >
              ← Trang trước
            </button>
            <button
              className="admin-btn-page"
              disabled={page >= totalPages || loading}
              onClick={() => {
                const next = page + 1;
                setPage(next);
                void loadUsers(next, search, statusFilter);
              }}
            >
              Trang sau →
            </button>
          </div>
        </div>
      </div>

      {/* SUB-MODAL 1: CẤP / GIA HẠN GÓI */}
      {subModalUser && (
        <div className="admin-submodal-overlay">
          <div className="admin-submodal-card">
            <div className="submodal-header">
              <h3>⭐ Cấp / Gia hạn Gói Bản Quyền</h3>
              <button
                className="admin-btn-close-sm"
                onClick={() => setSubModalUser(null)}
              >
                ✕
              </button>
            </div>
            <p className="submodal-user-desc">
              Salon: <strong>{subModalUser.fullName || subModalUser.email}</strong>{" "}
              ({subModalUser.email})
            </p>

            <form onSubmit={handleAssignSubSubmit}>
              <div className="admin-form-group">
                <label>Loại gói dịch vụ:</label>
                <div className="admin-radio-group">
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="planTier"
                      value="pro_monthly"
                      checked={planTier === "pro_monthly"}
                      onChange={() => {
                        setPlanTier("pro_monthly");
                        setDurationMonths(1);
                      }}
                    />
                    <span>Gói Pro Tháng</span>
                  </label>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="planTier"
                      value="pro_yearly"
                      checked={planTier === "pro_yearly"}
                      onChange={() => {
                        setPlanTier("pro_yearly");
                        setDurationMonths(12);
                      }}
                    />
                    <span>Gói Pro Năm</span>
                  </label>
                </div>
              </div>

              <div className="admin-form-group">
                <label>Thời hạn cấp (Số tháng):</label>
                <div className="quick-duration-btns">
                  {[1, 3, 6, 12, 24].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`btn-duration ${
                        durationMonths === m ? "selected" : ""
                      }`}
                      onClick={() => setDurationMonths(m)}
                    >
                      {m} tháng
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={durationMonths}
                  onChange={(e) =>
                    setDurationMonths(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  style={{ marginTop: "8px" }}
                />
              </div>

              <div className="admin-submodal-actions">
                <button
                  type="button"
                  className="admin-btn-secondary"
                  onClick={() => setSubModalUser(null)}
                  disabled={submittingSub}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="admin-btn-primary"
                  disabled={submittingSub}
                >
                  {submittingSub ? "Đang xử lý..." : "Xác nhận cấp gói"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUB-MODAL 2: RESET THIẾT BỊ */}
      {resetModalUser && (
        <div className="admin-submodal-overlay">
          <div className="admin-submodal-card">
            <div className="submodal-header">
              <h3>🔄 Mở Khóa Thiết Bị Đang Dùng</h3>
              <button
                className="admin-btn-close-sm"
                onClick={() => setResetModalUser(null)}
              >
                ✕
              </button>
            </div>
            <div className="reset-device-warning">
              <p>
                Bạn sắp mở khóa thiết bị phần cứng của salon:
                <br />
                <strong>{resetModalUser.email}</strong>
              </p>
              {resetModalUser.activeDevice && (
                <div className="reset-device-info-box">
                  <div>Máy hiện tại: <strong>{resetModalUser.activeDevice.deviceName}</strong></div>
                  <div>Hệ điều hành: {resetModalUser.activeDevice.platform}</div>
                  <div>Fingerprint: <code>{resetModalUser.activeDevice.deviceFingerprint.slice(0, 16)}…</code></div>
                </div>
              )}
              <p className="warning-text">
                ⚠️ Sau khi mở khóa, liên kết máy này sẽ bị hủy bỏ. Salon có thể
                đăng nhập trên máy tính mới hoặc cài đặt lại mà không bị báo lỗi
                thiết bị.
              </p>
            </div>
            <div className="admin-submodal-actions">
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={() => setResetModalUser(null)}
                disabled={submittingReset}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="admin-btn-warning"
                onClick={() => void handleResetDeviceSubmit()}
                disabled={submittingReset}
              >
                {submittingReset ? "Đang mở khóa..." : "Mở khóa thiết bị ngay"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
