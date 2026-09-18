import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GuidedNodes } from "./guidedNodes";
import { isPointVisible, rightAnglePoint } from "./nodePlacement";
import {
  clampHistoryStep,
  isHistoryItemVisible,
  lastClearIndex,
} from "./historyTimeline";
import { ClientPanel } from "./ClientPanel";
import { PhotoPanel } from "./PhotoPanel";
import { listClients, type ClientRecord } from "../services/clients";
import { SaveNewProjectModal } from "./SaveNewProjectModal";
import {
  createDiagram,
  deleteDiagram,
  getDiagram,
  updateDiagram,
  type DiagramDetail,
  type DiagramSummary,
} from "../services/diagrams";
import {
  createEmptyProjectData,
  isProjectDataV1,
  type JsonObject,
  type ProjectDataV1,
} from "../services/project";
import {
  calculateAngleBetween2Lines,
  createAngleSprite,
  disposeObjectRecursively,
} from "../three/helpers";
import {
  create3DBoxQuad as create3DBoxQuadHelper,
  createElevationArrow3D as createElevationArrow3DHelper,
  createAutoRectSection3D as createAutoRectSection3DHelper,
} from "../three/sections";
import {
  createPermRod3D as createPermRod3DHelper,
  createStraightAxisPermWave3D as createStraightAxisPermWave3DHelper,
  findIntersectedPermWave as findIntersectedPermWaveHelper,
} from "../three/perm";
import { WorkspaceHeader, type SaveStatus, type ViewMode } from "./WorkspaceHeader";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { WorkspaceViewport } from "./WorkspaceViewport";
import { WorkspaceInspector } from "./WorkspaceInspector";
import { AdminPanel } from "./AdminPanel";
import { SettingsModal } from "./SettingsModal";
import { checkIsAdmin } from "../services/admin";

interface WorkspaceProps {
  onLogout: () => void;
}

interface ProjectRuntime {
  serialize: () => ProjectDataV1;
  load: (project: ProjectDataV1) => void;
  reset: () => void;
}

