import React, { useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { downloadAndInstallUpdate, type UpdateProgress } from "../services/updater";

interface UpdateModalProps {
  update: Update;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({ update, onClose }) => {
  const [progress, setProgress] = useState<UpdateProgress>({
    downloaded: 0,
    total: 0,
    percent: 0,
    status: "idle",
  });
  const [isUpdating, setIsUpdating] = useState(false);

  const handleStartUpdate = async () => {
    setIsUpdating(true);
    try {
      await downloadAndInstallUpdate(update, (prog) => {
        setProgress(prog);
      });
    } catch (err: any) {
      alert("Cập nhật thất bại: " + (err?.message || "Lỗi không xác định."));
      setIsUpdating(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(10, 15, 29, 0.82)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          background: "linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))",
          border: "1px solid rgba(14, 165, 233, 0.35)",
          borderRadius: "18px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(14, 165, 233, 0.2)",
          padding: "28px",
          color: "#f8fafc",
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "18px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, #0284c7, #06b6d4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
              boxShadow: "0 4px 14px rgba(6, 182, 212, 0.35)",
            }}
          >
            🚀
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#ffffff" }}>
              Cập Nhật HairTech 3D
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "6px",
                  background: "rgba(14, 165, 233, 0.2)",
                  color: "#38bdf8",
                  border: "1px solid rgba(14, 165, 233, 0.3)",
                }}
              >
                v{update.version} Mới Nhất
              </span>
              {update.date && (
                <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                  {new Date(update.date).toLocaleDateString("vi-VN")}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div
          style={{
            background: "rgba(15, 23, 42, 0.6)",
            border: "1px solid rgba(51, 65, 85, 0.5)",
            borderRadius: "12px",
            padding: "14px 16px",
            fontSize: "13px",
            lineHeight: "1.6",
            color: "#cbd5e1",
            marginBottom: "22px",
            maxHeight: "140px",
            overflowY: "auto",
          }}
        >
          <div style={{ fontWeight: 600, color: "#e2e8f0", marginBottom: "6px" }}>
            Nội dung nâng cấp:
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>
            {update.body ||
              "Bản cập nhật bao gồm các cải tiến hiệu năng, sửa lỗi xoay 3D và bổ sung tính năng mới."}
          </div>
        </div>

        {/* Progress Bar (when updating) */}
        {isUpdating && (
          <div style={{ marginBottom: "22px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12px",
                color: "#94a3b8",
                marginBottom: "8px",
              }}
            >
              <span>
                {progress.status === "downloading"
                  ? `Đang tải xuống... ${progress.percent}%`
                  : progress.status === "installing"
                  ? "Đang cài đặt và giải nén..."
                  : progress.status === "ready"
                  ? "Hoàn tất! Đang khởi động lại app..."
                  : progress.status === "error"
                  ? "Lỗi tải cập nhật"
                  : "Đang chuẩn bị..."}
              </span>
              <span>{progress.percent}%</span>
            </div>
            <div
              style={{
                width: "100%",
                height: "8px",
                backgroundColor: "rgba(51, 65, 85, 0.6)",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progress.percent}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #0284c7, #10b981)",
                  borderRadius: "4px",
                  transition: "width 0.2s ease-out",
                }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          {!isUpdating && (
            <button
              onClick={onClose}
              style={{
                padding: "10px 18px",
                borderRadius: "10px",
                fontSize: "13px",
                fontWeight: 600,
                color: "#94a3b8",
                background: "transparent",
                border: "1px solid rgba(148, 163, 184, 0.25)",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#ffffff")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
            >
              Để sau
            </button>
          )}
          <button
            onClick={handleStartUpdate}
            disabled={isUpdating}
            style={{
              padding: "10px 22px",
              borderRadius: "10px",
              fontSize: "13px",
              fontWeight: 700,
              color: "#ffffff",
              background: isUpdating
                ? "rgba(14, 165, 233, 0.5)"
                : "linear-gradient(135deg, #0284c7, #06b6d4)",
              border: "none",
              cursor: isUpdating ? "not-allowed" : "pointer",
              boxShadow: isUpdating ? "none" : "0 4px 14px rgba(2, 132, 199, 0.4)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {isUpdating ? "⏳ Đang nâng cấp..." : "✨ Cập nhật ngay"}
          </button>
        </div>
      </div>
    </div>
  );
};
