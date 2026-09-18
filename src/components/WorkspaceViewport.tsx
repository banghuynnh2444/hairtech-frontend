import React from "react";

export const WorkspaceViewport: React.FC = () => {
  return (
    <div className="app-viewport">
      <div className="canvas-frame">
        <canvas id="glcanvas" />
        <div className="mode-hint" id="modeHint">
          ✏️ Click Chuột Trái để vẽ / dựng 3D | Chuột Phải xoay 360° (Phím W A S D
          T: Đổi góc nhìn)
        </div>
      </div>

      <div className="timeline-bar">
        <div className="timeline-title">
          <span>Tiến trình</span>
          <small>Từng bước</small>
        </div>
        <button id="playBtn" className="primary">
          ▶ Phát
        </button>
        <button id="prevBtn">⏮ Trước</button>
        <button id="nextBtn">Sau ⏭</button>
        <input
          type="range"
          id="timelineSlider"
          min="0"
          max="0"
          defaultValue="0"
        />
        <span id="timelineStatus" className="timeline-status">
          0/0
        </span>
      </div>
    </div>
  );
};
