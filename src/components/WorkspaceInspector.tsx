import React from "react";

export const WorkspaceInspector: React.FC = () => {
  return (
    <div className="app-inspector">
      {/* 1. THIẾT LẬP CHÂN TÓC GUIDED NODE */}
      <div
        className="card-group compact-group guided-node-panel"
        id="guidedNodeSettings"
        style={{ display: "none" }}
      >
        <div className="group-label">Đặt điểm theo chân tóc</div>
        <p id="guidedNodeStatus" role="status" aria-live="polite">
          1. Bấm trên da đầu để chọn chân tóc.
        </p>
        <button id="guidedNodeFit" className="btn-inspector-sub">
          🔍 Xem trọn đầu & điểm
        </button>
        <div className="inspector-inline-row">
          <label htmlFor="guidedNodeAngle">Góc nâng:</label>
          <output id="guidedNodeAngleValue">90°</output>
          <div className="btnrow node-angle-presets">
            <button type="button" data-node-angle="0">0°</button>
            <button type="button" data-node-angle="45">45°</button>
            <button type="button" data-node-angle="90" className="active">90°</button>
            <button type="button" data-node-angle="135">135°</button>
            <button type="button" data-node-angle="180">180°</button>
          </div>
        </div>
        <input
          id="guidedNodeAngle"
          aria-label="Góc nâng"
          type="range"
          min="0"
          max="180"
          step="1"
          defaultValue="90"
        />
        <div className="inspector-inline-row">
          <label htmlFor="guidedNodeDirection">Hướng:</label>
          <select id="guidedNodeDirection" defaultValue="0">
            <option value="0">Hướng lên đỉnh đầu</option>
            <option value="90">Sang bên (+90°)</option>
            <option value="180">Hướng xuống</option>
            <option value="270">Sang bên (−90°)</option>
          </select>
        </div>
        <div className="inspector-inline-row">
          <label htmlFor="guidedNodeLength">Độ dài:</label>
          <input
            id="guidedNodeLength"
            aria-label="Điều chỉnh độ dài"
            type="range"
            min="0.05"
            max="1.5"
            step="0.01"
            defaultValue="0.45"
            style={{ flex: 1 }}
          />
          <input
            id="guidedNodeLengthNumber"
            aria-label="Độ dài chính xác"
            type="number"
            min="0.05"
            max="1.5"
            step="0.01"
            defaultValue="0.45"
            style={{ width: 55 }}
          />
        </div>
        <button id="guidedNodeApply" className="primary" disabled>
          Đặt điểm
        </button>
        <div className="btnrow">
          <button id="guidedNodeMoveRoot" disabled style={{ flex: 1 }}>
            Đổi chân tóc
          </button>
          <button id="guidedNodeCancel" disabled style={{ flex: 1 }}>
            Hủy
          </button>
        </div>
      </div>

      {/* 1B. THIẾT LẬP MŨI TÊN 3D GÓC TỰ DO */}
      <div
        className="card-group compact-group"
        id="groupArrowSettings"
        style={{ display: "none" }}
      >
        <div className="group-label">Mũi tên 3D (Góc tự do)</div>
        <div className="inspector-inline-row">
          <label htmlFor="arrowAngle">Góc nâng:</label>
          <output id="arrowAngleValue" className="val-accent">90°</output>
          <div className="btnrow node-angle-presets">
            <button type="button" data-arrow-angle="0">0°</button>
            <button type="button" data-arrow-angle="45">45°</button>
            <button type="button" data-arrow-angle="90" className="active">90°</button>
            <button type="button" data-arrow-angle="135">135°</button>
          </div>
        </div>
        <input
          id="arrowAngle"
          aria-label="Góc nâng mũi tên"
          type="range"
          min="0"
          max="180"
          step="5"
          defaultValue="90"
        />
        <div className="inspector-inline-row">
          <label htmlFor="arrowDirection">Hướng ngả:</label>
          <select id="arrowDirection" defaultValue="0">
            <option value="0">Hướng lên đỉnh đầu</option>
            <option value="90">Ngả trước (+90°)</option>
            <option value="180">Hướng xuống gáy</option>
            <option value="270">Ngả sau (−90°)</option>
          </select>
        </div>
      </div>

      {/* 1C. THIẾT LẬP KIỂU ĐƯỜNG PHÂN KHU (2D/3D) */}
      <div className="card-group compact-group" id="groupSectionLineSettings">
        <div className="group-label">Kiểu đường phân khu</div>
        <select id="sectionLineMode" defaultValue="texture-curved" title="Chọn cách đường vẽ hiển thị trên đầu">
          <option value="texture-curved">〰️ Bám da đầu (Cong ôm sọ)</option>
          <option value="texture-straight">📏 Bám da đầu (Thẳng đỉnh đầu)</option>
        </select>
      </div>

      {/* 2. MÀU SẮC & CỠ NÉT SIÊU GỌN */}
      <div className="card-group compact-group">
        <div className="group-label">Màu sắc & Cỡ nét vẽ</div>
        <div className="style-controls-compact">
          <input type="color" id="colorPicker" defaultValue="#2563eb" title="Chọn màu nét vẽ & mảng" />
          <div className="brush-slider-wrap">
            <span>Cỡ nét</span>
            <input
              type="range"
              id="widthPicker"
              min="1"
              max="14"
              defaultValue="4"
            />
          </div>
        </div>
      </div>

      {/* 3. CHIỀU DÀI VƯƠN 3D */}
      <div className="card-group compact-group">
        <div className="group-label">
          <span>Chiều dài vươn 3D</span>
          <span id="extrudeLenVal" className="val-accent">0.45m</span>
        </div>
        <input
          type="range"
          id="extrudeLenPicker"
          min="0.1"
          max="1.0"
          step="0.05"
          defaultValue="0.45"
        />
      </div>

      {/* 4. THÔNG SỐ TRỤC & HƯỚNG CONG UỐN */}
      <div
        className="card-group compact-group"
        id="groupRodSettings"
        style={{ display: "none" }}
      >
        <div className="group-label">Thông số Trục Uốn & Sóng</div>
        <div className="rod-settings-grid">
          <select id="rodSizeSelect" defaultValue="19">
            <option value="16">Trục #16 (Vàng)</option>
            <option value="19">Trục #19 (Hồng)</option>
            <option value="22">Trục #22 (Xanh)</option>
            <option value="25">Trục #25 (Cam)</option>
          </select>
          <select id="rodAngleSelect" defaultValue="90">
            <option value="90">On-Base (90°)</option>
            <option value="45">Half-Base (45°)</option>
            <option value="20">Off-Base (20°)</option>
          </select>
        </div>
        <div className="amplitude-row">
          <span>Biên độ sóng:</span>
          <input
            type="range"
            id="waveAmpPicker"
            min="0.04"
            max="0.20"
            step="0.02"
            defaultValue="0.10"
          />
        </div>
        <select id="waveRollPicker" defaultValue="90">
          <option value="90">⬅️ Sang Trái (Bám da đầu)</option>
          <option value="270">➡️ Sang Phải (Bám da đầu)</option>
          <option value="0">⬆️ Vươn Trên (Bật ngửa ra)</option>
          <option value="180">⬇️ Gập Dưới (Úp vào trong)</option>
        </select>
      </div>

      {/* 5. THAO TÁC HOÀN TÁC & XUẤT FILE */}
      <div className="card-group compact-group">
        <div className="group-label">Thao tác & Xuất File</div>
        <div className="btnrow">
          <button id="undoBtn" title="Ctrl+Z" style={{ flex: 1 }}>
            ↶ Hoàn tác
          </button>
          <button id="redoBtn" title="Ctrl+Y" style={{ flex: 1 }}>
            ↷ Làm lại
          </button>
        </div>
        <div className="btnrow">
          <button id="pngBtn" className="primary" style={{ flex: 1 }}>
            📷 Xuất PNG
          </button>
          <button id="pdfBtn" className="primary" style={{ flex: 1 }}>
            📄 Xuất PDF
          </button>
        </div>
        <button id="clearBtn" className="danger-btn-sm" style={{ width: "100%" }}>
          🗑️ Xoá toàn bộ 2D & 3D
        </button>
      </div>

      {/* 6. GHI CHÚ KỸ THUẬT */}
      <div className="card-group compact-group">
        <div className="group-label">Ghi chú kỹ thuật</div>
        <textarea
          id="notesArea"
          className="notes-compact"
          placeholder="Ghi chú kỹ thuật uốn / cắt..."
          rows={2}
        />
      </div>

      {/* 7. BẢN TRẢI PHẲNG TEXTURE */}
      <div className="card-group compact-group flat-preview">
        <div className="group-label">Bản trải phẳng (Texture)</div>
        <img id="flatPreview" alt="bản trải phẳng" />
      </div>

      {/* PHẦN TỬ ẨN ĐÃ ĐƯA VÀO CÀI ĐẶT */}
      <div style={{ display: "none" }}>
        <button id="snapToggleBtn" className="toggle-on">🧲 Snap</button>
      </div>
    </div>
  );
};
