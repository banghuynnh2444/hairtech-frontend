import React from "react";
import type { ClientRecord } from "../services/clients";
import type { DiagramDetail } from "../services/diagrams";

export type SaveStatus = "no-project" | "saved" | "unsaved" | "saving" | "error";
export type ViewMode = "standard" | "focus" | "zen";

interface WorkspaceHeaderProps {
  activeClient: ClientRecord | null;
  activeProject: DiagramDetail | null;
  saveStatus: SaveStatus;
  isAdmin?: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenAdmin?: () => void;
  onOpenSettings: () => void;
  onSave: () => void;
  onSaveCopy: () => void;
}

const statusTextMap: Record<SaveStatus, string> = {
  "no-project": "Chưa mở",
  saved: "Đã lưu",
  unsaved: "Chưa lưu",
  saving: "Đang lưu…",
  error: "Lỗi lưu",
};

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  activeClient,
  activeProject,
  saveStatus,
  isAdmin,
  viewMode,
  onViewModeChange,
  onOpenAdmin,
  onOpenSettings,
  onSave,
  onSaveCopy,
}) => {
  return (
    <header className="workspace-header-bar">
      {/* CỘT 1: LOGO THƯƠNG HIỆU */}
      <div className="brand-logo">
        <div className="brand-mark" aria-hidden="true">
          H
        </div>
        <div className="brand-copy">
          <h1>HAIRTECH 3D</h1>
          <span>Không gian thiết kế kỹ thuật số</span>
        </div>
        <span className="badge-pro">PRO</span>
      </div>

      {/* CỘT 2: TABS ĐIỀU HƯỚNG TRUNG TÂM & BỘ CHỌN CHẾ ĐỘ XEM */}
      <div className="header-center-nav">
        <div className="workspace-nav">
          <button id="tabBtn3d" className="worktab active">
            ✦ Thiết kế 3D
          </button>
          <button id="tabBtnPhoto" className="worktab">
            ▧ Ảnh tham chiếu
          </button>
          <button id="tabBtnClients" className="worktab">
            ◎ Khách hàng
          </button>
        </div>

        {/* 3 CHẾ ĐỘ XEM: TIÊU CHUẨN - MỞ RỘNG - TOÀN MÀN HÌNH */}
        <div className="view-mode-group" title="Chuyển chế độ hiển thị không gian làm việc">
          <button
            className={`view-mode-btn ${viewMode === "standard" ? "active" : ""}`}
            onClick={() => onViewModeChange("standard")}
            title="Chế độ Tiêu chuẩn (Hiển thị đầy đủ thanh công cụ)"
          >
            🗖 Chuẩn
          </button>
          <button
            className={`view-mode-btn ${viewMode === "focus" ? "active" : ""}`}
            onClick={() => onViewModeChange("focus")}
            title="Chế độ Mở rộng Viewport (Ẩn thanh công cụ 2 bên)"
          >
            ⇲ Mở rộng
          </button>
          <button
            className={`view-mode-btn ${viewMode === "zen" ? "active" : ""}`}
            onClick={() => onViewModeChange("zen")}
            title="Chế độ Toàn màn hình (Toàn cảnh không gian 3D)"
          >
            ⛶ Toàn màn hình
          </button>
        </div>
      </div>

      {/* CỘT 3: CÔNG CỤ & THIẾT LẬP */}
      <div className="header-controls">
        {/* CHIP TRẠNG THÁI THÔNG MINH */}
        <div
          className="header-status-chip"
          title={`Khách: ${activeClient?.name || "Chưa chọn"} | Project: ${activeProject?.name || "Chưa mở project"}`}
        >
          <span className="chip-client">
            👤 {activeClient?.name || "Chưa chọn"}
          </span>
          <span className="chip-sep">•</span>
          <span className="chip-project">
            📁 {activeProject?.name || "Chưa mở project"}
          </span>
          <span className={`chip-badge save-${saveStatus}`}>
            {statusTextMap[saveStatus]}
          </span>
        </div>

        {/* NÚT LƯU PROJECT */}
        <button
          className="header-action header-btn-save"
          disabled={saveStatus === "saving"}
          onClick={onSave}
          title={
            activeProject
              ? "Lưu project hiện tại"
              : "Lưu bản thiết kế mới (Đặt tên & tạo project)"
          }
        >
          💾 Lưu
        </button>

        <button
          className="header-action header-btn-savecopy"
          disabled={saveStatus === "saving"}
          onClick={onSaveCopy}
          title={
            activeProject
              ? "Lưu bản sao mới"
              : "Lưu bản thiết kế mới (Đặt tên & tạo project)"
          }
        >
          Lưu bản sao
        </button>

        {/* NÚT QUẢN TRỊ ADMIN (NẾU LÀ ADMIN) */}
        {isAdmin && (
          <button
            className="header-action header-admin-btn"
            onClick={onOpenAdmin}
            title="Trung tâm Quản trị Salon"
          >
            🛡️ Quản trị
          </button>
        )}

        {/* NÚT BÁNH RĂNG CÀI ĐẶT (SETTINGS) */}
        <button
          className="header-action header-settings-btn"
          onClick={onOpenSettings}
          title="Cài đặt hệ thống, giao diện & tùy chọn (Bánh răng)"
        >
          <span className="settings-gear-icon">⚙️</span>
          <span>Cài đặt</span>
        </button>

        {/* CÁC PHẦN TỬ ẨN ĐỂ ĐỒNG BỘ NỀN VỚI RUNTIME CŨ */}
        <select
          id="themeSelector"
          style={{ display: "none" }}
          aria-hidden="true"
          defaultValue="luxury"
        >
          <option value="luxury">luxury</option>
          <option value="neon">neon</option>
          <option value="light">light</option>
        </select>
        <div id="activeClientIndicatorWrap" style={{ display: "none" }}>
          <span id="activeClientIndicator">
            {activeClient?.name || "Chưa chọn"}
          </span>
        </div>
      </div>
    </header>
  );
};