export const Workspace: React.FC<WorkspaceProps> = ({ onLogout }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ProjectRuntime | null>(null);
  const activeProjectRef = useRef<DiagramDetail | null>(null);
  const dirtyRevisionRef = useRef(0);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const saveQueuedRef = useRef(false);
  const suppressDirtyRef = useRef(false);
  const markDirtyRef = useRef<() => void>(() => undefined);
  const [activeClient, setActiveClient] = useState<ClientRecord | null>(null);
  const [activeProject, setActiveProject] = useState<DiagramDetail | null>(
    null,
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("no-project");
  const [dirtyRevision, setDirtyRevision] = useState(0);
  const [projectsRevision, setProjectsRevision] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSaveNewProjectModalOpen, setIsSaveNewProjectModalOpen] =
    useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("standard");
  const [currentTheme, setCurrentTheme] = useState<string>("luxury");
  const [bg3dColor, setBg3dColor] = useState<string>("0xffffff");
  const [isMeshFillVisible, setIsMeshFillVisible] = useState<boolean>(true);
  const [isCageVisible, setIsCageVisible] = useState<boolean>(true);
  const [isSnapEnabled, setIsSnapEnabled] = useState<boolean>(true);
  const showWorkTabRef = useRef<((tab: string) => void) | null>(null);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === "zen") {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => undefined);
      }
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => undefined);
      }
    }
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 120);
  };

  useEffect(() => {
    const handleFullscreenKey = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        handleViewModeChange(viewMode === "zen" ? "standard" : "zen");
      } else if (e.key === "Escape" && viewMode === "zen") {
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleViewModeChange("standard");
      }
    };
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && viewMode === "zen") {
        setViewMode("standard");
        setTimeout(() => {
          window.dispatchEvent(new Event("resize"));
        }, 120);
      }
    };
    window.addEventListener("keydown", handleFullscreenKey);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      window.removeEventListener("keydown", handleFullscreenKey);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [viewMode]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const admin = await checkIsAdmin();
      if (!cancelled && admin) setIsAdmin(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    activeProjectRef.current = activeProject;
  }, [activeProject]);

  markDirtyRef.current = () => {
    if (suppressDirtyRef.current) return;
    dirtyRevisionRef.current += 1;
    setDirtyRevision(dirtyRevisionRef.current);
    if (activeProjectRef.current) setSaveStatus("unsaved");
  };

  const saveActiveProject = useCallback(async () => {
    if (savePromiseRef.current) {
      saveQueuedRef.current = true;
      return savePromiseRef.current;
    }

    const saveLoop = async () => {
      do {
        saveQueuedRef.current = false;
        const project = activeProjectRef.current;
        const runtime = runtimeRef.current;
        if (!project || !runtime) return;
        const revision = dirtyRevisionRef.current;
        setSaveStatus("saving");
        try {
          const projectData = runtime.serialize();
          const notes =
            typeof projectData.settings.technical_notes === "string"
              ? projectData.settings.technical_notes
              : project.notes;
          const saved = await updateDiagram(project.id, {
            project_data: projectData,
            notes,
          });
          activeProjectRef.current = saved;
          setActiveProject(saved);
          setSaveStatus(
            dirtyRevisionRef.current === revision ? "saved" : "unsaved",
          );
        } catch (error) {
          setSaveStatus("error");
          throw error;
        }
      } while (saveQueuedRef.current);
    };

    savePromiseRef.current = saveLoop().finally(() => {
      savePromiseRef.current = null;
    });
    return savePromiseRef.current;
  }, []);

  const handleHeaderSave = useCallback(async () => {
    if (!activeProjectRef.current) {
      setIsSaveNewProjectModalOpen(true);
      return;
    }
    await saveActiveProject();
  }, [saveActiveProject]);

  const handleSaveNewProject = useCallback(
    async (params: {
      name: string;
      clientId: string | null;
      notes: string;
    }) => {
      const runtime = runtimeRef.current;
      if (!runtime) throw new Error("Không gian thiết kế chưa sẵn sàng.");

      setSaveStatus("saving");
      try {
        const projectData = runtime.serialize();
        if (params.notes) {
          projectData.settings.technical_notes = params.notes;
        }

        const created = await createDiagram({
          client_id: params.clientId,
          type: "hair-design-3d",
          name: params.name,
          notes: params.notes || null,
          project_data: projectData,
        });

        if (params.clientId) {
          try {
            const allClients = await listClients();
            const matching = allClients.find((c) => c.id === params.clientId);
            if (matching) setActiveClient(matching);
          } catch {
            // bỏ qua nếu không tải được client
          }
        }

        activeProjectRef.current = created;
        setActiveProject(created);
        setProjectsRevision((r) => r + 1);
        setSaveStatus("saved");
      } catch (error) {
        setSaveStatus("error");
        throw error;
      }
    },
    [],
  );

  useEffect(() => {
    if (!activeProject || dirtyRevision === 0 || saveStatus !== "unsaved")
      return;
    const timer = window.setTimeout(() => {
      void saveActiveProject().catch(() => undefined);
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [activeProject?.id, dirtyRevision, saveActiveProject, saveStatus]);

  const showDesignTab = () => {
    (document.getElementById("tabBtn3d") as HTMLButtonElement | null)?.click();
  };

  const selectClient = useCallback(
    async (client: ClientRecord | null) => {
      if (activeProjectRef.current && saveStatus === "unsaved")
        await saveActiveProject();
      if (client?.id !== activeClient?.id) {
        suppressDirtyRef.current = true;
        try {
          runtimeRef.current?.reset();
        } finally {
          suppressDirtyRef.current = false;
        }
        activeProjectRef.current = null;
        setActiveProject(null);
        setSaveStatus("no-project");
      }
      setActiveClient(client);
    },
    [activeClient?.id, saveActiveProject, saveStatus],
  );

  const createClientProject = useCallback(
    async (
      client: ClientRecord,
      name: string,
      notes: string,
    ): Promise<DiagramSummary> => {
      if (activeProjectRef.current && saveStatus === "unsaved")
        await saveActiveProject();
      const runtime = runtimeRef.current;
      if (!runtime) throw new Error("Không gian thiết kế chưa sẵn sàng.");
      const projectData = createEmptyProjectData();
      projectData.settings.technical_notes = notes;
      const created = await createDiagram({
        client_id: client.id,
        type: "hair-design-3d",
        name,
        notes: notes || null,
        project_data: projectData,
      });
      setActiveClient(client);
      activeProjectRef.current = created;
      setActiveProject(created);
      setSaveStatus("saved");
      suppressDirtyRef.current = true;
      try {
        runtime.load(created.project_data);
      } finally {
        suppressDirtyRef.current = false;
      }
      showDesignTab();
      return created;
    },
    [saveActiveProject, saveStatus],
  );

  const openClientProject = useCallback(
    async (client: ClientRecord, summary: DiagramSummary) => {
      if (
        activeProjectRef.current?.id !== summary.id &&
        saveStatus === "unsaved"
      ) {
        await saveActiveProject();
      }
      const detail = await getDiagram(summary.id);
      if (!isProjectDataV1(detail.project_data)) {
        throw new Error(
          "Project cũ chưa có định dạng dữ liệu phiên bản 1 để mở an toàn.",
        );
      }
      const runtime = runtimeRef.current;
      if (!runtime) throw new Error("Không gian thiết kế chưa sẵn sàng.");
      const previousProject = activeProjectRef.current;
      const previousSnapshot = runtime.serialize();
      suppressDirtyRef.current = true;
      try {
        runtime.load(detail.project_data);
      } catch (error) {
        runtime.load(previousSnapshot);
        activeProjectRef.current = previousProject;
        throw error;
      } finally {
        suppressDirtyRef.current = false;
      }
      setActiveClient(client);
      activeProjectRef.current = detail;
      setActiveProject(detail);
      setSaveStatus("saved");
      showDesignTab();
    },
    [saveActiveProject, saveStatus],
  );

  const deleteClientProject = useCallback(async (project: DiagramSummary) => {
    await deleteDiagram(project.id);
    if (activeProjectRef.current?.id !== project.id) return;
    suppressDirtyRef.current = true;
    try {
      runtimeRef.current?.reset();
    } finally {
      suppressDirtyRef.current = false;
    }
    activeProjectRef.current = null;
    setActiveProject(null);
    setSaveStatus("no-project");
  }, []);

  const saveAsCopy = useCallback(async () => {
    const project = activeProjectRef.current;
    if (!project) {
      setIsSaveNewProjectModalOpen(true);
      return;
    }
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const name = prompt("Tên bản sao:", `${project.name} - Bản sao`)?.trim();
    if (!name) return;
    setSaveStatus("saving");
    try {
      const created = await createDiagram({
        client_id: project.client_id,
        type: project.type,
        name,
        notes: project.notes,
        project_data: runtime.serialize(),
      });
      activeProjectRef.current = created;
      setActiveProject(created);
      setProjectsRevision((revision) => revision + 1);
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("error");
      throw error;
    }
  }, []);

  const logoutAfterSave = useCallback(async () => {
    if (activeProjectRef.current && saveStatus === "unsaved") {
      try {
        await saveActiveProject();
      } catch {
        return;
      }
    }
    onLogout();
  }, [onLogout, saveActiveProject, saveStatus]);

  useEffect(() => {
    if (!rootRef.current) return;
    const eventController = new AbortController();
    let guidedNodes: GuidedNodes | null = null;
    let requestRender: () => void = () => {};

    // --- 1. LẤY CÁC PHẦN TỬ GIAO DIỆN ---
    const themeSelector = document.getElementById(
      "themeSelector",
    ) as HTMLSelectElement;
    const bg3dSelect = document.getElementById(
      "bg3dSelect",
    ) as HTMLSelectElement;
    const glcanvas = document.getElementById("glcanvas") as HTMLCanvasElement;
    const colorPicker = document.getElementById(
      "colorPicker",
    ) as HTMLInputElement;
    const widthPicker = document.getElementById(
      "widthPicker",
    ) as HTMLInputElement;
    const extrudeLenPicker = document.getElementById(
      "extrudeLenPicker",
    ) as HTMLInputElement;
    const extrudeLenVal = document.getElementById(
      "extrudeLenVal",
    ) as HTMLSpanElement;
    const rodSizeSelect = document.getElementById(
      "rodSizeSelect",
    ) as HTMLSelectElement;
    const rodAngleSelect = document.getElementById(
      "rodAngleSelect",
    ) as HTMLSelectElement;
    const waveAmpPicker = document.getElementById(
      "waveAmpPicker",
    ) as HTMLInputElement;
    const waveRollPicker = document.getElementById(
      "waveRollPicker",
    ) as HTMLSelectElement;
    const flatPreview = document.getElementById(
      "flatPreview",
    ) as HTMLImageElement;
    const modeHint = document.getElementById("modeHint") as HTMLDivElement;
    const nodePlacementMode = document.getElementById(
      "nodePlacementMode",
    ) as HTMLSelectElement;
    const notesArea = document.getElementById(
      "notesArea",
    ) as HTMLTextAreaElement;

    glcanvas.addEventListener("contextmenu", (e) => e.preventDefault(), {
      signal: eventController.signal,
    });

    // --- 2. ĐỔI THEME & NỀN ---
    if (themeSelector) {
      themeSelector.addEventListener(
        "change",
        (e: any) => {
          const theme = e.target.value;
          if (theme === "luxury") {
            document.documentElement.removeAttribute("data-theme");
            colorPicker.value = "#d4af37";
          } else if (theme === "neon") {
            document.documentElement.setAttribute("data-theme", "neon");
            colorPicker.value = "#00f2fe";
          } else if (theme === "light") {
            document.documentElement.setAttribute("data-theme", "light");
            colorPicker.value = "#2563eb";
          }
        },
        { signal: eventController.signal },
      );
    }

    if (bg3dSelect) {
      bg3dSelect.addEventListener(
        "change",
        (e: any) => {
          scene.background = new THREE.Color(parseInt(e.target.value, 16));
          requestRender();
        },
        { signal: eventController.signal },
      );
    }

    // --- 3. CANVAS VẼ 2D DA ĐẦU (TEXTURE) ---
    const TEX_SIZE = 1024;
    const texCanvas = document.createElement("canvas");
    texCanvas.width = TEX_SIZE;
    texCanvas.height = TEX_SIZE;
    const tctx = texCanvas.getContext("2d")!;

    let mode = "draw";
    let current2DTool = "line";
    let draw2DPathMode: "curved" | "straight" = "curved";
    let active3DSubTool = "node3d";
    let activePermSubTool = "permRod";
    let is2DSnapEnabled = true;

    const historyStack: any[] = [];
    let timelineIndex = 0;
    let isPlaying = false;
    let playTimer: any = null;

    extrudeLenPicker.addEventListener(
      "input",
      () => {
        extrudeLenVal.textContent =
          parseFloat(extrudeLenPicker.value).toFixed(2) + "m";
      },
      { signal: eventController.signal },
    );

    function drawBaseGuides() {
      tctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
      tctx.fillStyle = "#c5c5c5";
      tctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
      tctx.save();
      tctx.strokeStyle = "#8c8c8c";
      tctx.setLineDash([10, 10]);
      tctx.lineWidth = 2;
      [0.16, 0.42, 0.62].forEach((v) => {
        tctx.beginPath();
        tctx.moveTo(0, v * TEX_SIZE);
        tctx.lineTo(TEX_SIZE, v * TEX_SIZE);
        tctx.stroke();
      });
      [0.25, 0.5, 0.75].forEach((u) => {
        tctx.beginPath();
        tctx.moveTo(u * TEX_SIZE, 0);
        tctx.lineTo(u * TEX_SIZE, TEX_SIZE);
        tctx.stroke();
      });
      tctx.restore();
    }

    function smoothPath(ctx: CanvasRenderingContext2D, pts: any[]) {
      if (!pts || pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      if (pts.length === 2) {
        ctx.lineTo(pts[1].x, pts[1].y);
        return;
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] || p2;
        ctx.bezierCurveTo(
          p1.x + (p2.x - p0.x) / 6,
          p1.y + (p2.y - p0.y) / 6,
          p2.x - (p3.x - p1.x) / 6,
          p2.y - (p3.y - p1.y) / 6,
          p2.x,
          p2.y,
        );
      }
    }

    function drawArrowHead(
      ctx: CanvasRenderingContext2D,
      from: any,
      to: any,
      color: string,
      width: number,
    ) {
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const headLen = 10 + width * 2.5;
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(
        to.x - headLen * Math.cos(angle - Math.PI / 7),
        to.y - headLen * Math.sin(angle - Math.PI / 7),
      );
      ctx.lineTo(
        to.x - headLen * Math.cos(angle + Math.PI / 7),
        to.y - headLen * Math.sin(angle + Math.PI / 7),
      );
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }

    function drawSticker(ctx: CanvasRenderingContext2D, a: any) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.strokeStyle = a.color;
      ctx.fillStyle = a.color;
      ctx.lineWidth = 2;
      const s = a.size || 40;
      if (a.subtype === "clipper") {
        ctx.strokeRect(-s * 0.35, -s * 0.5, s * 0.7, s * 0.75);
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath();
          ctx.moveTo(i * s * 0.09, -s * 0.5);
          ctx.lineTo(i * s * 0.09, -s * 0.68);
          ctx.stroke();
        }
        ctx.strokeRect(-s * 0.22, s * 0.25, s * 0.44, s * 0.35);
      } else if (a.subtype === "razor") {
        ctx.beginPath();
        ctx.moveTo(-s * 0.5, s * 0.15);
        ctx.lineTo(s * 0.35, -s * 0.35);
        ctx.lineTo(s * 0.5, -s * 0.15);
        ctx.lineTo(-s * 0.35, s * 0.35);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-s * 0.5, s * 0.15);
        ctx.lineTo(-s * 0.7, s * 0.4);
        ctx.stroke();
      }
      ctx.restore();
    }

    function renderAction2D(ctx: CanvasRenderingContext2D, a: any) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const eraseClr = "#c5c5c5";

      if (a.type === "pen" || a.type === "eraser") {
        ctx.strokeStyle = a.type === "eraser" ? eraseClr : a.color;
        ctx.lineWidth = a.type === "eraser" ? a.width * 5 : a.width * 2.2;
        smoothPath(ctx, a.points);
        ctx.stroke();
      } else if (
        a.type === "line" ||
        a.type === "dashed" ||
        a.type === "arrow"
      ) {
        ctx.strokeStyle = a.color;
        ctx.fillStyle = a.color;
        ctx.lineWidth = a.width * 2.2;
        if (a.type === "dashed")
          ctx.setLineDash([a.width * 3 + 6, a.width * 2 + 6]);

        if (a.straightPoints && a.straightPoints.length > 1) {
          let hasSeamJump = false;
          for (let i = 1; i < a.straightPoints.length; i++) {
            if (Math.abs(a.straightPoints[i].x - a.straightPoints[i - 1].x) > TEX_SIZE * 0.4) {
              hasSeamJump = true;
              break;
            }
          }
          if (!hasSeamJump && a.straightPoints.length >= 3) {
            smoothPath(ctx, a.straightPoints);
            ctx.stroke();
          } else {
            ctx.beginPath();
            let started = false;
            for (let i = 0; i < a.straightPoints.length; i++) {
              const pt = a.straightPoints[i];
              if (i > 0 && Math.abs(pt.x - a.straightPoints[i - 1].x) > TEX_SIZE * 0.4) {
                ctx.stroke();
                ctx.beginPath();
                started = false;
              }
              if (!started) {
                ctx.moveTo(pt.x, pt.y);
                started = true;
              } else {
                ctx.lineTo(pt.x, pt.y);
              }
            }
            ctx.stroke();
          }

          if (a.type === "arrow" && a.straightPoints.length >= 2) {
            const last = a.straightPoints[a.straightPoints.length - 1];
            const prev = a.straightPoints[a.straightPoints.length - 2];
            drawArrowHead(ctx, prev, last, a.color, a.width);
          }
        } else {
          const dx = a.x2 - a.x1;
          if (Math.abs(dx) > TEX_SIZE * 0.5) {
            const edgeX1 = a.x1 > a.x2 ? TEX_SIZE : 0;
            const edgeX2 = a.x1 > a.x2 ? 0 : TEX_SIZE;
            const midY = (a.y1 + a.y2) / 2;
            ctx.beginPath();
            ctx.moveTo(a.x1, a.y1);
            ctx.lineTo(edgeX1, midY);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(edgeX2, midY);
            ctx.lineTo(a.x2, a.y2);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(a.x1, a.y1);
            ctx.lineTo(a.x2, a.y2);
            ctx.stroke();
          }
          if (a.type === "arrow")
            drawArrowHead(
              ctx,
              { x: a.x1, y: a.y1 },
              { x: a.x2, y: a.y2 },
              a.color,
              a.width,
            );
        }
      } else if (
        a.type === "curve" ||
        a.type === "dashedCurve" ||
        a.type === "curvedArrow"
      ) {
        ctx.strokeStyle = a.color;
        ctx.lineWidth = a.width * 2.2;
        if (a.type === "dashedCurve")
          ctx.setLineDash([a.width * 3 + 6, a.width * 2 + 6]);
        if (a.straightPoints && a.straightPoints.length > 1) {
          smoothPath(ctx, a.straightPoints);
          ctx.stroke();
          if (a.type === "curvedArrow") {
            const last = a.straightPoints[a.straightPoints.length - 1];
            const prev = a.straightPoints[a.straightPoints.length - 2];
            drawArrowHead(ctx, prev, last, a.color, a.width);
          }
        } else if (a.points && a.points.length >= 2) {
          smoothPath(ctx, a.points);
          ctx.stroke();
          if (a.type === "curvedArrow")
            drawArrowHead(
              ctx,
              a.points[a.points.length - 2],
              a.points[a.points.length - 1],
              a.color,
              a.width,
            );
        } else if (a.x1 !== undefined) {
          const dx = a.x2 - a.x1;
          if (Math.abs(dx) > TEX_SIZE * 0.5) {
            const edgeX1 = a.x1 > a.x2 ? TEX_SIZE : 0;
            const edgeX2 = a.x1 > a.x2 ? 0 : TEX_SIZE;
            const midY = (a.y1 + a.y2) / 2;
            ctx.beginPath();
            ctx.moveTo(a.x1, a.y1);
            ctx.lineTo(edgeX1, midY);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(edgeX2, midY);
            ctx.lineTo(a.x2, a.y2);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(a.x1, a.y1);
            ctx.lineTo(a.x2, a.y2);
            ctx.stroke();
          }
          if (a.type === "curvedArrow")
            drawArrowHead(
              ctx,
              { x: a.x1, y: a.y1 },
              { x: a.x2, y: a.y2 },
              a.color,
              a.width,
            );
        }
      } else if (a.type === "text") {
        ctx.fillStyle = a.color;
        ctx.font = `600 ${a.fontSize || 24}px 'Plus Jakarta Sans', sans-serif`;
        ctx.fillText(a.text, a.x, a.y);
      } else if (a.type === "sticker") {
        drawSticker(ctx, a);
      }
      ctx.restore();
    }

    function redrawTexture(previewAction?: any) {
      drawBaseGuides();
      const visibleStart = lastClearIndex(historyStack, timelineIndex) + 1;
      for (let i = visibleStart; i < timelineIndex; i++) {
        const item = historyStack[i];
        if (item.kind === "texture" && item.visible !== false)
          renderAction2D(tctx, item.action);
      }
      if (previewAction) renderAction2D(tctx, previewAction);
      texture.needsUpdate = true;
      if (!previewAction) {
        flatPreview.src = texCanvas.toDataURL("image/png");
      }
      requestRender();
    }

    // --- 4. THREE.JS SCENE SETUP ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0.5, 4.3);

    const renderer = new THREE.WebGLRenderer({
      canvas: glcanvas,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    function resizeRenderer() {
      const rect = glcanvas.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height === 0) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      requestRender();
    }
    window.addEventListener("resize", resizeRenderer, {
      signal: eventController.signal,
    });

    const resizeObserver = new ResizeObserver(() => {
      resizeRenderer();
    });
    if (glcanvas.parentElement) {
      resizeObserver.observe(glcanvas.parentElement);
    }

    let nodeHighlightRing: any = null;
    let refreshNodeView = () => {};

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.3, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.18;
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.0;
    controls.panSpeed = 1.0;
    controls.minDistance = 1.2;
    controls.maxDistance = 10.0;
    controls.mouseButtons = {
      LEFT: -1 as any,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };

    let isRotatingCamera = false;
    let isCameraMoving = false;
    let renderRequested = false;
    let animId: number | null = null;

    requestRender = () => {
      if (!renderRequested) {
        renderRequested = true;
        animId = requestAnimationFrame(renderFrame);
      }
    };

    function renderFrame() {
      renderRequested = false;
      animId = null;
      const needsMoreFrames = controls.update();
      renderer.render(scene, camera);
      const stillMoving = needsMoreFrames || isRotatingCamera;
      if (isCameraMoving && !stillMoving) {
        refreshNodeView();
      }
      isCameraMoving = stillMoving;
      if (stillMoving) {
        requestRender();
      }
    }

    controls.addEventListener("start", () => {
      isRotatingCamera = true;
      isCameraMoving = true;
      if (nodeHighlightRing) nodeHighlightRing.visible = false;
      guidedNodes?.hideRing();
      requestRender();
    });
    controls.addEventListener("change", requestRender);
    controls.addEventListener("end", () => {
      isRotatingCamera = false;
      markDirtyRef.current();
    });

    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(2.5, 4, 4.5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
    fillLight.position.set(-2.5, -2, -4.5);
    scene.add(fillLight);

    const cageGridGroup = new THREE.Group();
    const cageGeo = new THREE.SphereGeometry(
      1.48,
      16,
      10,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.72,
    );
    const lineMesh = new THREE.LineSegments(
      new THREE.WireframeGeometry(cageGeo),
      new THREE.LineBasicMaterial({
        color: 0x2563eb,
        transparent: true,
        opacity: 0.15,
      }),
    );
    lineMesh.position.set(0, 0.52, 0);
    cageGridGroup.add(lineMesh);
    scene.add(cageGridGroup);

    document.getElementById("cageToggleBtn")!.addEventListener(
      "click",
      (e: any) => {
        cageGridGroup.visible = !cageGridGroup.visible;
        e.target.textContent = `🌐 Lồng Lưới: ${cageGridGroup.visible ? "BẬT" : "TẮT"}`;
        e.target.classList.toggle("toggle-on", cageGridGroup.visible);
        requestRender();
      },
      { signal: eventController.signal },
    );

    let runtimeMeshFillVisible = true;
    const toggleMeshFillBtn = document.getElementById("toggleMeshFillBtn")!;
    toggleMeshFillBtn.addEventListener(
      "click",
      () => {
        runtimeMeshFillVisible = !runtimeMeshFillVisible;
        guidedNodes?.setFillVisible(runtimeMeshFillVisible);
        scene.traverse((obj: any) => {
          if (obj.isMesh && obj.userData && obj.userData.isFillMesh) {
            obj.visible = runtimeMeshFillVisible;
          }
        });
        toggleMeshFillBtn.textContent = `🎨 Màu Mảng: ${runtimeMeshFillVisible ? "BẬT" : "TẮT"}`;
        toggleMeshFillBtn.classList.toggle("toggle-on", runtimeMeshFillVisible);
        requestRender();
      },
      { signal: eventController.signal },
    );

    drawBaseGuides();
    const texture = new THREE.CanvasTexture(texCanvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const geoFallback = new THREE.SphereGeometry(1.05, 64, 48);
    const pos = geoFallback.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i);
      if (y > 0) {
        y *= 1.18;
        x *= 1 - y * 0.06;
      } else {
        y *= 1.02;
        x *= 1 - Math.abs(y) * 0.22;
        z *= 1 - Math.abs(y) * 0.08;
      }
      if (z > 0.1 && Math.abs(y) < 0.75) z *= 0.88;
      if (z < 0) z *= 1.05;
      pos.setXYZ(i, x, y, z);
    }
    geoFallback.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      color: 0xffffff,
      roughness: 0.6,
      metalness: 0.1,
    });
    let headMesh = new THREE.Mesh(geoFallback, material);
    headMesh.position.y = 0.55;
    scene.add(headMesh);
    let paintTarget: THREE.Mesh = headMesh;

    new GLTFLoader().load(
      "head-model.glb",
      (gltf) => {
        const root = gltf.scene;
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        const scale = 2.3 / Math.max(size.x, size.y, size.z);
        root.scale.setScalar(scale);
        const center2 = new THREE.Vector3();
        box.getCenter(center2);
        root.position.sub(center2);
        root.position.y += 0.35;

        let bestMesh: any = null,
          bestCount = -1;
        root.traverse((o: any) => {
          if (o.isMesh && o.geometry?.attributes?.position) {
            o.material = new THREE.MeshStandardMaterial({
              map: texture,
              color: 0xffffff,
              roughness: 0.6,
              metalness: 0.05,
            });
            const count = o.geometry.attributes.position.count;
            if (count > bestCount) {
              bestCount = count;
              bestMesh = o;
            }
          }
        });
        if (bestMesh) {
          headMesh.visible = false;
          scene.add(root);
          paintTarget = bestMesh;
          requestRender();
        }
      },
      undefined,
      () => {
        paintTarget = headMesh;
        requestRender();
      },
    );

    resizeRenderer();
    redrawTexture();
    requestRender();

    // --- 5. RAYCASTING & TÍNH TOÁN TOẠ ĐỘ ---
    const raycaster = new THREE.Raycaster();
    const mouseNDC = new THREE.Vector2();

    function setMouseFromEvent(e: any) {
      const rect = glcanvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      mouseNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouseNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }

    function getScalpSurfaceHit(e: any) {
      setMouseFromEvent(e);
      raycaster.setFromCamera(mouseNDC, camera);
      const hits = raycaster.intersectObject(paintTarget, false);
      if (hits.length && hits[0].face) {
        const point = hits[0].point.clone();
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(
          paintTarget.matrixWorld,
        );
        let normal = hits[0].face.normal
          .clone()
          .applyMatrix3(normalMatrix)
          .normalize();

        // Đảm bảo normal hướng ly tâm ra ngoài sọ manocanh, tránh đâm ngược vào trong
        const headCenter = new THREE.Vector3(0, 0.35, 0);
        const outVec = point.clone().sub(headCenter).normalize();
        if (normal.dot(outVec) < 0.2) {
          normal.lerp(outVec, 0.75).normalize();
        }

        const uv = hits[0].uv
          ? { x: hits[0].uv.x * TEX_SIZE, y: (1 - hits[0].uv.y) * TEX_SIZE }
          : null;
        return { point, normal, uv };
      }
      return null;
    }

    const geodesicRaycaster = new THREE.Raycaster();

    function getGeodesicPointsOnScalp(
      p1: THREE.Vector3,
      p2: THREE.Vector3,
      startUV: { x: number; y: number },
      endUV: { x: number; y: number },
      steps = 14,
    ): Array<{ x: number; y: number }> {
      const headCenter = new THREE.Vector3(0, 0.35, 0);
      const v1 = p1.clone().sub(headCenter);
      const v2 = p2.clone().sub(headCenter);

      const dir1 = v1.clone().normalize();
      const dir2 = v2.clone().normalize();

      const angle = dir1.angleTo(dir2);
      if (angle < 0.01) return [{ x: startUV.x, y: startUV.y }, { x: endUV.x, y: endUV.y }];

      const points: Array<{ x: number; y: number }> = [{ x: startUV.x, y: startUV.y }];
      const sinAngle = Math.sin(angle);
      const currentDir = new THREE.Vector3();
      const rayOrigin = new THREE.Vector3();
      const rayDir = new THREE.Vector3();

      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (sinAngle > 0.0001) {
          const w1 = Math.sin((1 - t) * angle) / sinAngle;
          const w2 = Math.sin(t * angle) / sinAngle;
          currentDir.copy(dir1).multiplyScalar(w1).addScaledVector(dir2, w2).normalize();
        } else {
          currentDir.copy(dir1).lerp(dir2, t).normalize();
        }

        // Bắn ray từ ngoài hướng vào tâm đầu C để lấy giao điểm mặt sọ ngoài
        rayOrigin.copy(headCenter).addScaledVector(currentDir, 3.0);
        rayDir.copy(currentDir).negate();
        geodesicRaycaster.set(rayOrigin, rayDir);
        const hits = geodesicRaycaster.intersectObject(paintTarget, false);
        if (hits.length > 0 && hits[0].uv) {
          points.push({
            x: hits[0].uv.x * TEX_SIZE,
            y: (1 - hits[0].uv.y) * TEX_SIZE,
          });
        }
      }
      points.push({ x: endUV.x, y: endUV.y });
      return points;
    }

    function get3DPointAnywhere(e?: any) {
      if (e) setMouseFromEvent(e);
      raycaster.setFromCamera(mouseNDC, camera);
      const hits = raycaster.intersectObject(paintTarget, false);
      if (hits.length > 0) return hits[0].point.clone();

      let planeAnchor = new THREE.Vector3(0, 0.3, 0);
      if (permStartHit) planeAnchor = permStartHit.point;
      else if (activeChain3D.length > 0)
        planeAnchor = activeChain3D[activeChain3D.length - 1].pos;

      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        camDir.negate(),
        planeAnchor,
      );
      const target = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, target)) return target;
      return null;
    }

    // --- 6. HỆ THỐNG DỰNG ĐA GIÁC 3D VÀ HỘP CẮT TÓC ---
    let active2DChain: any[] = [];
    let isPenDrawing = false;
    let penPoints: any[] = [];
    let isDrawPreviewPending = false;
    let pendingDrawHit: any = null;
    let activeChain3D: any[] = [];
    const allNodes3D: any[] = [];
    let previewLine3D: any = null;
    let previewAngleSprite: any = null;
    nodeHighlightRing = null;

    const createdArrowObjects: any[] = [];
    let autoRectStep = 0;
    let autoRectHitA: any = null;
    let autoRectMarkerA: any = null;

    interface ConnectableTipData {
      id: string;
      topPos: THREE.Vector3;
      scalpPos: THREE.Vector3;
      normal: THREE.Vector3;
      color?: string;
      sourceType: "arrow" | "guidedNode";
      rawObj: any;
    }
    let connectTipStart: ConnectableTipData | null = null;
    let hoveredConnectTip: ConnectableTipData | null = null;
    let previewConnectLine: THREE.Line | null = null;
    let previewConnectQuadGroup: THREE.Group | null = null;
    const connectTipsMarkersGroup = new THREE.Group();
    connectTipsMarkersGroup.name = "connectTipsMarkersGroup";
    scene.add(connectTipsMarkersGroup);

    let permStartHit: any = null;
    let permStep = 0;
    let previewPermGroup: any = null;
    let isEditingPerm = false;
    let editingPermIndex = -1;
    let editingPermOriginalItem: any = null;

    const ringGeo = new THREE.RingGeometry(0.03, 0.05, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
    });
    nodeHighlightRing = new THREE.Mesh(ringGeo, ringMat);
    nodeHighlightRing.visible = false;
    scene.add(nodeHighlightRing);

    function findNearby3DNode(
      _targetPoint: THREE.Vector3,
      screenRadiusPixels = 30,
    ) {
      let bestIdx = -1,
        minDistancePixels = screenRadiusPixels;
      const canvasRect = glcanvas.getBoundingClientRect();
      const tempVec = new THREE.Vector3();

      allNodes3D.forEach((nd, idx) => {
        if (!nd.marker || !nd.marker.parent || nd.marker.visible === false)
          return;
        if (!isPointVisible(nd.pos, camera, paintTarget)) return;
        tempVec.copy(nd.pos).project(camera);
        if (tempVec.z > 1) return;
        const nodeScreenX = ((tempVec.x + 1) * canvasRect.width) / 2;
        const nodeScreenY = ((-tempVec.y + 1) * canvasRect.height) / 2;
        const mouseScreenX = ((mouseNDC.x + 1) * canvasRect.width) / 2;
        const mouseScreenY = ((-mouseNDC.y + 1) * canvasRect.height) / 2;
        const distPixels = Math.hypot(
          nodeScreenX - mouseScreenX,
          nodeScreenY - mouseScreenY,
        );
        if (distPixels < minDistancePixels) {
          minDistancePixels = distPixels;
          bestIdx = idx;
        }
      });
      return bestIdx;
    }

    function getAllConnectableTips(): ConnectableTipData[] {
      const tips: ConnectableTipData[] = [];
      const seenIds = new Set<string>();

      createdArrowObjects.forEach((arr) => {
        if (!arr || !arr.topPos || !arr.scalpPos) return;
        if (arr.group && arr.group.parent && arr.group.visible === false) return;
        if (!seenIds.has(arr.id)) {
          seenIds.add(arr.id);
          tips.push({
            id: arr.id,
            topPos: arr.topPos,
            scalpPos: arr.scalpPos,
            normal: arr.normal || new THREE.Vector3(0, 1, 0),
            color: arr.color,
            sourceType: "arrow",
            rawObj: arr,
          });
        }
      });

      if (guidedNodes) {
        const gnList = guidedNodes.getNodesList();
        gnList.forEach((gn) => {
          if (!seenIds.has(gn.id)) {
            seenIds.add(gn.id);
            tips.push({
              id: gn.id,
              topPos: gn.tip,
              scalpPos: gn.root,
              normal: gn.normal,
              color: gn.color,
              sourceType: "guidedNode",
              rawObj: gn,
            });
          }
        });
      }

      return tips;
    }

    function findNearbyConnectableTip(screenRadiusPixels = 35): ConnectableTipData | null {
      const tips = getAllConnectableTips();
      let bestTip: ConnectableTipData | null = null;
      let minDistance = screenRadiusPixels;
      const canvasRect = glcanvas.getBoundingClientRect();
      const tempVec = new THREE.Vector3();

      tips.forEach((tip) => {
        if (!isPointVisible(tip.topPos, camera, paintTarget)) return;
        tempVec.copy(tip.topPos).project(camera);
        if (tempVec.z > 1) return;
        const tipScreenX = ((tempVec.x + 1) * canvasRect.width) / 2;
        const tipScreenY = ((-tempVec.y + 1) * canvasRect.height) / 2;
        const mouseScreenX = ((mouseNDC.x + 1) * canvasRect.width) / 2;
        const mouseScreenY = ((-mouseNDC.y + 1) * canvasRect.height) / 2;
        const distPixels = Math.hypot(
          tipScreenX - mouseScreenX,
          tipScreenY - mouseScreenY,
        );
        if (distPixels < minDistance) {
          minDistance = distPixels;
          bestTip = tip;
        }
      });
      return bestTip;
    }

    function updateConnectTipsSnapMarkers() {
      while (connectTipsMarkersGroup.children.length > 0) {
        const child = connectTipsMarkersGroup.children[0];
        connectTipsMarkersGroup.remove(child);
        disposeObjectRecursively(child);
      }

      if (mode !== "space" || active3DSubTool !== "connectTips") {
        return;
      }

      const tips = getAllConnectableTips();
      tips.forEach((tip) => {
        const isStart = connectTipStart && connectTipStart.id === tip.id;
        const isHovered = hoveredConnectTip && hoveredConnectTip.id === tip.id;

        const markerGroup = new THREE.Group();
        markerGroup.position.copy(tip.topPos);

        let ringColor = 0x06b6d4; // Cyan neon
        let sphereRadius = 0.022;
        let ringOuterRadius = 0.045;

        if (isStart) {
          ringColor = 0xf59e0b; // Amber Gold cho Đỉnh 1 đã chọn
          sphereRadius = 0.032;
          ringOuterRadius = 0.058;
        } else if (isHovered) {
          ringColor = 0x10b981; // Emerald Green khi hút snap
          sphereRadius = 0.028;
          ringOuterRadius = 0.052;
        }

        const sphereGeo = new THREE.SphereGeometry(sphereRadius, 16, 12);
        const sphereMat = new THREE.MeshBasicMaterial({
          color: ringColor,
          depthTest: true,
        });
        const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
        markerGroup.add(sphereMesh);

        const haloGeo = new THREE.SphereGeometry(ringOuterRadius, 16, 12);
        const haloMat = new THREE.MeshBasicMaterial({
          color: ringColor,
          transparent: true,
          opacity: isStart ? 0.45 : isHovered ? 0.35 : 0.2,
          depthWrite: false,
        });
        const haloMesh = new THREE.Mesh(haloGeo, haloMat);
        markerGroup.add(haloMesh);

        connectTipsMarkersGroup.add(markerGroup);
      });
    }

    function orientConnectTipsMarkers() {}

    function findNearbyScalpSnap(screenRadiusPixels = 26): { point: THREE.Vector3; normal: THREE.Vector3 } | null {
      if (!is2DSnapEnabled) return null;

      const candidates: Array<{ point: THREE.Vector3; normal: THREE.Vector3 }> = [];
      createdArrowObjects.forEach((arr) => {
        if (arr.scalpPos) candidates.push({ point: arr.scalpPos, normal: arr.normal || new THREE.Vector3(0, 1, 0) });
      });
      if (guidedNodes) {
        guidedNodes.getNodesList().forEach((gn) => {
          candidates.push({ point: gn.root, normal: gn.normal });
        });
      }
      allNodes3D.forEach((nd) => {
        if (nd.pos) candidates.push({ point: nd.pos, normal: new THREE.Vector3(0, 1, 0) });
      });
      historyStack.forEach((item) => {
        if (item.hitA?.point) {
          candidates.push({
            point: new THREE.Vector3(...item.hitA.point),
            normal: new THREE.Vector3(...(item.hitA.normal || [0, 1, 0])),
          });
        }
        if (item.hitB?.point) {
          candidates.push({
            point: new THREE.Vector3(...item.hitB.point),
            normal: new THREE.Vector3(...(item.hitB.normal || [0, 1, 0])),
          });
        }
        if (item.hit?.point) {
          candidates.push({
            point: new THREE.Vector3(...item.hit.point),
            normal: new THREE.Vector3(...(item.hit.normal || [0, 1, 0])),
          });
        }
        if (item.posA) candidates.push({ point: item.posA, normal: new THREE.Vector3(0, 1, 0) });
        if (item.posB) candidates.push({ point: item.posB, normal: new THREE.Vector3(0, 1, 0) });
      });

      const canvasRect = glcanvas.getBoundingClientRect();
      const tempVec = new THREE.Vector3();
      let bestCandidate: { point: THREE.Vector3; normal: THREE.Vector3 } | null = null;
      let minDistance = screenRadiusPixels;

      candidates.forEach((cand) => {
        if (!isPointVisible(cand.point, camera, paintTarget)) return;
        tempVec.copy(cand.point).project(camera);
        if (tempVec.z > 1) return;
        const screenX = ((tempVec.x + 1) * canvasRect.width) / 2;
        const screenY = ((-tempVec.y + 1) * canvasRect.height) / 2;
        const mouseX = ((mouseNDC.x + 1) * canvasRect.width) / 2;
        const mouseY = ((-mouseNDC.y + 1) * canvasRect.height) / 2;
        const dist = Math.hypot(screenX - mouseX, screenY - mouseY);
        if (dist < minDistance) {
          minDistance = dist;
          bestCandidate = cand;
        }
      });

      return bestCandidate;
    }

    function createNodeMarker(posVec: THREE.Vector3, color: any) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 12, 12),
        new THREE.MeshBasicMaterial({ color }),
      );
      marker.position.copy(posVec);
      scene.add(marker);
      return marker;
    }

    function create3DLineSegment(
      posA: THREE.Vector3,
      posB: THREE.Vector3,
      color: any,
    ) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([posA, posB]),
        new THREE.LineBasicMaterial({ color, linewidth: 3 }),
      );
      scene.add(line);
      return line;
    }

    function create3DFilledMesh(points: THREE.Vector3[], color: any) {
      if (points.length < 3) return null;
      const vertices: number[] = [];
      for (let i = 1; i < points.length - 1; i++) {
        vertices.push(
          points[0].x,
          points[0].y,
          points[0].z,
          points[i].x,
          points[i].y,
          points[i].z,
          points[i + 1].x,
          points[i + 1].y,
          points[i + 1].z,
        );
      }
      const meshGeo = new THREE.BufferGeometry();
      meshGeo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3),
      );
      meshGeo.computeVertexNormals();
      const mesh = new THREE.Mesh(
        meshGeo,
        new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.38,
          depthWrite: false,
        }),
      );
      mesh.visible = runtimeMeshFillVisible;
      mesh.userData = { isFillMesh: true };
      scene.add(mesh);
      return mesh;
    }

    function createElevationArrow3D(
      hitScalp: any,
      length = 0.45,
      angleDeg = 90,
      dirDeg = 0,
      colorHex = "#2563eb",
      id: string = crypto.randomUUID(),
    ) {
      const arrowData = createElevationArrow3DHelper(
        hitScalp,
        length,
        angleDeg,
        dirDeg,
        colorHex,
        id,
        scene,
      );
      createdArrowObjects.push(arrowData);
      return arrowData;
    }

    function createAutoRectSection3D(
      hitA: any,
      hitB: any,
      length = 0.45,
      colorHex = "#2563eb",
      arrowIds: [string, string] = [crypto.randomUUID(), crypto.randomUUID()],
    ) {
      const result = createAutoRectSection3DHelper(
        hitA,
        hitB,
        length,
        colorHex,
        arrowIds,
        runtimeMeshFillVisible,
        scene,
      );
      createdArrowObjects.push(result.tipA, result.tipB);
      return result;
    }

    function create3DBoxQuad(arrowA: any, arrowB: any, colorHex = "#2563eb") {
      return create3DBoxQuadHelper(
        arrowA,
        arrowB,
        colorHex,
        runtimeMeshFillVisible,
        scene,
      );
    }

    // --- 7. UỐN TÓC 3D VÀ SÓNG ---
    function createPermRod3D(hitScalp: any, sizeMM = "19", angleDeg = 90) {
      return createPermRod3DHelper(hitScalp, sizeMM, angleDeg, scene);
    }

    function createStraightAxisPermWave3D(
      hitScalp: any,
      waveType = "curlC",
      length = 0.45,
      amp = 0.1,
      colorHex = "#2563eb",
      targetPos: any = null,
      rollDeg = 90,
    ) {
      return createStraightAxisPermWave3DHelper(
        hitScalp,
        waveType,
        length,
        amp,
        colorHex,
        targetPos,
        rollDeg,
        scene,
      );
    }

    function findIntersectedPermWave(e: any) {
      setMouseFromEvent(e);
      return findIntersectedPermWaveHelper(
        mouseNDC,
        camera,
        raycaster,
        historyStack,
      );
    }

    function triggerPermPreviewUpdate() {
      if (mode !== "perm") return;
      const amp = parseFloat(waveAmpPicker.value);
      const rollDeg = parseInt(waveRollPicker.value, 10);
      const colorHex = colorPicker.value;
      const extrudeLen = parseFloat(extrudeLenPicker.value);

      if (isEditingPerm && editingPermOriginalItem) {
        const targetPos = get3DPointAnywhere();
        if (targetPos) {
          if (previewPermGroup) disposeObjectRecursively(previewPermGroup);
          previewPermGroup = createStraightAxisPermWave3D(
            editingPermOriginalItem.scalpHit,
            editingPermOriginalItem.waveType,
            extrudeLen,
            amp,
            colorHex,
            targetPos,
            rollDeg,
          );
        }
      } else if (permStep === 1 && permStartHit) {
        const targetPos = get3DPointAnywhere();
        if (targetPos) {
          if (previewPermGroup) disposeObjectRecursively(previewPermGroup);
          previewPermGroup = createStraightAxisPermWave3D(
            permStartHit,
            activePermSubTool,
            extrudeLen,
            amp,
            colorHex,
            targetPos,
            rollDeg,
          );
        }
      }
      requestRender();
    }

    if (waveRollPicker) {
      waveRollPicker.addEventListener(
        "change",
        () => {
          if (mode === "perm") triggerPermPreviewUpdate();
        },
        { signal: eventController.signal },
      );
    }

    function resetChainState() {
      guidedNodes?.breakChain();
      active2DChain = [];
      isDrawPreviewPending = false;
      pendingDrawHit = null;
      isPenDrawing = false;
      penPoints = [];
      permStartHit = null;
      permStep = 0;
      isEditingPerm = false;
      editingPermIndex = -1;
      editingPermOriginalItem = null;
      if (previewPermGroup) {
        disposeObjectRecursively(previewPermGroup);
        previewPermGroup = null;
      }
      activeChain3D = [];
      autoRectStep = 0;
      autoRectHitA = null;
      if (autoRectMarkerA) {
        disposeObjectRecursively(autoRectMarkerA);
        autoRectMarkerA = null;
      }
      connectTipStart = null;
      hoveredConnectTip = null;
      if (previewConnectLine) {
        disposeObjectRecursively(previewConnectLine);
        previewConnectLine = null;
      }
      if (previewConnectQuadGroup) {
        disposeObjectRecursively(previewConnectQuadGroup);
        previewConnectQuadGroup = null;
      }
      updateConnectTipsSnapMarkers();
      if (previewLine3D) {
        disposeObjectRecursively(previewLine3D);
        previewLine3D = null;
      }
      if (previewAngleSprite) {
        disposeObjectRecursively(previewAngleSprite);
        previewAngleSprite = null;
      }
      if (nodeHighlightRing) nodeHighlightRing.visible = false;
      glcanvas.style.cursor = "crosshair";
      redrawTexture();
    }

    // --- 8. TIMELINE STEP-BY-STEP (SBS) ---
    const timelineSlider = document.getElementById(
      "timelineSlider",
    ) as HTMLInputElement;
    const timelineStatus = document.getElementById(
      "timelineStatus",
    ) as HTMLSpanElement;
    const undoBtn = document.getElementById("undoBtn") as HTMLButtonElement;
    const redoBtn = document.getElementById("redoBtn") as HTMLButtonElement;
    const clearBtn = document.getElementById("clearBtn") as HTMLButtonElement;

    function updateTimelineUI() {
      timelineSlider.max = historyStack.length.toString();
      timelineSlider.value = timelineIndex.toString();
      timelineStatus.textContent = `${timelineIndex}/${historyStack.length}`;
      undoBtn.disabled = timelineIndex === 0;
      redoBtn.disabled = timelineIndex >= historyStack.length;
      clearBtn.disabled = !historyStack.some((_, index) =>
        isHistoryItemVisible(historyStack, index, timelineIndex),
      );
      guidedNodes?.renderHistory(historyStack, timelineIndex);
    }

    function pushHistory(item: any) {
      if (timelineIndex < historyStack.length) {
        const toRemove = historyStack.slice(timelineIndex);
        toRemove.forEach((itm) => {
          if (itm.marker) disposeObjectRecursively(itm.marker);
          if (itm.line) disposeObjectRecursively(itm.line);
          if (itm.sprite) disposeObjectRecursively(itm.sprite);
          if (itm.mesh) disposeObjectRecursively(itm.mesh);
          if (itm.arrowData) disposeObjectRecursively(itm.arrowData.group);
          if (itm.boxGroup) disposeObjectRecursively(itm.boxGroup);
          if (itm.group) disposeObjectRecursively(itm.group);
          // Dọn zombie tipA/tipB khỏi mảng createdArrowObjects
          if (itm.tipA) {
            const idxA = createdArrowObjects.indexOf(itm.tipA);
            if (idxA !== -1) createdArrowObjects.splice(idxA, 1);
          }
          if (itm.tipB) {
            const idxB = createdArrowObjects.indexOf(itm.tipB);
            if (idxB !== -1) createdArrowObjects.splice(idxB, 1);
          }
          if (itm.arrowData) {
            const idxArr = createdArrowObjects.indexOf(itm.arrowData);
            if (idxArr !== -1) createdArrowObjects.splice(idxArr, 1);
          }
        });
        historyStack.length = timelineIndex;
      }
      historyStack.push(item);
      timelineIndex = historyStack.length;
      updateTimelineUI();
      redrawTexture();
      markDirtyRef.current();
    }

    function renderTimelineAt(stepIndex: number, trackChange = true) {
      timelineIndex = clampHistoryStep(historyStack.length, stepIndex);
      updateTimelineUI();
      for (let i = 0; i < historyStack.length; i++) {
        const item = historyStack[i];
        const isVisible = isHistoryItemVisible(historyStack, i, timelineIndex);
        if (item.marker) item.marker.visible = isVisible;
        if (item.line) item.line.visible = isVisible;
        if (item.sprite) item.sprite.visible = isVisible;
        if (item.mesh) item.mesh.visible = isVisible;
        if (item.arrowData) item.arrowData.group.visible = isVisible;
        if (item.boxGroup) item.boxGroup.visible = isVisible;
        if (item.group) item.group.visible = isVisible;
      }
      redrawTexture();
      updateConnectTipsSnapMarkers();
      if (trackChange) markDirtyRef.current();
    }

    function undoHistory() {
      guidedNodes?.cancelDraft();
      stopPlayback();
      if (timelineIndex > 0) renderTimelineAt(timelineIndex - 1);
    }

    function redoHistory() {
      guidedNodes?.cancelDraft();
      stopPlayback();
      if (timelineIndex < historyStack.length)
        renderTimelineAt(timelineIndex + 1);
    }

    timelineSlider.addEventListener(
      "input",
      (e: any) => {
        guidedNodes?.cancelDraft();
        renderTimelineAt(parseInt(e.target.value, 10));
      },
      { signal: eventController.signal },
    );
    document.getElementById("prevBtn")!.addEventListener(
      "click",
      () => {
        guidedNodes?.cancelDraft();
        if (timelineIndex > 0) renderTimelineAt(timelineIndex - 1);
      },
      { signal: eventController.signal },
    );
    document.getElementById("nextBtn")!.addEventListener(
      "click",
      () => {
        guidedNodes?.cancelDraft();
        if (timelineIndex < historyStack.length)
          renderTimelineAt(timelineIndex + 1);
      },
      { signal: eventController.signal },
    );

    const playBtn = document.getElementById("playBtn")!;
    function stopPlayback() {
      isPlaying = false;
      clearInterval(playTimer);
      playBtn.textContent = "▶ Phát";
    }

    playBtn.addEventListener(
      "click",
      () => {
        guidedNodes?.cancelDraft();
        if (isPlaying) {
          stopPlayback();
        } else {
          if (historyStack.length === 0) return;
          isPlaying = true;
          playBtn.textContent = "⏸ Tạm dừng";
          if (timelineIndex >= historyStack.length) renderTimelineAt(0, false);
          playTimer = setInterval(() => {
            if (timelineIndex < historyStack.length)
              renderTimelineAt(timelineIndex + 1, false);
            else stopPlayback();
          }, 700);
        }
      },
      { signal: eventController.signal },
    );

    guidedNodes = new GuidedNodes({
      scene,
      camera,
      canvas: glcanvas,
      head: () => paintTarget,
      scalpHit: getScalpSurfaceHit,
      color: () => colorPicker.value,
      fit: (points) => {
        const box = new THREE.Box3().setFromObject(paintTarget);
        const corners = [box.min.x, box.max.x].flatMap((x) =>
          [box.min.y, box.max.y].flatMap((y) =>
            [box.min.z, box.max.z].map((z) => new THREE.Vector3(x, y, z)),
          ),
        );
        const targets = [...corners, ...points];
        for (let attempt = 0; attempt < 16; attempt++) {
          camera.updateMatrixWorld();
          const outside = targets.some((point) => {
            const p = point.clone().project(camera);
            return (
              Math.abs(p.x) > 0.87 ||
              Math.abs(p.y) > 0.87 ||
              p.z < -1 ||
              p.z > 1
            );
          });
          if (!outside) break;
          camera.position
            .sub(controls.target)
            .multiplyScalar(1.15)
            .add(controls.target);
          controls.update();
        }
        requestRender();
      },
      push: (entry) => {
        stopPlayback();
        pushHistory(entry);
      },
      onRequestRender: requestRender,
    });
    updateTimelineUI();
    function updateNodeTool() {
      const guided =
        mode === "space" &&
        active3DSubTool === "node3d" &&
        nodePlacementMode.value === "guided";
      guidedNodes?.setEnabled(guided);

      const arrowSettings = document.getElementById("groupArrowSettings");
      if (arrowSettings) {
        arrowSettings.style.display =
          mode === "space" && active3DSubTool === "arrow90" ? "" : "none";
      }

      updateConnectTipsSnapMarkers();

      if (mode === "space") {
        if (active3DSubTool === "node3d") {
          modeHint.textContent = guided
            ? "Chọn chân tóc trên đầu → chỉnh góc / độ dài ở bên phải → Đặt điểm. Bấm điểm cũ để sửa."
            : "Nâng cao: đặt điểm tự do. Ngoài đầu, điểm nằm trên mặt phẳng theo góc nhìn. Shift: khóa góc 90°.";
        } else if (active3DSubTool === "autoRect3D") {
          modeHint.textContent =
            "⚡ Mảng Hộp 90°: Rê chuột lại gần mốc cũ để hít dính (Snap) ➔ Click điểm A, click điểm B để tạo mảng!";
        } else if (active3DSubTool === "arrow90") {
          modeHint.textContent =
            "🏹 Mũi Tên Góc Tự Do: Chỉnh góc nâng và hướng ngả ở cột phải ➔ Click lên da đầu để cắm hướng nâng!";
        } else if (active3DSubTool === "connectTips") {
          modeHint.textContent =
            "🔗 Nối Đỉnh Hộp: Di chuột tới các đỉnh phát sáng (Snap) và click Đỉnh 1, sau đó click Đỉnh 2 để nối mảng!";
        }
      }
    }

    const arrowAngleInput = document.getElementById(
      "arrowAngle",
    ) as HTMLInputElement | null;
    const arrowAngleValue = document.getElementById("arrowAngleValue");
    if (arrowAngleInput && arrowAngleValue) {
      arrowAngleInput.addEventListener(
        "input",
        () => {
          arrowAngleValue.textContent = `${arrowAngleInput.value}°`;
          document
            .querySelectorAll<HTMLButtonElement>("[data-arrow-angle]")
            .forEach((b) => {
              b.classList.toggle(
                "active",
                b.dataset.arrowAngle === arrowAngleInput.value,
              );
            });
        },
        { signal: eventController.signal },
      );
    }
    document
      .querySelectorAll<HTMLButtonElement>("[data-arrow-angle]")
      .forEach((btn) => {
        btn.addEventListener(
          "click",
          () => {
            if (arrowAngleInput && arrowAngleValue) {
              arrowAngleInput.value = btn.dataset.arrowAngle!;
              arrowAngleValue.textContent = `${arrowAngleInput.value}°`;
              document
                .querySelectorAll<HTMLButtonElement>("[data-arrow-angle]")
                .forEach((b) => b.classList.remove("active"));
              btn.classList.add("active");
            }
          },
          { signal: eventController.signal },
        );
      });
    nodePlacementMode.addEventListener(
      "change",
      () => {
        resetChainState();
        updateNodeTool();
      },
      { signal: eventController.signal },
    );
    refreshNodeView = () => {
      guidedNodes?.viewChanged();
      orientConnectTipsMarkers();
    };
    glcanvas.addEventListener("pointerleave", refreshNodeView, {
      signal: eventController.signal,
    });
    updateNodeTool();

    // --- 9. SỰ KIỆN POINTERDOWN (CLICK CHUỘT TRÁI) ---
    glcanvas.addEventListener(
      "pointerdown",
      (e) => {
        if (e.button !== 0) return;
        const colorHex = colorPicker.value;
        const width = parseInt(widthPicker.value, 10);
        const extrudeLen = parseFloat(extrudeLenPicker.value);

        if (mode === "draw") {
          const hit = getScalpSurfaceHit(e);
          if (!hit || !hit.uv) return;
          let currentUV = hit.uv;

          if (is2DSnapEnabled) {
            historyStack.forEach((item) => {
              if (item.kind === "texture" && item.action) {
                const a = item.action;
                const pts = a.points
                  ? a.points
                  : a.x1 !== undefined
                    ? [
                        { x: a.x1, y: a.y1 },
                        { x: a.x2, y: a.y2 },
                      ]
                    : [];
                pts.forEach((p: any) => {
                  if (Math.hypot(p.x - currentUV.x, p.y - currentUV.y) < 22)
                    currentUV = { x: p.x, y: p.y };
                });
              }
            });
          }

          if (current2DTool === "pen" || current2DTool === "eraser") {
            isPenDrawing = true;
            penPoints = [hit.uv];
            return;
          }

          if (current2DTool === "text") {
            const text = prompt("Nhập nội dung ghi chú:");
            if (text) {
              pushHistory({
                kind: "texture",
                action: {
                  type: "text",
                  x: currentUV.x,
                  y: currentUV.y,
                  text,
                  color: colorHex,
                  fontSize: 14 + width * 2,
                },
              });
            }
            return;
          }

          if (
            current2DTool === "sticker-clipper" ||
            current2DTool === "sticker-razor"
          ) {
            const subtype =
              current2DTool === "sticker-clipper" ? "clipper" : "razor";
            pushHistory({
              kind: "texture",
              action: {
                type: "sticker",
                subtype,
                x: currentUV.x,
                y: currentUV.y,
                size: 30 + width * 4,
                color: colorHex,
              },
            });
            return;
          }

          const currentPt = {
            x: currentUV.x,
            y: currentUV.y,
            point3D: hit.point.clone(),
          };

          if (active2DChain.length >= 3) {
            const startA = active2DChain[0];
            if (
              Math.hypot(currentUV.x - startA.x, currentUV.y - startA.y) < 25
            ) {
              const lastPt = active2DChain[active2DChain.length - 1];
              let closeStraightPts: Array<{ x: number; y: number }> | undefined = undefined;
              if (draw2DPathMode === "straight" && lastPt.point3D && startA.point3D) {
                const geo = getGeodesicPointsOnScalp(
                  lastPt.point3D,
                  startA.point3D,
                  { x: lastPt.x, y: lastPt.y },
                  { x: startA.x, y: startA.y },
                  14,
                );
                if (geo.length > 1) closeStraightPts = geo;
              }
              pushHistory({
                kind: "texture",
                action: {
                  type: current2DTool,
                  x1: lastPt.x,
                  y1: lastPt.y,
                  x2: startA.x,
                  y2: startA.y,
                  color: colorHex,
                  width,
                  pathMode: draw2DPathMode,
                  straightPoints: closeStraightPts,
                },
              });
              resetChainState();
              modeHint.textContent = "🎉 Đã khép kín phân khu 2D da đầu!";
              redrawTexture();
              return;
            }
          }

          if (active2DChain.length > 0) {
            const lastPt = active2DChain[active2DChain.length - 1];
            let straightPts: Array<{ x: number; y: number }> | undefined = undefined;
            if (draw2DPathMode === "straight" && lastPt.point3D && hit.point) {
              const geo = getGeodesicPointsOnScalp(
                lastPt.point3D,
                hit.point,
                { x: lastPt.x, y: lastPt.y },
                { x: currentUV.x, y: currentUV.y },
                14,
              );
              if (geo.length > 1) {
                straightPts = geo;
              }
            }

            let curvePoints: Array<{ x: number; y: number }> | undefined = undefined;
            if (current2DTool === "curve" || current2DTool === "dashedCurve") {
              curvePoints = [...active2DChain.map((p) => ({ x: p.x, y: p.y })), { x: currentUV.x, y: currentUV.y }];
            }

            pushHistory({
              kind: "texture",
              action: {
                type: current2DTool,
                x1: lastPt.x,
                y1: lastPt.y,
                x2: currentUV.x,
                y2: currentUV.y,
                points: curvePoints,
                color: colorHex,
                width,
                pathMode: draw2DPathMode,
                straightPoints: straightPts,
              },
            });
            active2DChain.push(currentPt);
            modeHint.textContent = `✏️ Đã nối ${active2DChain.length} điểm 2D da đầu (${draw2DPathMode === "straight" ? "Thẳng đỉnh đầu" : "Cong ôm sọ"})!`;
          } else {
            active2DChain.push(currentPt);
            modeHint.textContent = `✏️ Đã chọn điểm 1 (${draw2DPathMode === "straight" ? "Thẳng đỉnh đầu" : "Cong ôm sọ"}). Click điểm tiếp theo!`;
          }
          if (previewLine3D) {
            disposeObjectRecursively(previewLine3D);
            previewLine3D = null;
          }
          redrawTexture();
        } else if (mode === "space") {
          if (active3DSubTool === "node3d") {
            stopPlayback();
            if (guidedNodes?.pointerDown(e)) return;
            let point3D = get3DPointAnywhere(e);
            if (!point3D) return;

            if (e.shiftKey && activeChain3D.length >= 2) {
              const posA = activeChain3D[activeChain3D.length - 2].pos;
              const posB = activeChain3D[activeChain3D.length - 1].pos;
              point3D = rightAnglePoint(point3D, posA, posB);
            }

            const nearNodeIdx = findNearby3DNode(point3D);
            const color = new THREE.Color(colorHex);

            if (
              activeChain3D.length >= 3 &&
              nearNodeIdx >= 0 &&
              allNodes3D[nearNodeIdx] === activeChain3D[0]
            ) {
              const startNode = activeChain3D[0];
              const lastNode = activeChain3D[activeChain3D.length - 1];
              const closingLine = create3DLineSegment(
                lastNode.pos,
                startNode.pos,
                color,
              );
              const pointsList = activeChain3D.map((n) => n.pos);
              const filledMesh = create3DFilledMesh(pointsList, color);

              let fixedSprite: any = null;
              if (activeChain3D.length >= 2) {
                const posA = activeChain3D[activeChain3D.length - 2].pos;
                const posB = lastNode.pos,
                  posC = startNode.pos;
                fixedSprite = createAngleSprite(
                  `${calculateAngleBetween2Lines(posA, posB, posC)}°`,
                );
                fixedSprite.position.copy(posB);
                scene.add(fixedSprite);
              }

              pushHistory({
                kind: "space_closed_section",
                line: closingLine,
                sprite: fixedSprite,
                mesh: filledMesh,
                pointsList,
                points: pointsList.map((point: THREE.Vector3) =>
                  point.toArray(),
                ),
                colorHex,
              });
              resetChainState();
              modeHint.textContent = "🎉 Đã khép kín đa giác 3D!";
              return;
            }

            let targetNode =
              nearNodeIdx >= 0
                ? allNodes3D[nearNodeIdx]
                : {
                    id: crypto.randomUUID(),
                    pos: point3D.clone(),
                    marker: createNodeMarker(point3D, color),
                  };
            if (nearNodeIdx < 0) allNodes3D.push(targetNode);

            let line: any = null,
              fixedSprite: any = null;
            if (activeChain3D.length > 0) {
              const lastNode = activeChain3D[activeChain3D.length - 1];
              line = create3DLineSegment(lastNode.pos, targetNode.pos, color);

              if (activeChain3D.length >= 2) {
                const posA = activeChain3D[activeChain3D.length - 2].pos;
                const posB = lastNode.pos,
                  posC = targetNode.pos;
                fixedSprite = createAngleSprite(
                  `${calculateAngleBetween2Lines(posA, posB, posC)}°`,
                );
                fixedSprite.position.copy(posB);
                scene.add(fixedSprite);
              }
            }

            const previousNode =
              activeChain3D.length > 0
                ? activeChain3D[activeChain3D.length - 1]
                : null;
            const angleDeg =
              activeChain3D.length >= 2
                ? calculateAngleBetween2Lines(
                    activeChain3D[activeChain3D.length - 2].pos,
                    previousNode.pos,
                    targetNode.pos,
                  )
                : null;
            activeChain3D.push(targetNode);
            pushHistory({
              kind: "spacepoint",
              marker: targetNode.marker,
              line,
              sprite: fixedSprite,
              nodeId: targetNode.id,
              previousNodeId: previousNode?.id ?? null,
              pos: targetNode.pos.toArray(),
              angleDeg,
              colorHex,
            });
          } else if (active3DSubTool === "autoRect3D") {
            const rawHitScalp = getScalpSurfaceHit(e);
            if (!rawHitScalp) return;
            const snapHit = findNearbyScalpSnap();
            const hitScalp = snapHit || rawHitScalp;

            if (autoRectStep === 0) {
              autoRectHitA = hitScalp;
              autoRectMarkerA = createNodeMarker(autoRectHitA.point, colorHex);
              autoRectStep = 1;
              modeHint.textContent = snapHit
                ? "🧲 Đã hít dính điểm A vào mốc! Click chọn điểm B để kéo Hộp..."
                : "⚡ Đã chọn điểm A! Click chọn điểm B để kéo Hộp 90°...";
            } else {
              if (autoRectMarkerA) {
                disposeObjectRecursively(autoRectMarkerA);
                autoRectMarkerA = null;
              }
              const autoObj = createAutoRectSection3D(
                autoRectHitA,
                hitScalp,
                extrudeLen,
                colorHex,
              );
              pushHistory({
                kind: "autoRectSection",
                group: autoObj.group,
                tipA: autoObj.tipA,
                tipB: autoObj.tipB,
                hitA: {
                  point: autoRectHitA.point.toArray(),
                  normal: autoRectHitA.normal.toArray(),
                },
                hitB: {
                  point: hitScalp.point.toArray(),
                  normal: hitScalp.normal.toArray(),
                },
                arrowIds: [autoObj.tipA.id, autoObj.tipB.id],
                length: extrudeLen,
                colorHex,
              });
              autoRectStep = 0;
              autoRectHitA = null;
              modeHint.textContent = snapHit
                ? "🎉 Đã tạo Mảng Hộp Vuốt Thẳng (Đã hít dính liền mạch)!"
                : "🎉 Đã tạo Mảng Hộp Vuốt Thẳng 90°!";
            }
          } else if (active3DSubTool === "arrow90") {
            const rawHitScalp = getScalpSurfaceHit(e);
            if (!rawHitScalp) return;
            const snapHit = findNearbyScalpSnap();
            const hitScalp = snapHit || rawHitScalp;

            const arrowAngleInput = document.getElementById("arrowAngle") as HTMLInputElement | null;
            const arrowDirInput = document.getElementById("arrowDirection") as HTMLSelectElement | null;
            const angleDeg = arrowAngleInput ? parseFloat(arrowAngleInput.value) : 90;
            const dirDeg = arrowDirInput ? parseFloat(arrowDirInput.value) : 0;

            const arrowData = createElevationArrow3D(
              hitScalp,
              extrudeLen,
              angleDeg,
              dirDeg,
              colorHex,
            );
            pushHistory({
              kind: "arrow90",
              arrowData,
              arrowId: arrowData.id,
              hit: {
                point: hitScalp.point.toArray(),
                normal: hitScalp.normal.toArray(),
              },
              length: extrudeLen,
              angleDeg,
              dirDeg,
              colorHex,
            });
            modeHint.textContent = `🏹 Đã cắm Mũi Tên Hướng Nâng ${angleDeg}° (Vươn ${(extrudeLen * 100).toFixed(0)}cm)!`;
          } else if (active3DSubTool === "connectTips") {
            const clickedTip = findNearbyConnectableTip(35);
            if (!connectTipStart) {
              if (clickedTip) {
                connectTipStart = clickedTip;
                modeHint.textContent = `📍 Đã chọn Đỉnh 1! Rê chuột và click chọn Đỉnh 2 để nối mảng (Esc hoặc 'Ngắt chuỗi' để hủy).`;
                updateConnectTipsSnapMarkers();
                requestRender();
              } else {
                modeHint.textContent = "⚠️ Hãy click vào một đỉnh sáng màu (Snap) để bắt đầu nối mảng!";
              }
            } else {
              if (clickedTip) {
                if (clickedTip.id === connectTipStart.id) {
                  connectTipStart = null;
                  if (previewConnectLine) previewConnectLine.visible = false;
                  if (previewConnectQuadGroup) previewConnectQuadGroup.visible = false;
                  modeHint.textContent = "Đã bỏ chọn đỉnh. Click vào một đỉnh khác để bắt đầu nối.";
                  updateConnectTipsSnapMarkers();
                  requestRender();
                } else {
                  const arrowA = {
                    id: connectTipStart.id,
                    group: null,
                    scalpPos: connectTipStart.scalpPos,
                    topPos: connectTipStart.topPos,
                    normal: connectTipStart.normal,
                    color: connectTipStart.color || colorHex,
                  };
                  const arrowB = {
                    id: clickedTip.id,
                    group: null,
                    scalpPos: clickedTip.scalpPos,
                    topPos: clickedTip.topPos,
                    normal: clickedTip.normal,
                    color: clickedTip.color || colorHex,
                  };
                  const boxGroup = create3DBoxQuad(arrowA, arrowB, colorHex);
                  pushHistory({
                    kind: "boxQuad",
                    boxGroup,
                    arrowA,
                    arrowB,
                    arrowAId: arrowA.id,
                    arrowBId: arrowB.id,
                    posA_scalp: arrowA.scalpPos.toArray(),
                    posA_top: arrowA.topPos.toArray(),
                    posB_scalp: arrowB.scalpPos.toArray(),
                    posB_top: arrowB.topPos.toArray(),
                    colorHex,
                  });
                  modeHint.textContent = "🎉 Đã tạo mảng nối 3D thành công! Tiếp tục click đỉnh tiếp theo để nối tiếp, hoặc bấm B/Esc để ngắt.";
                  connectTipStart = clickedTip;
                  if (previewConnectLine) previewConnectLine.visible = false;
                  if (previewConnectQuadGroup) previewConnectQuadGroup.visible = false;
                  updateConnectTipsSnapMarkers();
                  requestRender();
                }
              } else {
                connectTipStart = null;
                if (previewConnectLine) previewConnectLine.visible = false;
                if (previewConnectQuadGroup) previewConnectQuadGroup.visible = false;
                modeHint.textContent = "Đã hủy chọn. Click vào một đỉnh để bắt đầu nối lại.";
                updateConnectTipsSnapMarkers();
                requestRender();
              }
            }
          }
        } else if (mode === "perm") {
          if (activePermSubTool === "permRod") {
            const hitScalp = getScalpSurfaceHit(e);
            if (!hitScalp) return;
            const group = createPermRod3D(
              hitScalp,
              rodSizeSelect.value,
              parseInt(rodAngleSelect.value, 10),
            );
            pushHistory({
              kind: "permRod",
              group,
              hit: {
                point: hitScalp.point.toArray(),
                normal: hitScalp.normal.toArray(),
              },
              sizeMM: rodSizeSelect.value,
              angleDeg: parseInt(rodAngleSelect.value, 10),
            });
          } else {
            if (isEditingPerm) {
              const targetPos = get3DPointAnywhere(e);
              const amp = parseFloat(waveAmpPicker.value);
              const rollDeg = parseInt(waveRollPicker.value, 10);
              const updatedGroup = createStraightAxisPermWave3D(
                editingPermOriginalItem.scalpHit,
                editingPermOriginalItem.waveType,
                extrudeLen,
                amp,
                colorHex,
                targetPos,
                rollDeg,
              );
              disposeObjectRecursively(editingPermOriginalItem.group);
              historyStack[editingPermIndex] = {
                kind: "straightPermWave",
                group: updatedGroup,
                scalpHit: editingPermOriginalItem.scalpHit,
                waveType: editingPermOriginalItem.waveType,
                length: extrudeLen,
                amp,
                targetPos,
                rollDeg,
                colorHex,
              };
              markDirtyRef.current();
              resetChainState();
              return;
            }

            if (permStep === 0) {
              const hitWaveIdx = findIntersectedPermWave(e);
              if (hitWaveIdx >= 0) {
                editingPermIndex = hitWaveIdx;
                editingPermOriginalItem = historyStack[hitWaveIdx];
                isEditingPerm = true;
                editingPermOriginalItem.group.visible = false;
                triggerPermPreviewUpdate();
                modeHint.textContent =
                  "✏️ Đang chỉnh sửa tép uốn! Rê chuột ➔ Click để chốt!";
                return;
              }
              const hitScalp = getScalpSurfaceHit(e);
              if (!hitScalp) return;
              permStartHit = hitScalp;
              permStep = 1;
              modeHint.textContent =
                "🌀 Đã cắm chân tóc! Rê chuột để vươn tép uốn ➔ Click để chốt!";
            } else {
              const targetPos = get3DPointAnywhere(e);
              const group = createStraightAxisPermWave3D(
                permStartHit,
                activePermSubTool,
                extrudeLen,
                parseFloat(waveAmpPicker.value),
                colorHex,
                targetPos,
                parseInt(waveRollPicker.value, 10),
              );
              pushHistory({
                kind: "straightPermWave",
                group,
                scalpHit: permStartHit,
                waveType: activePermSubTool,
                length: extrudeLen,
                amp: parseFloat(waveAmpPicker.value),
                targetPos,
                rollDeg: parseInt(waveRollPicker.value, 10),
                colorHex,
              });
              permStartHit = null;
              permStep = 0;
              if (previewPermGroup) {
                disposeObjectRecursively(previewPermGroup);
                previewPermGroup = null;
              }
            }
          }
        }
      },
      { signal: eventController.signal },
    );

    // --- 10. SỰ KIỆN POINTERMOVE & POINTERUP ---
    glcanvas.addEventListener(
      "pointermove",
      (e) => {
        if (isRotatingCamera || isCameraMoving || (e.buttons & 2) !== 0 || (e.buttons & 4) !== 0) return;
        setMouseFromEvent(e);

        if (mode === "draw") {
          const hit = getScalpSurfaceHit(e);
          if (!hit || !hit.uv) return;
          if (isPenDrawing) {
            penPoints.push(hit.uv);
            redrawTexture({
              type: current2DTool,
              points: penPoints,
              color: colorPicker.value,
              width: parseInt(widthPicker.value, 10),
              eraseColor: current2DTool === "eraser" ? "#c5c5c5" : null,
            });
            return;
          }
          if (active2DChain.length > 0) {
            if (previewLine3D) {
              disposeObjectRecursively(previewLine3D);
              previewLine3D = null;
            }
            pendingDrawHit = hit;
            if (!isDrawPreviewPending) {
              isDrawPreviewPending = true;
              requestAnimationFrame(() => {
                isDrawPreviewPending = false;
                if (!pendingDrawHit || active2DChain.length === 0) return;
                const currentHit = pendingDrawHit;
                const lastPt = active2DChain[active2DChain.length - 1];
                if (!lastPt) return;

                let previewStraightPts: Array<{ x: number; y: number }> | undefined = undefined;
                if (draw2DPathMode === "straight" && lastPt.point3D && currentHit.point) {
                  const geo = getGeodesicPointsOnScalp(
                    lastPt.point3D,
                    currentHit.point,
                    { x: lastPt.x, y: lastPt.y },
                    { x: currentHit.uv.x, y: currentHit.uv.y },
                    4,
                  );
                  if (geo.length > 1) previewStraightPts = geo;
                }

                if (current2DTool === "curve" || current2DTool === "dashedCurve") {
                  const previewPoints = [
                    ...active2DChain.map((p) => ({ x: p.x, y: p.y })),
                    { x: currentHit.uv.x, y: currentHit.uv.y },
                  ];
                  redrawTexture({
                    type: current2DTool,
                    points: previewPoints,
                    x1: lastPt.x,
                    y1: lastPt.y,
                    x2: currentHit.uv.x,
                    y2: currentHit.uv.y,
                    straightPoints: previewStraightPts,
                    color: colorPicker.value,
                    width: parseInt(widthPicker.value, 10),
                  });
                } else {
                  redrawTexture({
                    type: current2DTool,
                    x1: lastPt.x,
                    y1: lastPt.y,
                    x2: currentHit.uv.x,
                    y2: currentHit.uv.y,
                    straightPoints: previewStraightPts,
                    color: colorPicker.value,
                    width: parseInt(widthPicker.value, 10),
                  });
                }
              });
            }
          }
        } else if (mode === "space") {
          if (active3DSubTool === "node3d") {
            if (guidedNodes?.pointerMove(e)) return;
            let point3D = get3DPointAnywhere(e);
            if (point3D && e.shiftKey && activeChain3D.length >= 2) {
              point3D = rightAnglePoint(
                point3D,
                activeChain3D[activeChain3D.length - 2].pos,
                activeChain3D[activeChain3D.length - 1].pos,
              );
            }
            if (!point3D) {
              if (nodeHighlightRing.visible) {
                nodeHighlightRing.visible = false;
                requestRender();
              }
              return;
            }
            const nearIdx = findNearby3DNode(point3D);
            if (nearIdx >= 0) {
              nodeHighlightRing.position.copy(allNodes3D[nearIdx].pos);
              nodeHighlightRing.lookAt(camera.position);
              if (!nodeHighlightRing.visible) {
                nodeHighlightRing.visible = true;
                requestRender();
              }
            } else if (nodeHighlightRing.visible) {
              nodeHighlightRing.visible = false;
              requestRender();
            }

            if (activeChain3D.length > 0) {
              const lastNode = activeChain3D[activeChain3D.length - 1];
              const previewPos =
                nearIdx >= 0 ? allNodes3D[nearIdx].pos : point3D;
              const geo = new THREE.BufferGeometry().setFromPoints([
                lastNode.pos,
                previewPos,
              ]);
              if (!previewLine3D) {
                previewLine3D = new THREE.Line(
                  geo,
                  new THREE.LineDashedMaterial({
                    color: 0x00f2fe,
                    dashSize: 0.08,
                    gapSize: 0.04,
                  }),
                );
                scene.add(previewLine3D);
              } else {
                previewLine3D.geometry.dispose();
                previewLine3D.geometry = geo;
              }
              previewLine3D.computeLineDistances();
              requestRender();
            }
          } else if (
            active3DSubTool === "autoRect3D" ||
            active3DSubTool === "arrow90"
          ) {
            const snapHit = findNearbyScalpSnap();
            if (snapHit) {
              nodeHighlightRing.position.copy(snapHit.point);
              nodeHighlightRing.lookAt(camera.position);
              if (!nodeHighlightRing.visible) {
                nodeHighlightRing.visible = true;
                requestRender();
              }
            } else if (nodeHighlightRing.visible) {
              nodeHighlightRing.visible = false;
              requestRender();
            }

            // Preview đường nối mảng hộp 90°
            const anchorPoint =
              autoRectStep === 1 && autoRectHitA
                ? autoRectHitA.point
                : null;

            if (anchorPoint) {
              const previewTarget = snapHit?.point || getScalpSurfaceHit(e)?.point;
              if (previewTarget) {
                const geo = new THREE.BufferGeometry().setFromPoints([
                  anchorPoint,
                  previewTarget,
                ]);
                if (!previewLine3D) {
                  previewLine3D = new THREE.Line(
                    geo,
                    new THREE.LineDashedMaterial({
                      color: 0xf59e0b,
                      dashSize: 0.04,
                      gapSize: 0.02,
                    }),
                  );
                  scene.add(previewLine3D);
                } else {
                  previewLine3D.geometry.dispose();
                  previewLine3D.geometry = geo;
                }
                previewLine3D.computeLineDistances();
                requestRender();
              }
            }
          } else if (active3DSubTool === "connectTips") {
            const nearTip = findNearbyConnectableTip(35);
            if (nearTip?.id !== hoveredConnectTip?.id) {
              hoveredConnectTip = nearTip;
              updateConnectTipsSnapMarkers();
              requestRender();
            }

            if (hoveredConnectTip) {
              nodeHighlightRing.position.copy(hoveredConnectTip.topPos);
              nodeHighlightRing.lookAt(camera.position);
              if (!nodeHighlightRing.visible) {
                nodeHighlightRing.visible = true;
                requestRender();
              }
            } else if (nodeHighlightRing.visible) {
              nodeHighlightRing.visible = false;
              requestRender();
            }

            if (connectTipStart) {
              const targetPos =
                hoveredConnectTip && hoveredConnectTip.id !== connectTipStart.id
                  ? hoveredConnectTip.topPos
                  : (get3DPointAnywhere(e) || null);

              if (targetPos) {
                const geo = new THREE.BufferGeometry().setFromPoints([
                  connectTipStart.topPos,
                  targetPos,
                ]);
                if (!previewConnectLine) {
                  previewConnectLine = new THREE.Line(
                    geo,
                    new THREE.LineDashedMaterial({
                      color: 0x00f2fe,
                      dashSize: 0.03,
                      gapSize: 0.015,
                    }),
                  );
                  scene.add(previewConnectLine);
                } else {
                  previewConnectLine.geometry.dispose();
                  previewConnectLine.geometry = geo;
                  previewConnectLine.visible = true;
                }
                previewConnectLine.computeLineDistances();

                if (hoveredConnectTip && hoveredConnectTip.id !== connectTipStart.id) {
                  const quadPts = [
                    connectTipStart.scalpPos,
                    hoveredConnectTip.scalpPos,
                    hoveredConnectTip.topPos,
                    connectTipStart.topPos,
                    connectTipStart.scalpPos,
                  ];
                  const quadGeo = new THREE.BufferGeometry().setFromPoints(quadPts);
                  if (!previewConnectQuadGroup) {
                    previewConnectQuadGroup = new THREE.Group();
                    const quadLine = new THREE.Line(
                      quadGeo,
                      new THREE.LineDashedMaterial({
                        color: 0xfbbf24,
                        dashSize: 0.04,
                        gapSize: 0.02,
                      }),
                    );
                    quadLine.computeLineDistances();
                    previewConnectQuadGroup.add(quadLine);
                    scene.add(previewConnectQuadGroup);
                  } else {
                    const l = previewConnectQuadGroup.children[0] as THREE.Line;
                    if (l) {
                      l.geometry.dispose();
                      l.geometry = quadGeo;
                      l.computeLineDistances();
                    }
                    previewConnectQuadGroup.visible = true;
                  }
                } else if (previewConnectQuadGroup) {
                  previewConnectQuadGroup.visible = false;
                }
                requestRender();
              }
            } else {
              if (previewConnectLine) previewConnectLine.visible = false;
              if (previewConnectQuadGroup) previewConnectQuadGroup.visible = false;
            }
          }
        } else if (mode === "perm") {
          if (isEditingPerm || permStep === 1) triggerPermPreviewUpdate();
        }
      },
      { signal: eventController.signal },
    );

    window.addEventListener(
      "pointerup",
      () => {
        if (mode === "draw" && isPenDrawing) {
          isPenDrawing = false;
          if (penPoints.length > 1) {
            pushHistory({
              kind: "texture",
              action: {
                type: current2DTool,
                points: [...penPoints],
                color: colorPicker.value,
                width: parseInt(widthPicker.value, 10),
                eraseColor: current2DTool === "eraser" ? "#c5c5c5" : null,
              },
            });
          }
          penPoints = [];
          redrawTexture();
        }
      },
      { signal: eventController.signal },
    );

    // --- 11. PHÍM TẮT VÀ NÚT ĐIỀU KHIỂN ---
    document.getElementById("breakChainBtn")!.addEventListener(
      "click",
      () => {
        resetChainState();
        modeHint.textContent =
          "✂️ Đã ngắt chuỗi! Bấm Chuột Trái chọn điểm mới...";
      },
      { signal: eventController.signal },
    );

    window.addEventListener(
      "keydown",
      (e) => {
        const focusedTag = document.activeElement?.tagName || "";
        if (["TEXTAREA", "INPUT", "SELECT"].includes(focusedTag)) return;
        const k = e.key.toLowerCase();
        if (k === "b" || e.key === "Escape") resetChainState();
        if ((e.ctrlKey || e.metaKey) && k === "s") {
          e.preventDefault();
          if (!activeProjectRef.current) {
            setIsSaveNewProjectModalOpen(true);
          } else {
            void saveActiveProject().catch(() => undefined);
          }
          return;
        }
        if ((e.ctrlKey || e.metaKey) && k === "z" && !e.shiftKey) {
          e.preventDefault();
          undoHistory();
          return;
        }
        if (
          (e.ctrlKey || e.metaKey) &&
          (k === "y" || (k === "z" && e.shiftKey))
        ) {
          e.preventDefault();
          redoHistory();
          return;
        }
        if (k === "w") {
          camera.position.set(0, 0.5, 4.3);
          controls.target.set(0, 0.3, 0);
          controls.update();
          requestRender();
        }
        if (k === "a") {
          camera.position.set(4.3, 0.5, 0);
          controls.target.set(0, 0.3, 0);
          controls.update();
          requestRender();
        }
        if (k === "s") {
          camera.position.set(0, 0.5, -4.3);
          controls.target.set(0, 0.3, 0);
          controls.update();
          requestRender();
        }
        if (k === "d") {
          camera.position.set(-4.3, 0.5, 0);
          controls.target.set(0, 0.3, 0);
          controls.update();
          requestRender();
        }
        if (k === "t") {
          camera.position.set(0, 4.3, 0.3);
          controls.target.set(0, 0.3, 0);
          controls.update();
          requestRender();
        }
      },
      { signal: eventController.signal },
    );

    // Chuyển Mode làm việc
    document.getElementById("modeDraw")!.addEventListener(
      "click",
      () => {
        mode = "draw";
        resetChainState();
        setModeUI("modeDraw", "groupTools2D");
        modeHint.textContent =
          "✏️ Chế độ 2D Da Đầu: Chuột Trái chấm điểm nối A ➔ B ➔ C | Chuột Phải xoay 3D";
      },
      { signal: eventController.signal },
    );

    document.getElementById("modeSpace")!.addEventListener(
      "click",
      () => {
        mode = "space";
        resetChainState();
        setModeUI("modeSpace", "groupTools3D");
        updateNodeTool();
      },
      { signal: eventController.signal },
    );

    document.getElementById("modePerm")!.addEventListener(
      "click",
      () => {
        mode = "perm";
        resetChainState();
        setModeUI("modePerm", "groupToolsPerm");
        document.getElementById("groupRodSettings")!.style.display = "";
        modeHint.textContent =
          "🌀 Chế độ Uốn 3D: Cắm chân tóc để uốn mới OR Click tép uốn cũ để sửa!";
      },
      { signal: eventController.signal },
    );

    function setModeUI(activeModeBtnId: string, activeGroupToolsId: string) {
      document
        .querySelectorAll(".mode")
        .forEach((b) => b.classList.remove("active"));
      document.getElementById(activeModeBtnId)!.classList.add("active");
      document.getElementById("groupTools2D")!.style.display = "none";
      document.getElementById("groupTools3D")!.style.display = "none";
      document.getElementById("groupToolsPerm")!.style.display = "none";
      document.getElementById("groupRodSettings")!.style.display = "none";
      document.getElementById(activeGroupToolsId)!.style.display = "";
      updateNodeTool();
    }

    document.querySelectorAll("#tab3d .tool").forEach((btn) => {
      btn.addEventListener(
        "click",
        () => {
          document
            .querySelectorAll("#tab3d .tool")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          resetChainState();
          current2DTool = (btn as HTMLElement).dataset.tool!;
        },
        { signal: eventController.signal },
      );
    });

    document.querySelectorAll(".spacetool").forEach((btn) => {
      btn.addEventListener(
        "click",
        () => {
          document
            .querySelectorAll(".spacetool")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          resetChainState();
          active3DSubTool = btn.id.replace("tool", "").toLowerCase();
          if (btn.id === "toolNode3D") active3DSubTool = "node3d";
          else if (btn.id === "toolAutoRect3D") active3DSubTool = "autoRect3D";
          else if (btn.id === "toolArrow90") active3DSubTool = "arrow90";
          else if (btn.id === "toolConnectTips")
            active3DSubTool = "connectTips";
          updateNodeTool();
        },
        { signal: eventController.signal },
      );
    });

    document.querySelectorAll(".permtool").forEach((btn) => {
      btn.addEventListener(
        "click",
        () => {
          document
            .querySelectorAll(".permtool")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          resetChainState();
          if (btn.id === "toolPermRod") activePermSubTool = "permRod";
          else if (btn.id === "toolCurlC") activePermSubTool = "curlC";
          else if (btn.id === "toolCurlCHook") activePermSubTool = "curlCHook";
          else if (btn.id === "toolCurlS") activePermSubTool = "curlS";
          else if (btn.id === "toolCurlJ") activePermSubTool = "curlJ";
          else if (btn.id === "toolCurlSpiral")
            activePermSubTool = "curlSpiral";
          else if (btn.id === "toolCurlHippie")
            activePermSubTool = "curlHippie";
          else if (btn.id === "toolCurlZigzag")
            activePermSubTool = "curlZigzag";
          else activePermSubTool = "curlC";
        },
        { signal: eventController.signal },
      );
    });

    const snapToggleBtn = document.getElementById("snapToggleBtn")!;
    snapToggleBtn.addEventListener(
      "click",
      () => {
        is2DSnapEnabled = !is2DSnapEnabled;
        snapToggleBtn.textContent = `🧲 Snap: ${is2DSnapEnabled ? "BẬT" : "TẮT"}`;
        snapToggleBtn.classList.toggle("toggle-on", is2DSnapEnabled);
      },
      { signal: eventController.signal },
    );

    document
      .getElementById("finishChain2DBtn")!
      .addEventListener("click", () => resetChainState(), {
        signal: eventController.signal,
      });

    const pathModeCurvedBtn = document.getElementById("pathModeCurved");
    const pathModeStraightBtn = document.getElementById("pathModeStraight");
    const sectionLineModeSelect = document.getElementById("sectionLineMode") as HTMLSelectElement | null;

    function set2DPathMode(newMode: "curved" | "straight") {
      draw2DPathMode = newMode;
      pathModeCurvedBtn?.classList.toggle("active", newMode === "curved");
      pathModeStraightBtn?.classList.toggle("active", newMode === "straight");
      if (sectionLineModeSelect) {
        if (newMode === "curved") sectionLineModeSelect.value = "texture-curved";
        else sectionLineModeSelect.value = "texture-straight";
      }
      modeHint.textContent =
        newMode === "straight"
          ? "📏 Chế độ vẽ 2D: Thẳng đỉnh đầu (Nét thẳng tắp qua đỉnh sọ / Chia ngôi chuẩn)!"
          : "〰️ Chế độ vẽ 2D: Cong ôm sọ (Nét uốn lượn ôm sát theo khuôn đầu)!";
    }

    pathModeCurvedBtn?.addEventListener(
      "click",
      () => set2DPathMode("curved"),
      { signal: eventController.signal },
    );
    pathModeStraightBtn?.addEventListener(
      "click",
      () => {
        set2DPathMode("straight");
        if (current2DTool === "curve" || current2DTool === "dashedCurve") {
          current2DTool = "line";
          document.querySelectorAll(".tool").forEach((b) => {
            b.classList.toggle("active", (b as HTMLElement).dataset.tool === "line");
          });
        }
      },
      { signal: eventController.signal },
    );

    if (sectionLineModeSelect) {
      sectionLineModeSelect.addEventListener(
        "change",
        () => {
          if (sectionLineModeSelect.value === "texture-curved") {
            set2DPathMode("curved");
            document.getElementById("modeDraw")?.click();
          } else if (sectionLineModeSelect.value === "texture-straight") {
            set2DPathMode("straight");
            document.getElementById("modeDraw")?.click();
          }
        },
        { signal: eventController.signal },
      );
    }

    clearBtn.addEventListener(
      "click",
      () => {
        if (
          confirm(
            "Xoá toàn bộ nét 2D, điểm/nét 3D và sơ đồ uốn? Bạn có thể bấm Hoàn tác để khôi phục.",
          )
        ) {
          resetChainState();
          pushHistory({ kind: "clear_all" });
          renderTimelineAt(timelineIndex);
          modeHint.textContent =
            "Đã xoá toàn bộ bản vẽ. Bấm Hoàn tác (Ctrl+Z) để khôi phục.";
        }
      },
      { signal: eventController.signal },
    );

    undoBtn.addEventListener("click", undoHistory, {
      signal: eventController.signal,
    });
    redoBtn.addEventListener("click", redoHistory, {
      signal: eventController.signal,
    });

    document.getElementById("pngBtn")!.addEventListener(
      "click",
      () => {
        renderer.render(scene, camera);
        const link = document.createElement("a");
        link.download = "hairtech-3d.png";
        link.href = glcanvas.toDataURL("image/png");
        link.click();
      },
      { signal: eventController.signal },
    );

    document.getElementById("pdfBtn")!.addEventListener(
      "click",
      async () => {
        const { jsPDF } = await import("jspdf");
        renderer.render(scene, camera);
        const pdf = new jsPDF({
          orientation: "portrait",
          unit: "pt",
          format: "a4",
        });
        pdf.setFontSize(16);
        pdf.text("HAIRTECH 3D — SO DO KY THUAT 3D", 30, 36);
        pdf.addImage(glcanvas.toDataURL("image/png"), "PNG", 30, 50, 535, 360);
        // Thêm bản trải phẳng 2D (Flat Texture) vào PDF
        const flatImg = document.getElementById("flatPreview") as HTMLImageElement | null;
        if (flatImg && flatImg.src && flatImg.naturalWidth > 0) {
          pdf.setFontSize(12);
          pdf.text("BAN TRAI PHANG 2D (TEXTURE DA DAU)", 30, 430);
          pdf.addImage(flatImg.src, "PNG", 30, 440, 260, 260);
        }
        // Thêm ghi chú kỹ thuật nếu có
        const notes = notesArea.value.trim();
        if (notes) {
          const notesY = flatImg && flatImg.src && flatImg.naturalWidth > 0 ? 720 : 430;
          pdf.setFontSize(10);
          pdf.text("GHI CHU KY THUAT:", 30, notesY);
          const lines = pdf.splitTextToSize(notes, 535);
          pdf.text(lines, 30, notesY + 14);
        }
        pdf.save("hairtech-so-do-3d.pdf");
      },
      { signal: eventController.signal },
    );

    const viewPresets: Record<string, [number, number, number]> = {
      front: [0, 0.5, 4.3],
      left: [4.3, 0.5, 0],
      right: [-4.3, 0.5, 0],
      back: [0, 0.5, -4.3],
      top: [0, 4.3, 0.3],
    };
    document.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener(
        "click",
        () => {
          const view = (btn as HTMLElement).dataset.view!;
          const [x, y, z] = viewPresets[view];
          camera.position.set(x, y, z);
          controls.target.set(0, 0.3, 0);
          controls.update();
          requestRender();
        },
        { signal: eventController.signal },
      );
    });

    // --- 12. SERIALIZE / RESTORE PROJECT V1 ---
    function vectorFrom(value: unknown, label: string) {
      if (
        !Array.isArray(value) ||
        value.length !== 3 ||
        !value.every(
          (part) => typeof part === "number" && Number.isFinite(part),
        )
      ) {
        throw new Error(`${label} không hợp lệ.`);
      }
      return new THREE.Vector3(value[0], value[1], value[2]);
    }

    function hitFrom(value: unknown, label: string) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label} không hợp lệ.`);
      }
      const hit = value as Record<string, unknown>;
      return {
        point: vectorFrom(hit.point, `${label} point`),
        normal: vectorFrom(hit.normal, `${label} normal`).normalize(),
      };
    }

    function serializeHit(hit: any) {
      return { point: hit.point.toArray(), normal: hit.normal.toArray() };
    }

    function jsonCopy<T>(value: T): T {
      return JSON.parse(JSON.stringify(value)) as T;
    }

    function serializeHistoryEntry(item: any): JsonObject {
      switch (item.kind) {
        case "texture":
          return {
            kind: "texture",
            action: jsonCopy(item.action),
          } as JsonObject;
        case "guided_nodes":
          return {
            kind: "guided_nodes",
            operation: jsonCopy(item.operation),
          } as JsonObject;
        case "spacepoint":
          return {
            kind: "spacepoint",
            nodeId: item.nodeId,
            previousNodeId: item.previousNodeId ?? null,
            pos: jsonCopy(item.pos),
            angleDeg: item.angleDeg ?? null,
            colorHex: item.colorHex,
          } as JsonObject;
        case "space_closed_section":
          return {
            kind: "space_closed_section",
            points: jsonCopy(
              item.points ??
                item.pointsList?.map((point: THREE.Vector3) => point.toArray()),
            ),
            colorHex: item.colorHex,
          } as JsonObject;
        case "autoRectSection":
          return {
            kind: "autoRectSection",
            hitA: jsonCopy(item.hitA),
            hitB: jsonCopy(item.hitB),
            arrowIds: jsonCopy(item.arrowIds),
            length: item.length,
            colorHex: item.colorHex,
          } as JsonObject;
        case "arrow90":
          return {
            kind: "arrow90",
            arrowId: item.arrowId ?? item.arrowData?.id,
            hit: jsonCopy(item.hit),
            length: item.length,
            angleDeg: item.angleDeg ?? 90,
            dirDeg: item.dirDeg ?? 0,
            colorHex: item.colorHex,
          } as JsonObject;
        case "directSectionLine":
          return {
            kind: "directSectionLine",
            hitA: jsonCopy(item.hitA),
            hitB: jsonCopy(item.hitB),
            style: item.style || "solid",
            colorHex: item.colorHex,
          } as JsonObject;
        case "boxQuad":
          return {
            kind: "boxQuad",
            arrowAId: item.arrowAId ?? item.arrowA?.id,
            arrowBId: item.arrowBId ?? item.arrowB?.id,
            posA_scalp: item.arrowA?.scalpPos?.toArray ? item.arrowA.scalpPos.toArray() : (item.posA_scalp || null),
            posA_top: item.arrowA?.topPos?.toArray ? item.arrowA.topPos.toArray() : (item.posA_top || null),
            posB_scalp: item.arrowB?.scalpPos?.toArray ? item.arrowB.scalpPos.toArray() : (item.posB_scalp || null),
            posB_top: item.arrowB?.topPos?.toArray ? item.arrowB.topPos.toArray() : (item.posB_top || null),
            colorHex: item.colorHex,
          } as JsonObject;
        case "permRod":
          return {
            kind: "permRod",
            hit: jsonCopy(item.hit),
            sizeMM: item.sizeMM,
            angleDeg: item.angleDeg,
          } as JsonObject;
        case "straightPermWave": {
          let target: number[];
          if (item.targetPos?.toArray) {
            target = item.targetPos.toArray();
          } else if (Array.isArray(item.targetPos) && item.targetPos.length === 3) {
            target = item.targetPos;
          } else {
            const hp = item.scalpHit?.point;
            const hn = item.scalpHit?.normal;
            if (hp?.clone && hn) {
              target = hp.clone().addScaledVector(hn, item.length ?? 0.45).toArray();
            } else {
              target = jsonCopy(item.targetPos ?? [0, 0, 0]);
            }
          }
          return {
            kind: "straightPermWave",
            hit: serializeHit(item.scalpHit),
            waveType: item.waveType,
            length: item.length,
            amp: item.amp,
            targetPos: target,
            rollDeg: item.rollDeg,
            colorHex: item.colorHex,
          } as JsonObject;
        }
        case "clear_all":
          return { kind: "clear_all" };
        default:
          throw new Error(
            `Project chứa thao tác không hỗ trợ: ${String(item.kind)}`,
          );
      }
    }

    function disposeHistoryItem(item: any) {
      if (item.marker) disposeObjectRecursively(item.marker);
      if (item.line) disposeObjectRecursively(item.line);
      if (item.sprite) disposeObjectRecursively(item.sprite);
      if (item.mesh) disposeObjectRecursively(item.mesh);
      if (item.arrowData) disposeObjectRecursively(item.arrowData.group);
      if (item.boxGroup) disposeObjectRecursively(item.boxGroup);
      if (item.group) disposeObjectRecursively(item.group);
    }

    function clearRuntimeHistory() {
      stopPlayback();
      historyStack.forEach(disposeHistoryItem);
      historyStack.length = 0;
      timelineIndex = 0;
      allNodes3D.length = 0;
      createdArrowObjects.length = 0;
      resetChainState();
      updateTimelineUI();
    }

    function restoreHistoryEntry(
      entry: JsonObject,
      nodeMap: Map<string, any>,
      arrowMap: Map<string, any>,
    ) {
      const kind = entry.kind;
      if (
        kind === "texture" ||
        kind === "guided_nodes" ||
        kind === "clear_all"
      ) {
        return jsonCopy(entry);
      }
      if (kind === "spacepoint") {
        const nodeId =
          typeof entry.nodeId === "string" ? entry.nodeId : crypto.randomUUID();
        const position = vectorFrom(entry.pos, "Vị trí điểm 3D");
        const colorHex =
          typeof entry.colorHex === "string" ? entry.colorHex : "#2563eb";
        let node = nodeMap.get(nodeId);
        if (!node) {
          node = {
            id: nodeId,
            pos: position,
            marker: createNodeMarker(position, colorHex),
          };
          nodeMap.set(nodeId, node);
          allNodes3D.push(node);
        }
        const previousNode =
          typeof entry.previousNodeId === "string"
            ? nodeMap.get(entry.previousNodeId)
            : null;
        const line = previousNode
          ? create3DLineSegment(previousNode.pos, node.pos, colorHex)
          : null;
        let sprite: THREE.Sprite | null = null;
        if (previousNode && typeof entry.angleDeg === "number") {
          sprite = createAngleSprite(`${entry.angleDeg}°`);
          sprite.position.copy(previousNode.pos);
          scene.add(sprite);
        }
        return { ...jsonCopy(entry), marker: node.marker, line, sprite };
      }
      if (kind === "space_closed_section") {
        if (!Array.isArray(entry.points) || entry.points.length < 3)
          throw new Error("Mảng 3D bị thiếu điểm.");
        const points = entry.points.map((point, index) =>
          vectorFrom(point, `Điểm mảng 3D ${index + 1}`),
        );
        const colorHex =
          typeof entry.colorHex === "string" ? entry.colorHex : "#2563eb";
        const line = create3DLineSegment(
          points[points.length - 1],
          points[0],
          colorHex,
        );
        const mesh = create3DFilledMesh(points, colorHex);
        const angle = calculateAngleBetween2Lines(
          points[points.length - 2],
          points[points.length - 1],
          points[0],
        );
        const sprite = createAngleSprite(`${angle}°`);
        sprite.position.copy(points[points.length - 1]);
        scene.add(sprite);
        return { ...jsonCopy(entry), line, mesh, sprite, pointsList: points };
      }
      if (kind === "autoRectSection") {
        const hitA = hitFrom(entry.hitA, "Điểm A của mảng hộp");
        const hitB = hitFrom(entry.hitB, "Điểm B của mảng hộp");
        const ids =
          Array.isArray(entry.arrowIds) &&
          entry.arrowIds.length === 2 &&
          entry.arrowIds.every((id) => typeof id === "string")
            ? (entry.arrowIds as [string, string])
            : ([crypto.randomUUID(), crypto.randomUUID()] as [string, string]);
        const restored = createAutoRectSection3D(
          hitA,
          hitB,
          typeof entry.length === "number" ? entry.length : 0.45,
          typeof entry.colorHex === "string" ? entry.colorHex : "#2563eb",
          ids,
        );
        arrowMap.set(ids[0], restored.tipA);
        arrowMap.set(ids[1], restored.tipB);
        return {
          ...jsonCopy(entry),
          group: restored.group,
          tipA: restored.tipA,
          tipB: restored.tipB,
        };
      }
      if (kind === "arrow90") {
        const id =
          typeof entry.arrowId === "string"
            ? entry.arrowId
            : crypto.randomUUID();
        const angleDeg = typeof entry.angleDeg === "number" ? entry.angleDeg : 90;
        const dirDeg = typeof entry.dirDeg === "number" ? entry.dirDeg : 0;
        const restored = createElevationArrow3DHelper(
          hitFrom(entry.hit, "Điểm mũi tên"),
          typeof entry.length === "number" ? entry.length : 0.45,
          angleDeg,
          dirDeg,
          typeof entry.colorHex === "string" ? entry.colorHex : "#2563eb",
          id,
          scene,
        );
        createdArrowObjects.push(restored);
        arrowMap.set(id, restored);
        return { ...jsonCopy(entry), arrowData: restored };
      }
      if (kind === "directSectionLine") {
        return jsonCopy(entry);
      }
      if (kind === "boxQuad") {
        let arrowA =
          typeof entry.arrowAId === "string"
            ? arrowMap.get(entry.arrowAId)
            : null;
        let arrowB =
          typeof entry.arrowBId === "string"
            ? arrowMap.get(entry.arrowBId)
            : null;
        if (!arrowA && Array.isArray(entry.posA_scalp) && Array.isArray(entry.posA_top)) {
          const s = entry.posA_scalp as number[];
          const t = entry.posA_top as number[];
          arrowA = {
            id: (typeof entry.arrowAId === "string" ? entry.arrowAId : null) || crypto.randomUUID(),
            scalpPos: new THREE.Vector3(s[0] ?? 0, s[1] ?? 0, s[2] ?? 0),
            topPos: new THREE.Vector3(t[0] ?? 0, t[1] ?? 0, t[2] ?? 0),
            normal: new THREE.Vector3(0, 1, 0),
            color: typeof entry.colorHex === "string" ? entry.colorHex : "#2563eb",
            group: null,
          };
        }
        if (!arrowB && Array.isArray(entry.posB_scalp) && Array.isArray(entry.posB_top)) {
          const s = entry.posB_scalp as number[];
          const t = entry.posB_top as number[];
          arrowB = {
            id: (typeof entry.arrowBId === "string" ? entry.arrowBId : null) || crypto.randomUUID(),
            scalpPos: new THREE.Vector3(s[0] ?? 0, s[1] ?? 0, s[2] ?? 0),
            topPos: new THREE.Vector3(t[0] ?? 0, t[1] ?? 0, t[2] ?? 0),
            normal: new THREE.Vector3(0, 1, 0),
            color: typeof entry.colorHex === "string" ? entry.colorHex : "#2563eb",
            group: null,
          };
        }
        if (!arrowA || !arrowB) {
          console.warn("Mảng nối 3D tham chiếu điểm không tồn tại, bỏ qua.");
          return jsonCopy(entry);
        }
        const boxGroup = create3DBoxQuad(
          arrowA,
          arrowB,
          typeof entry.colorHex === "string" ? entry.colorHex : "#2563eb",
        );
        return { ...jsonCopy(entry), boxGroup, arrowA, arrowB };
      }
      if (kind === "permRod") {
        const hit = hitFrom(entry.hit, "Vị trí trục uốn");
        const group = createPermRod3D(
          hit,
          typeof entry.sizeMM === "string" ? entry.sizeMM : "19",
          typeof entry.angleDeg === "number" ? entry.angleDeg : 90,
        );
        return { ...jsonCopy(entry), group, hit };
      }
      if (kind === "straightPermWave") {
        const hit = hitFrom(entry.hit, "Chân tép uốn");
        const targetPos = vectorFrom(entry.targetPos, "Đỉnh tép uốn");
        const group = createStraightAxisPermWave3D(
          hit,
          typeof entry.waveType === "string" ? entry.waveType : "curlC",
          typeof entry.length === "number" ? entry.length : 0.45,
          typeof entry.amp === "number" ? entry.amp : 0.1,
          typeof entry.colorHex === "string" ? entry.colorHex : "#2563eb",
          targetPos,
          typeof entry.rollDeg === "number" ? entry.rollDeg : 90,
        );
        return { ...jsonCopy(entry), group, scalpHit: hit, targetPos };
      }
      throw new Error(`Project chứa thao tác không hỗ trợ: ${String(kind)}`);
    }

    function serializeProject(): ProjectDataV1 {
      const entries = historyStack.map(serializeHistoryEntry);
      return {
        version: 1,
        drawing_2d: entries.filter((entry) => entry.kind === "texture"),
        nodes_3d: entries.filter(
          (entry) =>
            entry.kind === "guided_nodes" || entry.kind === "spacepoint",
        ),
        sections: entries.filter((entry) =>
          [
            "space_closed_section",
            "autoRectSection",
            "arrow90",
            "boxQuad",
            "directSectionLine",
          ].includes(String(entry.kind)),
        ),
        perm_rods: entries.filter((entry) => entry.kind === "permRod"),
        waves: entries.filter((entry) => entry.kind === "straightPermWave"),
        timeline: { entries, cursor: timelineIndex },
        camera: {
          position: camera.position.toArray() as [number, number, number],
          target: controls.target.toArray() as [number, number, number],
          zoom: camera.zoom,
        },
        settings: {
          mode,
          current_2d_tool: current2DTool,
          draw_path_mode: draw2DPathMode,
          active_3d_tool: active3DSubTool,
          active_perm_tool: activePermSubTool,
          color: colorPicker.value,
          width: Number(widthPicker.value),
          extrude_length: Number(extrudeLenPicker.value),
          rod_size: rodSizeSelect.value,
          rod_angle: Number(rodAngleSelect.value),
          wave_amplitude: Number(waveAmpPicker.value),
          wave_roll: Number(waveRollPicker.value),
          node_placement: nodePlacementMode.value,
          snap_enabled: is2DSnapEnabled,
          background: bg3dSelect.value,
          theme: themeSelector?.value || "luxury",
          mesh_fill_visible: runtimeMeshFillVisible,
          cage_visible: cageGridGroup.visible,
          technical_notes: notesArea.value,
        },
      };
    }

    function applyProjectSettings(settings: JsonObject) {
      const textSetting = (key: string, fallback: string) =>
        typeof settings[key] === "string"
          ? (settings[key] as string)
          : fallback;
      const numberSetting = (key: string, fallback: number) =>
        typeof settings[key] === "number"
          ? (settings[key] as number)
          : fallback;
      colorPicker.value = textSetting("color", "#2563eb");
      widthPicker.value = String(numberSetting("width", 4));
      extrudeLenPicker.value = String(numberSetting("extrude_length", 0.45));
      extrudeLenVal.textContent = `${Number(extrudeLenPicker.value).toFixed(2)}m`;
      rodSizeSelect.value = textSetting("rod_size", "19");
      rodAngleSelect.value = String(numberSetting("rod_angle", 90));
      waveAmpPicker.value = String(numberSetting("wave_amplitude", 0.1));
      waveRollPicker.value = String(numberSetting("wave_roll", 90));
      nodePlacementMode.value = textSetting("node_placement", "guided");
      is2DSnapEnabled = settings.snap_enabled !== false;
      const snapToggleButton = document.getElementById("snapToggleBtn")!;
      snapToggleButton.textContent = `🧲 Snap: ${is2DSnapEnabled ? "BẬT" : "TẮT"}`;
      snapToggleButton.classList.toggle("toggle-on", is2DSnapEnabled);
      set2DPathMode((textSetting("draw_path_mode", "curved") as "curved" | "straight") || "curved");
      notesArea.value = textSetting("technical_notes", "");
      if (themeSelector) {
        themeSelector.value = textSetting("theme", "luxury");
        themeSelector.dispatchEvent(new Event("change"));
      }
      bg3dSelect.value = textSetting("background", "0xffffff");
      bg3dSelect.dispatchEvent(new Event("change"));
      runtimeMeshFillVisible = settings.mesh_fill_visible !== false;
      guidedNodes?.setFillVisible(runtimeMeshFillVisible);
      cageGridGroup.visible = settings.cage_visible !== false;
      current2DTool = textSetting("current_2d_tool", "line");
      active3DSubTool = textSetting("active_3d_tool", "node3d");
      activePermSubTool = textSetting("active_perm_tool", "permRod");
      mode = ["draw", "space", "perm"].includes(textSetting("mode", "draw"))
        ? textSetting("mode", "draw")
        : "draw";
      setModeUI(
        mode === "space"
          ? "modeSpace"
          : mode === "perm"
            ? "modePerm"
            : "modeDraw",
        mode === "space"
          ? "groupTools3D"
          : mode === "perm"
            ? "groupToolsPerm"
            : "groupTools2D",
      );
      if (mode === "perm")
        document.getElementById("groupRodSettings")!.style.display = "";
      document
        .querySelectorAll("[data-tool]")
        .forEach((button) =>
          button.classList.toggle(
            "active",
            (button as HTMLElement).dataset.tool === current2DTool,
          ),
        );
      document
        .querySelectorAll(".spacetool")
        .forEach((button) =>
          button.classList.toggle(
            "active",
            button.id ===
              (
                {
                  node3d: "toolNode3D",
                  autoRect3D: "toolAutoRect3D",
                  arrow90: "toolArrow90",
                  connectTips: "toolConnectTips",
                } as Record<string, string>
              )[active3DSubTool],
          ),
        );
      document
        .querySelectorAll(".permtool")
        .forEach((button) =>
          button.classList.toggle(
            "active",
            button.id ===
              `tool${activePermSubTool[0]?.toUpperCase()}${activePermSubTool.slice(1)}`,
          ),
        );
    }

    function loadProject(project: ProjectDataV1) {
      if (!isProjectDataV1(project))
        throw new Error("Project không đúng định dạng phiên bản 1.");
      clearRuntimeHistory();
      const nodeMap = new Map<string, any>();
      const arrowMap = new Map<string, any>();
      try {
        for (const entry of project.timeline.entries) {
          historyStack.push(restoreHistoryEntry(entry, nodeMap, arrowMap));
        }
      } catch (error) {
        clearRuntimeHistory();
        throw error;
      }
      camera.position.copy(vectorFrom(project.camera.position, "Camera"));
      controls.target.copy(vectorFrom(project.camera.target, "Tâm camera"));
      camera.zoom = project.camera.zoom;
      camera.updateProjectionMatrix();
      applyProjectSettings(project.settings);
      renderTimelineAt(project.timeline.cursor, false);
      controls.update();
      requestRender();
    }

    function resetProject() {
      loadProject(createEmptyProjectData());
    }

    runtimeRef.current = {
      serialize: serializeProject,
      load: loadProject,
      reset: resetProject,
    };

    const handleCameraEnd = () => markDirtyRef.current();
    controls.addEventListener("end", handleCameraEnd);
    [
      themeSelector,
      bg3dSelect,
      colorPicker,
      widthPicker,
      extrudeLenPicker,
      rodSizeSelect,
      rodAngleSelect,
      waveAmpPicker,
      waveRollPicker,
      nodePlacementMode,
      notesArea,
    ]
      .filter(Boolean)
      .forEach((element) =>
        element!.addEventListener(
          element === notesArea ? "input" : "change",
          markDirtyRef.current,
          { signal: eventController.signal },
        ),
      );
    document
      .querySelectorAll(
        ".mode, .tool, .spacetool, .permtool, [data-view], #snapToggleBtn, #toggleMeshFillBtn, #cageToggleBtn",
      )
      .forEach((element) => {
        element.addEventListener("click", markDirtyRef.current, {
          signal: eventController.signal,
        });
      });

    // --- 13. TAB NAVIGATION & XUẤT NHẬP DỰ ÁN ---
    function showWorkTab(which: string) {
      document.getElementById("tab3d")!.style.display =
        which === "3d" ? "flex" : "none";
      document.getElementById("tabPhoto")!.style.display =
        which === "photo" ? "flex" : "none";
      document.getElementById("tabClients")!.style.display =
        which === "clients" ? "flex" : "none";
      document
        .querySelectorAll(".worktab")
        .forEach((b) => b.classList.remove("active"));
      document
        .getElementById(
          which === "3d"
            ? "tabBtn3d"
            : which === "photo"
              ? "tabBtnPhoto"
              : "tabBtnClients",
        )!
        .classList.add("active");

      if (which === "3d") {
        setTimeout(() => {
          resizeRenderer();
          controls.target.set(0, 0.3, 0);
          controls.update();
          requestRender();
        }, 60);
      }
    }

    showWorkTabRef.current = showWorkTab;

    document
      .getElementById("tabBtn3d")!
      .addEventListener("click", () => showWorkTab("3d"), {
        signal: eventController.signal,
      });
    document
      .getElementById("tabBtnPhoto")!
      .addEventListener("click", () => showWorkTab("photo"), {
        signal: eventController.signal,
      });
    document
      .getElementById("tabBtnClients")!
      .addEventListener("click", () => showWorkTab("clients"), {
        signal: eventController.signal,
      });

    return () => {
      showWorkTabRef.current = null;
      controls.removeEventListener("end", handleCameraEnd);
      runtimeRef.current = null;
      eventController.abort();
      stopPlayback();
      controls.removeEventListener("change", requestRender);
      controls.removeEventListener("start", requestRender);
      guidedNodes?.dispose();
      controls.dispose();
      if (animId !== null) cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", resizeRenderer);
      disposeObjectRecursively(scene);
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={rootRef} className={`workspace-shell viewmode-${viewMode}`}>
      {/* HEADER BAR */}
      <WorkspaceHeader
        activeClient={activeClient}
        activeProject={activeProject}
        saveStatus={saveStatus}
        isAdmin={isAdmin}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onOpenAdmin={() => setIsAdminOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSave={() => {
          void handleHeaderSave().catch(() => undefined);
        }}
        onSaveCopy={() => {
          void saveAsCopy().catch(() => undefined);
        }}
      />

      {/* FLOATING PILL KHI Ở CHẾ ĐỘ ZEN TOÀN MÀN HÌNH */}
      {viewMode === "zen" && (
        <div className="zen-floating-pill">
          <span>⛶ Chế độ toàn màn hình (F11)</span>
          <button onClick={() => handleViewModeChange("standard")}>
            ✕ Thoát
          </button>
        </div>
      )}

      {/* ================= TAB 1: ĐẦU 3D ================= */}
      <div id="tab3d" className="app-container">
        {/* SIDEBAR TRÁI: CÔNG CỤ */}
        <WorkspaceSidebar />

        {/* KHUNG NHÌN VIEWPORT TRUNG TÂM */}
        <WorkspaceViewport />

        {/* SIDEBAR PHẢI: THIẾT LẬP THÔNG SỐ */}
        <WorkspaceInspector />
      </div>

      {/* ================= TAB 2: ẢNH KHÁCH HÀNG ================= */}
      <div id="tabPhoto" className="app-container" style={{ display: "none" }}>
        <PhotoPanel client={activeClient} />
      </div>

      {/* ================= TAB 3: QUẢN LÝ KHÁCH HÀNG ================= */}
      <div
        id="tabClients"
        className="app-container"
        style={{ display: "none", flexDirection: "column" }}
      >
        <ClientPanel
          activeClient={activeClient}
          activeProjectId={activeProject?.id ?? null}
          projectsRevision={projectsRevision}
          onSelectClient={selectClient}
          onCreateProject={createClientProject}
          onOpenProject={openClientProject}
          onDeleteProject={deleteClientProject}
          onViewPhotos={() => {
            if (showWorkTabRef.current) {
              showWorkTabRef.current("photo");
            } else {
              document.getElementById("tabBtnPhoto")?.click();
            }
          }}
        />
      </div>

      {/* ================= MODAL: QUẢN TRỊ SALON & BẢN QUYỀN ================= */}
      <AdminPanel
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
      />

      {/* ================= MODAL: CÀI ĐẶT BÁNH RĂNG (SETTINGS) ================= */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentTheme={currentTheme}
        onThemeChange={(theme) => {
          setCurrentTheme(theme);
          if (theme === "luxury") {
            document.documentElement.removeAttribute("data-theme");
          } else {
            document.documentElement.setAttribute("data-theme", theme);
          }
          const sel = document.getElementById("themeSelector") as HTMLSelectElement | null;
          if (sel) {
            sel.value = theme;
            sel.dispatchEvent(new Event("change"));
          }
        }}
        bg3dColor={bg3dColor}
        onBg3dColorChange={(color) => {
          setBg3dColor(color);
          const sel = document.getElementById("bg3dSelect") as HTMLSelectElement | null;
          if (sel) {
            sel.value = color;
            sel.dispatchEvent(new Event("change"));
          }
        }}
        isMeshFillVisible={isMeshFillVisible}
        onToggleMeshFill={() => {
          const btn = document.getElementById("toggleMeshFillBtn") as HTMLButtonElement | null;
          btn?.click();
          setIsMeshFillVisible((v) => !v);
        }}
        isCageVisible={isCageVisible}
        onToggleCage={() => {
          const btn = document.getElementById("cageToggleBtn") as HTMLButtonElement | null;
          btn?.click();
          setIsCageVisible((v) => !v);
        }}
        isSnapEnabled={isSnapEnabled}
        onToggleSnap={() => {
          const btn = document.getElementById("snapToggleBtn") as HTMLButtonElement | null;
          btn?.click();
          setIsSnapEnabled((v) => !v);
        }}
        isAdmin={isAdmin}
        onOpenAdmin={() => setIsAdminOpen(true)}
        onLogout={() => void logoutAfterSave()}
      />

      {/* ================= MODAL: LƯU BẢN THIẾT KẾ MỚI (KHI CHƯA CÓ PROJECT) ================= */}
      <SaveNewProjectModal
        isOpen={isSaveNewProjectModalOpen}
        onClose={() => setIsSaveNewProjectModalOpen(false)}
        activeClient={activeClient}
        defaultNotes={
          (document.getElementById("notesArea") as HTMLTextAreaElement | null)
            ?.value || ""
        }
        onSave={handleSaveNewProject}
      />
    </div>
  );
};
