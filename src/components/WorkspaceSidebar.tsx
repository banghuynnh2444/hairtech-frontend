import React from "react";

export const WorkspaceSidebar: React.FC = () => {
  return (
    <div className="app-sidebar">
      {/* 1. CHẾ ĐỘ LÀM VIỆC (COMPACT SEGMENTED CONTROL) */}
      <div className="card-group compact-group">
        <div className="group-label">Chế độ làm việc</div>
        <div className="mode-segmented-bar">
          <button id="modeDraw" className="mode-seg-btn active" title="Vẽ 2D da đầu">
            <span className="seg-icon">✏️</span>
            <span>Vẽ 2D</span>
          </button>
          <button id="modeSpace" className="mode-seg-btn" title="Dựng 3D mảng tóc">
            <span className="seg-icon">◇</span>
            <span>Dựng 3D</span>
          </button>
          <button id="modePerm" className="mode-seg-btn" title="Uốn tóc & tạo sóng">
            <span className="seg-icon">∿</span>
            <span>Uốn tóc</span>
          </button>
        </div>
      </div>

      {/* 2. CÔNG CỤ VẼ 2D DA ĐẦU (COMPACT GRID) */}
      <div className="card-group compact-group" id="groupTools2D">
        <div className="group-label">Công cụ Vẽ 2D Da Đầu</div>
        <div className="draw-path-mode-bar" title="Chọn kiểu nét vẽ trên da đầu">
          <button
            type="button"
            id="pathModeCurved"
            className="path-mode-seg-btn active"
            title="Nét cong ôm sát khuôn sọ manocanh"
          >
            〰️ Cong ôm sọ
          </button>
          <button
            type="button"
            id="pathModeStraight"
            className="path-mode-seg-btn"
            title="Nét thẳng tắp qua đỉnh đầu (Đường trắc địa / Chia ngôi thẳng)"
          >
            📏 Thẳng đỉnh đầu
          </button>
        </div>
        <div className="tool-grid-compact">
          <button data-tool="line" className="tool active" title="Đường thẳng">
            📏 Thẳng
          </button>
          <button data-tool="curve" className="tool" title="Đường cong">
            〰️ Cong
          </button>
          <button data-tool="dashed" className="tool" title="Nét đứt">
            ┄ Đứt
          </button>
          <button data-tool="arrow" className="tool" title="Mũi tên hướng">
            ➔ Mũi tên
          </button>
          <button data-tool="pen" className="tool" title="Bút vẽ tự do">
            ✏️ Bút vẽ
          </button>
          <button data-tool="text" className="tool" title="Chèn văn bản">
            🔤 Chữ
          </button>
          <button data-tool="sticker-clipper" className="tool" title="Tông đơ cạo">
            🪒 Cắt sát
          </button>
          <button data-tool="sticker-razor" className="tool" title="Dao cạo viền">
            🗡 Cạo viền
          </button>
          <button data-tool="eraser" className="tool" title="Tẩy nét">
            🧹 Tẩy
          </button>
        </div>
        <button id="finishChain2DBtn" className="btn-chain-finish">
          ✔ Ngắt đoạn nét vẽ 2D
        </button>
      </div>

      {/* 3. CÔNG CỤ DỰNG 3D CẮT TÓC (COMPACT GRID) */}
      <div
        className="card-group compact-group"
        id="groupTools3D"
        style={{ display: "none" }}
      >
        <div className="group-label">Công cụ Dựng 3D Mảng Tóc</div>
        <div className="placement-mode-row">
          <span>Đặt điểm:</span>
          <select id="nodePlacementMode" defaultValue="guided">
            <option value="guided">Bám chân tóc (Chuẩn)</option>
            <option value="free">Tự do trong không gian</option>
          </select>
        </div>
        <div className="tool-grid-compact">
          <button id="toolNode3D" className="spacetool active" title="Đặt điểm & tạo mảng">
            📍 Điểm & Mảng
          </button>
          <button id="toolAutoRect3D" className="spacetool" title="Mảng hộp 90 độ (Có Snap)">
            ⚡ Mảng Hộp 90°
          </button>
          <button id="toolArrow90" className="spacetool" title="Mũi tên hướng nâng góc tự do">
            🏹 Mũi Tên Góc Tự Do
          </button>
          <button id="toolConnectTips" className="spacetool" title="Nối đỉnh tạo hộp">
            🔗 Nối Đỉnh Hộp
          </button>
        </div>
        <button id="breakChainBtn" className="btn-chain-finish">
          ✂️ Ngắt chuỗi mảng 3D (B)
        </button>
      </div>

      {/* 4. CÔNG CỤ UỐN 3D & SÓNG */}
      <div
        className="card-group compact-group"
        id="groupToolsPerm"
        style={{ display: "none" }}
      >
        <div className="group-label">Công cụ Uốn & Kiểu Sóng</div>
        <div className="tool-grid-compact">
          <button id="toolPermRod" className="permtool active" title="Trục uốn 3D">
            💈 Trục Uốn
          </button>
          <button id="toolCurlC" className="permtool" title="Sóng C">
            🌀 Sóng C
          </button>
          <button id="toolCurlCHook" className="permtool" title="Sóng C móc">
            ↪️ Sóng C Móc
          </button>
          <button id="toolCurlS" className="permtool" title="Sóng S">
            🌊 Sóng S
          </button>
          <button id="toolCurlJ" className="permtool" title="Sóng J">
            ↪️ Sóng J
          </button>
          <button id="toolCurlSpiral" className="permtool" title="Spiral Xoắn">
            🌀 Spiral
          </button>
          <button id="toolCurlHippie" className="permtool" title="Xoăn Hippie">
            🐑 Hippie
          </button>
          <button id="toolCurlZigzag" className="permtool" title="Dập xù ziczac">
            ⚡ Dập Xù
          </button>
        </div>
      </div>

      {/* 5. GÓC NHÌN CAMERA NHANH (W A S D T) */}
      <div className="card-group compact-group">
        <div className="group-label">Góc nhìn 3D (W A S D T)</div>
        <div className="view-grid-compact">
          <button data-view="front" title="Nhìn chính diện trước (W)">W Trước</button>
          <button data-view="left" title="Nhìn từ bên trái (A)">A Trái</button>
          <button data-view="right" title="Nhìn từ bên phải (D)">D Phải</button>
          <button data-view="back" title="Nhìn từ phía sau (S)">S Sau</button>
          <button data-view="top" title="Nhìn từ trên xuống (T)">T Trên</button>
        </div>
      </div>

      {/* CÁC PHẦN TỬ ẨN ĐÃ CHUYỂN VÀO CÀI ĐẶT (ĐẢM BẢO TƯƠNG THÍCH RUNTIME) */}
      <div style={{ display: "none" }}>
        <button id="toggleMeshFillBtn" className="toggle-on">Màu Mảng</button>
        <button id="cageToggleBtn" className="toggle-on">Lồng Lưới</button>
        <select id="bg3dSelect" defaultValue="0xffffff">
          <option value="0xffffff">0xffffff</option>
          <option value="0x0b0a09">0x0b0a09</option>
          <option value="0x1e293b">0x1e293b</option>
        </select>
      </div>
    </div>
  );
};
