import React, { useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { checkForAppUpdate } from "../services/updater";
import { UpdateModal } from "./UpdateModal";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: string;
  onThemeChange: (theme: string) => void;
  bg3dColor: string;
  onBg3dColorChange: (color: string) => void;
  isMeshFillVisible: boolean;
  onToggleMeshFill: () => void;
  isCageVisible: boolean;
  onToggleCage: () => void;
  isSnapEnabled: boolean;
  onToggleSnap: () => void;
  isAdmin: boolean;
  onOpenAdmin: () => void;
  onLogout: () => void;
  userEmail?: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  onThemeChange,
  bg3dColor,
  onBg3dColorChange,
  isMeshFillVisible,
  onToggleMeshFill,
  isCageVisible,
  onToggleCage,
  isSnapEnabled,
  onToggleSnap,
  isAdmin,
  onOpenAdmin,
  onLogout,
  userEmail = "bang19112005@gmail.com",
}) => {
  const [activeTab, setActiveTab] = useState<"general" | "viewport" | "account">("general");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<string | null>(null);
  const [manualUpdate, setManualUpdate] = useState<Update | null>(null);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateResult(null);
    try {
      const update = await checkForAppUpdate();
      if (update) {
        setManualUpdate(update);
      } else {
        setUpdateResult("Bạn đang sử dụng phiên bản mới nhất (v0.3.0) ✨");
      }
    } catch {
      setUpdateResult("Không thể kiểm tra cập nhật lúc này. Vui lòng thử lại sau.");
    } finally {
      setCheckingUpdate(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true">
      <div className="settings-modal">
        {/* HEADER */}
        <div className="settings-modal-header">
          <div className="settings-modal-title">
            <span className="settings-gear-badge">⚙️</span>
            <div>
              <h3>Cài Đặt Hệ Thống & Tùy Chọn</h3>
              <p>Tùy biến giao diện, không gian 3D và quản lý tài khoản</p>
            </div>
          </div>
          <button className="settings-close-btn" onClick={onClose} title="Đóng cài đặt (Esc)">
            ✕
          </button>
        </div>

        {/* TABS NAVIGATION */}
        <div className="settings-nav-tabs">
          <button
            className={`settings-tab-btn ${activeTab === "general" ? "active" : ""}`}
            onClick={() => setActiveTab("general")}
          >
            🎨 Giao diện & Chủ đề
          </button>
          <button
            className={`settings-tab-btn ${activeTab === "viewport" ? "active" : ""}`}
            onClick={() => setActiveTab("viewport")}
          >
            🌐 Không gian 3D & Lưới
          </button>
          <button
            className={`settings-tab-btn ${activeTab === "account" ? "active" : ""}`}
            onClick={() => setActiveTab("account")}
          >
            👤 Tài khoản & Quản trị
          </button>
        </div>

        {/* BODY CONTENT */}
        <div className="settings-modal-body">
          {/* TAB 1: GIAO DIỆN & CHỦ ĐỀ */}
          {activeTab === "general" && (
            <div className="settings-section">
              <div className="settings-row">
                <div className="settings-label-col">
                  <strong>Chủ đề ứng dụng (Theme)</strong>
                  <span>Chọn phong cách hiển thị màu sắc tổng thể</span>
                </div>
                <div className="settings-theme-cards">
                  <button
                    className={`theme-card ${currentTheme === "luxury" ? "selected" : ""}`}
                    onClick={() => onThemeChange("luxury")}
                  >
                    <div className="theme-card-preview luxury-preview"></div>
                    <span>🌙 Midnight Studio</span>
                  </button>
                  <button
                    className={`theme-card ${currentTheme === "neon" ? "selected" : ""}`}
                    onClick={() => onThemeChange("neon")}
                  >
                    <div className="theme-card-preview neon-preview"></div>
                    <span>⚡ Neon Cyberpunk</span>
                  </button>
                  <button
                    className={`theme-card ${currentTheme === "light" ? "selected" : ""}`}
                    onClick={() => onThemeChange("light")}
                  >
                    <div className="theme-card-preview light-preview"></div>
                    <span>☀️ Elegant Light</span>
                  </button>
                </div>
              </div>

              <div className="settings-divider"></div>

              <div className="settings-row">
                <div className="settings-label-col">
                  <strong>Màu nền Viewport 3D</strong>
                  <span>Chọn phông nền tương phản phù hợp khi soi góc tóc</span>
                </div>
                <div className="settings-color-options">
                  <button
                    className={`color-btn ${bg3dColor === "0xffffff" ? "selected" : ""}`}
                    onClick={() => onBg3dColorChange("0xffffff")}
                  >
                    <span className="color-dot" style={{ background: "#ffffff" }}></span>
                    Nền Trắng
                  </button>
                  <button
                    className={`color-btn ${bg3dColor === "0x0b0a09" ? "selected" : ""}`}
                    onClick={() => onBg3dColorChange("0x0b0a09")}
                  >
                    <span className="color-dot" style={{ background: "#0b0a09" }}></span>
                    Nền Đen
                  </button>
                  <button
                    className={`color-btn ${bg3dColor === "0x1e293b" ? "selected" : ""}`}
                    onClick={() => onBg3dColorChange("0x1e293b")}
                  >
                    <span className="color-dot" style={{ background: "#1e293b" }}></span>
                    Nền Xám Đậm
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: KHÔNG GIAN 3D & LƯỚI */}
          {activeTab === "viewport" && (
            <div className="settings-section">
              <div className="settings-toggle-row">
                <div className="settings-label-col">
                  <strong>Lồng Lưới Cầu 3D (Cage Grid)</strong>
                  <span>Hiển thị khung lưới bao quanh đầu giúp căn góc độ và đường chân trời</span>
                </div>
                <label className="switch-toggle">
                  <input
                    type="checkbox"
                    checked={isCageVisible}
                    onChange={onToggleCage}
                  />
                  <span className="slider round"></span>
                </label>
              </div>

              <div className="settings-divider"></div>

              <div className="settings-toggle-row">
                <div className="settings-label-col">
                  <strong>Màu Khối Mảng Tóc (Mesh Fill)</strong>
                  <span>Hiển thị mặt phẳng bóng mờ cho các tép tóc hoặc chỉ để khung viền dây</span>
                </div>
                <label className="switch-toggle">
                  <input
                    type="checkbox"
                    checked={isMeshFillVisible}
                    onChange={onToggleMeshFill}
                  />
                  <span className="slider round"></span>
                </label>
              </div>

              <div className="settings-divider"></div>

              <div className="settings-toggle-row">
                <div className="settings-label-col">
                  <strong>Bắt Dính Điểm (Snap)</strong>
                  <span>Tự động hút điểm vẽ vào các đường chia ngôi và chân tóc gần nhất</span>
                </div>
                <label className="switch-toggle">
                  <input
                    type="checkbox"
                    checked={isSnapEnabled}
                    onChange={onToggleSnap}
                  />
                  <span className="slider round"></span>
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: TÀI KHOẢN & QUẢN TRỊ */}
          {activeTab === "account" && (
            <div className="settings-section">
              <div className="settings-account-card">
                <div className="account-avatar">
                  {userEmail.slice(0, 1).toUpperCase()}
                </div>
                <div className="account-info">
                  <div className="account-email-row">
                    <strong>{userEmail}</strong>
                    <span className="badge-pro-tag">PRO LICENSE</span>
                  </div>
                  <span className="account-role-tag">
                    {isAdmin ? "🛡️ Quản trị viên tối cao (Super Admin)" : "Salon Chuyên Nghiệp"}
                  </span>
                </div>
              </div>

              {isAdmin && (
                <div className="admin-shortcut-box">
                  <div>
                    <strong>Trung Tâm Quản Trị Hệ Thống</strong>
                    <p>Phê duyệt salon, phân bổ bản quyền PRO và mở khóa thiết bị đổi máy.</p>
                  </div>
                  <button
                    className="btn-open-admin-panel"
                    onClick={() => {
                      onClose();
                      onOpenAdmin();
                    }}
                  >
                    🛡️ Mở Bảng Quản Trị
                  </button>
                </div>
              )}

              <div className="admin-shortcut-box" style={{ borderColor: "rgba(14, 165, 233, 0.3)" }}>
                <div>
                  <strong>Cập nhật phần mềm (v0.3.0)</strong>
                  <p>{updateResult || "Kiểm tra và tải về phiên bản HairTech mới nhất tự động."}</p>
                </div>
                <button
                  className="btn-open-admin-panel"
                  style={{ background: "linear-gradient(135deg, #0284c7, #06b6d4)", minWidth: "140px" }}
                  disabled={checkingUpdate}
                  onClick={handleCheckUpdate}
                >
                  {checkingUpdate ? "⏳ Đang kiểm tra..." : "🔄 Kiểm tra ngay"}
                </button>
              </div>

              <div className="settings-divider"></div>

              <div className="settings-danger-zone">
                <div>
                  <strong>Kết thúc phiên làm việc</strong>
                  <p>Đăng xuất tài khoản an toàn khỏi máy tính này.</p>
                </div>
                <button
                  className="btn-logout-danger"
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                >
                  ↗ Đăng xuất tài khoản
                </button>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="settings-modal-footer">
          <span className="settings-version-note">HairTech 3D • Phiên bản Pro v0.3.0</span>
          <button className="settings-btn-done" onClick={onClose}>
            Xong & Đóng
          </button>
        </div>
      </div>

      {manualUpdate && (
        <UpdateModal
          update={manualUpdate}
          onClose={() => setManualUpdate(null)}
        />
      )}
    </div>
  );
};
