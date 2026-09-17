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
import type { ClientRecord } from "../services/clients";
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

interface WorkspaceProps {
  onLogout: () => void;
}

type SaveStatus = "no-project" | "saved" | "unsaved" | "saving" | "error";

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
    const runtime = runtimeRef.current;
    if (!project || !runtime) return;
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

    if (bg3dSelect) {
      bg3dSelect.addEventListener(
        "change",
        (e: any) => {
          scene.background = new THREE.Color(parseInt(e.target.value, 16));
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
    let active3DSubTool = "node3d";
    let activePermSubTool = "permRod";
    let is2DSnapEnabled = true;

    const historyStack: any[] = [];
    let timelineIndex = 0;
    let isPlaying = false;
    let playTimer: any = null;

    function disposeObjectRecursively(obj: any) {
      if (!obj) return;
      obj.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m: any) => {
              if (m.map) m.map.dispose();
              m.dispose();
            });
          } else {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        }
      });
      if (obj.parent) obj.parent.remove(obj);
    }

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
        ctx.beginPath();
        ctx.moveTo(a.x1, a.y1);
        ctx.lineTo(a.x2, a.y2);
        ctx.stroke();
        if (a.type === "arrow")
          drawArrowHead(
            ctx,
            { x: a.x1, y: a.y1 },
            { x: a.x2, y: a.y2 },
            a.color,
            a.width,
          );
      } else if (
        a.type === "curve" ||
        a.type === "dashedCurve" ||
        a.type === "curvedArrow"
      ) {
        ctx.strokeStyle = a.color;
        ctx.lineWidth = a.width * 2.2;
        if (a.type === "dashedCurve")
          ctx.setLineDash([a.width * 3 + 6, a.width * 2 + 6]);
        if (a.points && a.points.length >= 2) {
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
          ctx.beginPath();
          ctx.moveTo(a.x1, a.y1);
          ctx.lineTo(a.x2, a.y2);
          ctx.stroke();
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
      flatPreview.src = texCanvas.toDataURL("image/png");
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
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    function resizeRenderer() {
      const rect = glcanvas.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height === 0) return;
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resizeRenderer, {
      signal: eventController.signal,
    });

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.3, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.5;
    controls.panSpeed = 0.5;
    controls.minDistance = 1.2;
    controls.maxDistance = 10.0;
    controls.mouseButtons = {
      LEFT: -1 as any,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };

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
      },
      { signal: eventController.signal },
    );

    let isMeshFillVisible = true;
    const toggleMeshFillBtn = document.getElementById("toggleMeshFillBtn")!;
    toggleMeshFillBtn.addEventListener(
      "click",
      () => {
        isMeshFillVisible = !isMeshFillVisible;
        guidedNodes?.setFillVisible(isMeshFillVisible);
        scene.traverse((obj: any) => {
          if (obj.isMesh && obj.userData && obj.userData.isFillMesh) {
            obj.visible = isMeshFillVisible;
          }
        });
        toggleMeshFillBtn.textContent = `🎨 Màu Mảng: ${isMeshFillVisible ? "BẬT" : "TẮT"}`;
        toggleMeshFillBtn.classList.toggle("toggle-on", isMeshFillVisible);
      },
      { signal: eventController.signal },
    );

    drawBaseGuides();
    const texture = new THREE.CanvasTexture(texCanvas);
    texture.wrapS = THREE.RepeatWrapping;

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
        }
      },
      undefined,
      () => {
        paintTarget = headMesh;
      },
    );

    let animId: number;
    function animate() {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();
    resizeRenderer();
    redrawTexture();

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
        const normal = hits[0].face.normal
          .clone()
          .applyMatrix3(normalMatrix)
          .normalize();
        const uv = hits[0].uv
          ? { x: hits[0].uv.x * TEX_SIZE, y: (1 - hits[0].uv.y) * TEX_SIZE }
          : null;
        return { point, normal, uv };
      }
      return null;
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

    function createAngleSprite(textStr: string) {
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      ctx.font = 'bold 34px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 6;
      ctx.strokeText(textStr, 80, 32);
      ctx.fillStyle = "#1e293b";
      ctx.fillText(textStr, 80, 32);

      const tex = new THREE.CanvasTexture(canvas);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          depthTest: false,
          transparent: true,
        }),
      );
      sprite.scale.set(0.2, 0.08, 1);
      sprite.renderOrder = 999;
      return sprite;
    }

    function calculateAngleBetween2Lines(
      posA: THREE.Vector3,
      posB: THREE.Vector3,
      posC: THREE.Vector3,
    ) {
      const vecBA = posA.clone().sub(posB).normalize();
      const vecBC = posC.clone().sub(posB).normalize();
      return Math.round(vecBA.angleTo(vecBC) * (180 / Math.PI));
    }

    // --- 6. HỆ THỐNG DỰNG ĐA GIÁC 3D VÀ HỘP CẮT TÓC ---
    let active2DChain: any[] = [];
    let isPenDrawing = false;
    let penPoints: any[] = [];
    let activeChain3D: any[] = [];
    const allNodes3D: any[] = [];
    let previewLine3D: any = null;
    let previewAngleSprite: any = null;
    let nodeHighlightRing: any = null;

    const createdArrowObjects: any[] = [];
    let activeTipChain: any[] = [];
    let autoRectStep = 0;
    let autoRectHitA: any = null;
    let autoRectMarkerA: any = null;

    let permStartHit: any = null;
    let permStep = 0;
    let previewPermGroup: any = null;
    let isEditingPerm = false;
    let editingPermIndex = -1;
    let editingPermOriginalItem: any = null;

    const ringGeo = new THREE.RingGeometry(0.03, 0.05, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x2563eb,
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

    function findNearbyArrowTip(screenRadiusPixels = 30) {
      let bestIdx = -1,
        minDistancePixels = screenRadiusPixels;
      const canvasRect = glcanvas.getBoundingClientRect();
      const tempVec = new THREE.Vector3();

      createdArrowObjects.forEach((arrObj, idx) => {
        if (
          !arrObj.group ||
          !arrObj.group.parent ||
          arrObj.group.visible === false
        )
          return;
        if (!isPointVisible(arrObj.topPos, camera, paintTarget)) return;
        tempVec.copy(arrObj.topPos).project(camera);
        if (tempVec.z > 1) return;
        const tipScreenX = ((tempVec.x + 1) * canvasRect.width) / 2;
        const tipScreenY = ((-tempVec.y + 1) * canvasRect.height) / 2;
        const mouseScreenX = ((mouseNDC.x + 1) * canvasRect.width) / 2;
        const mouseScreenY = ((-mouseNDC.y + 1) * canvasRect.height) / 2;
        const distPixels = Math.hypot(
          tipScreenX - mouseScreenX,
          tipScreenY - mouseScreenY,
        );
        if (distPixels < minDistancePixels) {
          minDistancePixels = distPixels;
          bestIdx = idx;
        }
      });
      return bestIdx;
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
      mesh.visible = isMeshFillVisible;
      mesh.userData = { isFillMesh: true };
      scene.add(mesh);
      return mesh;
    }

    function create90DegreeArrow(
      hitScalp: any,
      length = 0.45,
      colorHex = "#2563eb",
      id: string = crypto.randomUUID(),
    ) {
      const group = new THREE.Group();
      const origin = hitScalp.point.clone();
      const normal = hitScalp.normal.clone();
      const topPos = origin.clone().addScaledVector(normal, length);

      const baseMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 12, 12),
        new THREE.MeshBasicMaterial({ color: colorHex }),
      );
      baseMesh.position.copy(origin);
      group.add(baseMesh);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        origin,
        topPos,
      ]);
      group.add(
        new THREE.Line(
          lineGeo,
          new THREE.LineBasicMaterial({ color: colorHex, linewidth: 3 }),
        ),
      );

      const coneMesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.025, 0.08, 12),
        new THREE.MeshBasicMaterial({ color: colorHex }),
      );
      coneMesh.position.copy(topPos);
      coneMesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        normal,
      );
      group.add(coneMesh);

      scene.add(group);
      const arrowData = { id, scalpPos: origin, topPos, normal, group };
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
      const group = new THREE.Group();
      const posA = hitA.point.clone(),
        posB = hitB.point.clone();
      const normA = hitA.normal.clone(),
        normB = hitB.normal.clone();
      const posA_top = posA.clone().addScaledVector(normA, length);
      const posB_top = posB.clone().addScaledVector(normB, length);

      const borderGeo = new THREE.BufferGeometry().setFromPoints([
        posA,
        posB,
        posB_top,
        posA_top,
        posA,
      ]);
      group.add(
        new THREE.Line(
          borderGeo,
          new THREE.LineBasicMaterial({ color: colorHex, linewidth: 3 }),
        ),
      );

      const vertices = new Float32Array([
        posA.x,
        posA.y,
        posA.z,
        posB.x,
        posB.y,
        posB.z,
        posB_top.x,
        posB_top.y,
        posB_top.z,
        posA.x,
        posA.y,
        posA.z,
        posB_top.x,
        posB_top.y,
        posB_top.z,
        posA_top.x,
        posA_top.y,
        posA_top.z,
      ]);
      const meshGeo = new THREE.BufferGeometry();
      meshGeo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      meshGeo.computeVertexNormals();

      const fillMesh = new THREE.Mesh(
        meshGeo,
        new THREE.MeshBasicMaterial({
          color: colorHex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.38,
          depthWrite: false,
        }),
      );
      fillMesh.visible = isMeshFillVisible;
      fillMesh.userData = { isFillMesh: true };
      group.add(fillMesh);

      const spriteA = createAngleSprite("90°");
      spriteA.position.copy(posA_top);
      group.add(spriteA);
      const spriteB = createAngleSprite("90°");
      spriteB.position.copy(posB_top);
      group.add(spriteB);

      scene.add(group);
      const tipA = {
        id: arrowIds[0],
        scalpPos: posA,
        topPos: posA_top,
        normal: normA,
        group,
      };
      const tipB = {
        id: arrowIds[1],
        scalpPos: posB,
        topPos: posB_top,
        normal: normB,
        group,
      };
      createdArrowObjects.push(tipA, tipB);
      return { group, tipA, tipB };
    }

    function create3DBoxQuad(arrowA: any, arrowB: any, colorHex = "#2563eb") {
      const boxGroup = new THREE.Group();
      const posA_scalp = arrowA.scalpPos,
        posA_top = arrowA.topPos;
      const posB_scalp = arrowB.scalpPos,
        posB_top = arrowB.topPos;

      const borderGeo = new THREE.BufferGeometry().setFromPoints([
        posA_scalp,
        posB_scalp,
        posB_top,
        posA_top,
        posA_scalp,
      ]);
      boxGroup.add(
        new THREE.Line(
          borderGeo,
          new THREE.LineBasicMaterial({ color: colorHex, linewidth: 3 }),
        ),
      );

      const vertices = new Float32Array([
        posA_scalp.x,
        posA_scalp.y,
        posA_scalp.z,
        posB_scalp.x,
        posB_scalp.y,
        posB_scalp.z,
        posB_top.x,
        posB_top.y,
        posB_top.z,
        posA_scalp.x,
        posA_scalp.y,
        posA_scalp.z,
        posB_top.x,
        posB_top.y,
        posB_top.z,
        posA_top.x,
        posA_top.y,
        posA_top.z,
      ]);
      const meshGeo = new THREE.BufferGeometry();
      meshGeo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      meshGeo.computeVertexNormals();

      const fillMesh = new THREE.Mesh(
        meshGeo,
        new THREE.MeshBasicMaterial({
          color: colorHex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.38,
          depthWrite: false,
        }),
      );
      fillMesh.visible = isMeshFillVisible;
      fillMesh.userData = { isFillMesh: true };
      boxGroup.add(fillMesh);

      scene.add(boxGroup);
      return boxGroup;
    }

    // --- 7. UỐN TÓC 3D VÀ SÓNG ---
    const rodColorMap: Record<string, number> = {
      "16": 0xd97706,
      "19": 0xdb2777,
      "22": 0x2563eb,
      "25": 0xea580c,
    };

    function createPermRod3D(hitScalp: any, sizeMM = "19", angleDeg = 90) {
      const group = new THREE.Group();
      const radius = (parseFloat(sizeMM) / 1000) * 2.2;
      const rodGeo = new THREE.CylinderGeometry(radius, radius, 0.38, 16);
      const colorHex = rodColorMap[sizeMM] || 0xdb2777;
      const rodMesh = new THREE.Mesh(
        rodGeo,
        new THREE.MeshStandardMaterial({
          color: colorHex,
          roughness: 0.4,
          metalness: 0.2,
        }),
      );

      const normal = hitScalp.normal.clone();
      const upVec = new THREE.Vector3(0, 1, 0);
      let dirVec = normal.clone();
      if (angleDeg !== 90) {
        const rotAxis = new THREE.Vector3()
          .crossVectors(normal, upVec)
          .normalize();
        if (rotAxis.lengthSq() > 0.001) {
          dirVec.applyAxisAngle(
            rotAxis,
            THREE.MathUtils.degToRad(90 - angleDeg),
          );
        }
      }

      const offsetPos = hitScalp.point
        .clone()
        .addScaledVector(dirVec, radius + 0.02);
      rodMesh.position.copy(offsetPos);
      rodMesh.quaternion.copy(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dirVec,
        ),
      );
      rodMesh.rotateZ(Math.PI / 2);
      group.add(rodMesh);

      const sprite = createAngleSprite(`#${sizeMM}`);
      sprite.position.copy(
        offsetPos.clone().addScaledVector(dirVec, radius + 0.08),
      );
      group.add(sprite);

      scene.add(group);
      return group;
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
      const group = new THREE.Group();
      const origin = hitScalp.point.clone();
      const normal = hitScalp.normal.clone();
      let destPos = targetPos
        ? targetPos.clone()
        : origin.clone().addScaledVector(normal, length);

      let strandVec = destPos.clone().sub(origin);
      let mainDir = strandVec.clone().normalize();

      let baseTangent = new THREE.Vector3()
        .crossVectors(mainDir, normal)
        .normalize();
      if (baseTangent.lengthSq() < 0.001) {
        baseTangent = new THREE.Vector3()
          .crossVectors(mainDir, new THREE.Vector3(0, 1, 0))
          .normalize();
      }
      let baseNormalOut = new THREE.Vector3()
        .crossVectors(baseTangent, mainDir)
        .normalize();
      let sideVec = baseTangent.clone();
      let upWaveVec = baseNormalOut.clone();

      if (rollDeg !== 0) {
        const rollRad = THREE.MathUtils.degToRad(rollDeg);
        sideVec.applyAxisAngle(mainDir, rollRad);
        upWaveVec.applyAxisAngle(mainDir, rollRad);
      }

      const points: THREE.Vector3[] = [];
      const numSteps = 40;
      for (let i = 0; i <= numSteps; i++) {
        const t = i / numSteps;
        const p_linear = origin.clone().lerp(destPos, t);
        let waveVec = new THREE.Vector3();

        if (waveType === "curlC") {
          waveVec.addScaledVector(upWaveVec, Math.sin(t * Math.PI) * amp * 1.5);
        } else if (waveType === "curlCHook") {
          const cPart = Math.sin(t * Math.PI) * amp * 1.4;
          const jHook =
            t > 0.6 ? -Math.sin(((t - 0.6) / 0.4) * Math.PI) * amp * 1.1 : 0;
          waveVec.addScaledVector(upWaveVec, cPart + jHook);
        } else if (waveType === "curlS") {
          waveVec.addScaledVector(upWaveVec, Math.sin(t * Math.PI * 2.5) * amp);
        } else if (waveType === "curlJ") {
          if (t > 0.5)
            waveVec.addScaledVector(
              upWaveVec,
              Math.sin(((t - 0.5) / 0.5) * Math.PI * 0.5) * amp * 1.5,
            );
        } else if (waveType === "curlSpiral") {
          const angle = t * Math.PI * 2 * 3;
          waveVec.addScaledVector(sideVec, Math.cos(angle) * amp * 0.8);
          waveVec.addScaledVector(upWaveVec, Math.sin(angle) * amp * 0.8);
        } else if (waveType === "curlSpiralBase") {
          const factor = Math.max(0, (0.7 - t) / 0.7);
          const angle = t * Math.PI * 2 * 3;
          waveVec.addScaledVector(
            sideVec,
            Math.cos(angle) * amp * 0.8 * factor,
          );
          waveVec.addScaledVector(
            upWaveVec,
            Math.sin(angle) * amp * 0.8 * factor,
          );
        } else if (waveType === "curlSpiralTip") {
          const factor = t < 0.35 ? 0 : (t - 0.35) / 0.65;
          const angle = (t - 0.35) * Math.PI * 2 * 3;
          waveVec.addScaledVector(
            sideVec,
            Math.cos(angle) * amp * 0.9 * factor,
          );
          waveVec.addScaledVector(
            upWaveVec,
            Math.sin(angle) * amp * 0.9 * factor,
          );
        } else if (waveType === "curlHippie") {
          const angle = t * Math.PI * 2 * 7;
          waveVec.addScaledVector(sideVec, Math.cos(angle) * amp * 0.5);
          waveVec.addScaledVector(upWaveVec, Math.sin(angle) * amp * 0.5);
        } else if (waveType === "curlZigzag") {
          const cycle = (t * 10) % 1;
          const tri = cycle < 0.5 ? cycle * 4 - 1 : 3 - cycle * 4;
          waveVec.addScaledVector(upWaveVec, tri * amp * 0.7);
        } else if (waveType === "curlFingerWave") {
          waveVec.addScaledVector(
            upWaveVec,
            Math.sin(t * Math.PI * 2) * amp * 1.6,
          );
          waveVec.addScaledVector(sideVec, Math.cos(t * Math.PI) * amp * 0.8);
        } else {
          waveVec.addScaledVector(upWaveVec, Math.sin(t * Math.PI * 2) * amp);
        }

        points.push(p_linear.clone().add(waveVec));
      }

      const tubeGeo = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        40,
        0.012,
        8,
        false,
      );
      group.add(
        new THREE.Mesh(
          tubeGeo,
          new THREE.MeshStandardMaterial({
            color: colorHex,
            roughness: 0.5,
            metalness: 0.1,
          }),
        ),
      );

      const coneMesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.025, 0.08, 12),
        new THREE.MeshBasicMaterial({ color: colorHex }),
      );
      coneMesh.position.copy(destPos);
      coneMesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        mainDir,
      );
      group.add(coneMesh);

      scene.add(group);
      return group;
    }

    function findIntersectedPermWave(e: any) {
      setMouseFromEvent(e);
      raycaster.setFromCamera(mouseNDC, camera);
      const waveMeshes: any[] = [];
      const indexMap = new Map();

      historyStack.forEach((item, idx) => {
        if (
          item.kind === "straightPermWave" &&
          item.group &&
          item.group.visible
        ) {
          item.group.traverse((child: any) => {
            if (child.isMesh) {
              waveMeshes.push(child);
              indexMap.set(child, idx);
            }
          });
        }
      });

      const intersects = raycaster.intersectObjects(waveMeshes, false);
      if (intersects.length > 0) return indexMap.get(intersects[0].object);
      return -1;
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
      activeTipChain = [];
      autoRectStep = 0;
      autoRectHitA = null;
      if (autoRectMarkerA) {
        disposeObjectRecursively(autoRectMarkerA);
        autoRectMarkerA = null;
      }
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
      },
      push: (entry) => {
        stopPlayback();
        pushHistory(entry);
      },
    });
    updateTimelineUI();
    function updateNodeTool() {
      const guided =
        mode === "space" &&
        active3DSubTool === "node3d" &&
        nodePlacementMode.value === "guided";
      guidedNodes?.setEnabled(guided);
      if (mode === "space" && active3DSubTool === "node3d") {
        modeHint.textContent = guided
          ? "Chọn chân tóc trên đầu → chỉnh góc / độ dài ở bên phải → Đặt điểm. Bấm điểm cũ để sửa."
          : "Nâng cao: đặt điểm tự do. Ngoài đầu, điểm nằm trên mặt phẳng theo góc nhìn. Shift: khóa góc 90°.";
      }
    }
    nodePlacementMode.addEventListener(
      "change",
      () => {
        resetChainState();
        updateNodeTool();
      },
      { signal: eventController.signal },
    );
    const refreshNodeView = () => guidedNodes?.viewChanged();
    controls.addEventListener("change", refreshNodeView);
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

          if (active2DChain.length >= 3) {
            const startA = active2DChain[0];
            if (
              Math.hypot(currentUV.x - startA.x, currentUV.y - startA.y) < 25
            ) {
              const lastPt = active2DChain[active2DChain.length - 1];
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
                },
              });
              resetChainState();
              modeHint.textContent = "🎉 Đã khép kín phân khu 2D da đầu!";
              return;
            }
          }

          if (active2DChain.length > 0) {
            const lastPt = active2DChain[active2DChain.length - 1];
            pushHistory({
              kind: "texture",
              action: {
                type: current2DTool,
                x1: lastPt.x,
                y1: lastPt.y,
                x2: currentUV.x,
                y2: currentUV.y,
                color: colorHex,
                width,
              },
            });
          }
          active2DChain.push(currentUV);
          modeHint.textContent = `✏️ Đã nối ${active2DChain.length} điểm 2D da đầu! (Phím B ngắt)...`;
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
            const hitScalp = getScalpSurfaceHit(e);
            if (!hitScalp) return;

            if (autoRectStep === 0) {
              autoRectHitA = hitScalp;
              autoRectMarkerA = createNodeMarker(autoRectHitA.point, colorHex);
              autoRectStep = 1;
              modeHint.textContent =
                "⚡ Đã chọn điểm A! Click chọn điểm B để kéo Hộp 90°...";
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
              modeHint.textContent = "🎉 Đã tạo Mảng Hộp Vuốt Thẳng 90°!";
            }
          } else if (active3DSubTool === "arrow90") {
            const hitScalp = getScalpSurfaceHit(e);
            if (!hitScalp) return;
            const arrowData = create90DegreeArrow(
              hitScalp,
              extrudeLen,
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
              colorHex,
            });
          } else if (active3DSubTool === "connectTips") {
            const nearTipIdx = findNearbyArrowTip();
            if (nearTipIdx < 0) return;
            const targetArrow = createdArrowObjects[nearTipIdx];
            if (activeTipChain.length > 0) {
              const lastArrow = activeTipChain[activeTipChain.length - 1];
              if (lastArrow !== targetArrow) {
                const boxGroup = create3DBoxQuad(
                  lastArrow,
                  targetArrow,
                  colorHex,
                );
                pushHistory({
                  kind: "boxQuad",
                  boxGroup,
                  arrowA: lastArrow,
                  arrowB: targetArrow,
                  arrowAId: lastArrow.id,
                  arrowBId: targetArrow.id,
                  colorHex,
                });
              }
            }
            activeTipChain.push(targetArrow);
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
        if (e.buttons === 2) return;
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
            const lastPt = active2DChain[active2DChain.length - 1];
            redrawTexture({
              type: current2DTool,
              x1: lastPt.x,
              y1: lastPt.y,
              x2: hit.uv.x,
              y2: hit.uv.y,
              color: colorPicker.value,
              width: parseInt(widthPicker.value, 10),
            });
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
              nodeHighlightRing.visible = false;
              return;
            }
            const nearIdx = findNearby3DNode(point3D);
            if (nearIdx >= 0) {
              nodeHighlightRing.position.copy(allNodes3D[nearIdx].pos);
              nodeHighlightRing.lookAt(camera.position);
              nodeHighlightRing.visible = true;
            } else {
              nodeHighlightRing.visible = false;
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
        }
        if (k === "a") {
          camera.position.set(4.3, 0.5, 0);
          controls.target.set(0, 0.3, 0);
        }
        if (k === "s") {
          camera.position.set(0, 0.5, -4.3);
          controls.target.set(0, 0.3, 0);
        }
        if (k === "d") {
          camera.position.set(-4.3, 0.5, 0);
          controls.target.set(0, 0.3, 0);
        }
        if (k === "t") {
          camera.position.set(0, 4.3, 0.3);
          controls.target.set(0, 0.3, 0);
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
            colorHex: item.colorHex,
          } as JsonObject;
        case "boxQuad":
          return {
            kind: "boxQuad",
            arrowAId: item.arrowAId ?? item.arrowA?.id,
            arrowBId: item.arrowBId ?? item.arrowB?.id,
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
          const target = item.targetPos?.toArray
            ? item.targetPos.toArray()
            : item.scalpHit.point
                .clone()
                .addScaledVector(item.scalpHit.normal, item.length ?? 0.45)
                .toArray();
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
        const restored = create90DegreeArrow(
          hitFrom(entry.hit, "Điểm mũi tên"),
          typeof entry.length === "number" ? entry.length : 0.45,
          typeof entry.colorHex === "string" ? entry.colorHex : "#2563eb",
          id,
        );
        arrowMap.set(id, restored);
        return { ...jsonCopy(entry), arrowData: restored };
      }
      if (kind === "boxQuad") {
        const arrowA =
          typeof entry.arrowAId === "string"
            ? arrowMap.get(entry.arrowAId)
            : null;
        const arrowB =
          typeof entry.arrowBId === "string"
            ? arrowMap.get(entry.arrowBId)
            : null;
        if (!arrowA || !arrowB)
          throw new Error("Mảng nối 3D tham chiếu điểm không tồn tại.");
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
          theme: themeSelector.value,
          mesh_fill_visible: isMeshFillVisible,
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
      notesArea.value = textSetting("technical_notes", "");
      themeSelector.value = textSetting("theme", "luxury");
      themeSelector.dispatchEvent(new Event("change"));
      bg3dSelect.value = textSetting("background", "0xffffff");
      bg3dSelect.dispatchEvent(new Event("change"));
      isMeshFillVisible = settings.mesh_fill_visible !== false;
      guidedNodes?.setFillVisible(isMeshFillVisible);
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
      renderer.render(scene, camera);
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
    ].forEach((element) =>
      element.addEventListener(
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
          renderer.render(scene, camera);
        }, 60);
      }
    }

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
      controls.removeEventListener("end", handleCameraEnd);
      runtimeRef.current = null;
      eventController.abort();
      stopPlayback();
      controls.removeEventListener("change", refreshNodeView);
      guidedNodes?.dispose();
      controls.dispose();
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resizeRenderer);
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={rootRef} className="workspace-shell">
      {/* HEADER BAR */}
      <header>
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

        <div className="header-controls">
          <div id="activeClientIndicatorWrap" className="client-indicator">
            <span>Khách hàng</span>
            <span id="activeClientIndicator">
              {activeClient?.name || "Chưa chọn"}
            </span>
          </div>
          <div
            className={`save-indicator save-${saveStatus}`}
            role="status"
            aria-live="polite"
          >
            <span>{activeProject?.name || "Chưa mở project"}</span>
            <small>
              {
                (
                  {
                    "no-project": "Chọn project để lưu",
                    saved: "Đã lưu",
                    unsaved: "Chưa lưu",
                    saving: "Đang lưu…",
                    error: "Lưu lỗi",
                  } as Record<SaveStatus, string>
                )[saveStatus]
              }
            </small>
          </div>
          <button
            className="header-action"
            disabled={!activeProject || saveStatus === "saving"}
            onClick={() => {
              void saveActiveProject().catch(() => undefined);
            }}
          >
            Lưu
          </button>
          <button
            className="header-action"
            disabled={!activeProject || saveStatus === "saving"}
            onClick={() => {
              void saveAsCopy().catch(() => undefined);
            }}
          >
            Lưu bản sao
          </button>
          <select
            id="themeSelector"
            className="theme-select"
            style={{ width: "auto" }}
          >
            <option value="luxury">🌙 Midnight Studio</option>
            <option value="neon">⚡ Neon Cyberpunk</option>
            <option value="light">☀️ Elegant Light</option>
          </select>
          <button
            onClick={() => void logoutAfterSave()}
            className="danger logout-button"
          >
            ↗ Đăng xuất
          </button>
        </div>
      </header>

      {/* ================= TAB 1: ĐẦU 3D ================= */}
      <div id="tab3d" className="app-container">
        {/* SIDEBAR TRÁI: CÔNG CỤ */}
        <div className="app-sidebar">
          <div className="card-group">
            <div className="group-label">Chế độ làm việc</div>
            <div className="mode-grid">
              <button id="modeDraw" className="mode active">
                <span className="mode-icon">✎</span>
                <span className="mode-copy">
                  <strong>Vẽ 2D</strong>
                  <small>Sơ đồ trên da đầu</small>
                </span>
              </button>
              <button id="modeSpace" className="mode">
                <span className="mode-icon">◇</span>
                <span className="mode-copy">
                  <strong>Dựng 3D</strong>
                  <small>Điểm và mảng tóc</small>
                </span>
              </button>
              <button id="modePerm" className="mode">
                <span className="mode-icon">∿</span>
                <span className="mode-copy">
                  <strong>Uốn tóc</strong>
                  <small>Trục và dạng sóng</small>
                </span>
              </button>
            </div>
          </div>

          <div className="card-group" id="groupTools2D">
            <div className="group-label">Công cụ Vẽ 2D Da Đầu</div>
            <div className="tool-grid">
              <button data-tool="line" className="tool active">
                📏 Thẳng
              </button>
              <button data-tool="curve" className="tool">
                〰️ Cong
              </button>
              <button data-tool="dashed" className="tool">
                ┄ Nét đứt
              </button>
              <button data-tool="arrow" className="tool">
                ➔ Mũi tên
              </button>
              <button data-tool="pen" className="tool">
                ✏️ Bút tự do
              </button>
              <button data-tool="text" className="tool">
                🔤 Chữ
              </button>
              <button data-tool="sticker-clipper" className="tool">
                🪒 Tông đơ
              </button>
              <button data-tool="sticker-razor" className="tool">
                🗡 Dao cạo
              </button>
              <button data-tool="eraser" className="tool">
                Tẩy
              </button>
              <button id="finishChain2DBtn" style={{ width: "100%" }}>
                ✔ Ngắt đoạn 2D
              </button>
            </div>
          </div>

          <div
            className="card-group"
            id="groupTools3D"
            style={{ display: "none" }}
          >
            <div className="group-label">Công cụ Dựng 3D Cắt Tóc</div>
            <label htmlFor="nodePlacementMode">Cách đặt điểm</label>
            <select id="nodePlacementMode" defaultValue="guided">
              <option value="guided">Có hướng dẫn — bám chân tóc</option>
              <option value="free">Nâng cao — điểm 3D tự do</option>
            </select>
            <div className="tool-grid tool-grid-wide">
              <button id="toolNode3D" className="spacetool active">
                📍 Điểm & mảng tóc
              </button>
              <button id="toolAutoRect3D" className="spacetool">
                ⚡ Mảng Hộp Vuốt Thẳng 90°
              </button>
              <button id="toolArrow90" className="spacetool">
                🏹 Mũi Tên Góc Tự Do 3D
              </button>
              <button id="toolConnectTips" className="spacetool">
                🔗 Nối Đỉnh (Tạo Hộp 3D)
              </button>
            </div>
          </div>

          <div
            className="card-group"
            id="groupToolsPerm"
            style={{ display: "none" }}
          >
            <div className="group-label">Công cụ Uốn 3D & Sóng</div>
            <div className="tool-grid">
              <button id="toolPermRod" className="permtool active">
                💈 Trục Uốn 3D
              </button>
              <button id="toolCurlC" className="permtool">
                🌀 Sóng C
              </button>
              <button id="toolCurlCHook" className="permtool">
                ↪️ Sóng C Móc
              </button>
              <button id="toolCurlS" className="permtool">
                🌊 Sóng S
              </button>
              <button id="toolCurlJ" className="permtool">
                ↪️ Sóng J
              </button>
              <button id="toolCurlSpiral" className="permtool">
                🌀 Spiral Xoắn
              </button>
              <button id="toolCurlHippie" className="permtool">
                🐑 Xoăn Hippie
              </button>
              <button id="toolCurlZigzag" className="permtool">
                ⚡ Dập Xù Ziczac
              </button>
            </div>
          </div>

          <div className="card-group">
            <div className="group-label">Điều khiển & Lưới</div>
            <div className="control-grid">
              <button id="breakChainBtn" className="primary">
                ✂️ Ngắt chuỗi (B)
              </button>
              <button id="toggleMeshFillBtn" className="toggle-on">
                🎨 Màu Mảng: BẬT
              </button>
              <button id="cageToggleBtn" className="toggle-on">
                🌐 Lồng Lưới: BẬT
              </button>
            </div>
          </div>

          <div className="card-group">
            <div className="group-label">Góc nhìn (W A S D T) & Nền</div>
            <div className="view-grid">
              <button data-view="front">Trước (W)</button>
              <button data-view="left">Trái (A)</button>
              <button data-view="right">Phải (D)</button>
              <button data-view="back">Sau (S)</button>
              <button data-view="top">Trên (T)</button>
            </div>
            <select
              id="bg3dSelect"
              className="theme-select"
              style={{ marginTop: 4 }}
            >
              <option value="0xffffff">🎨 Nền Trắng</option>
              <option value="0x0b0a09">🎨 Nền Đen</option>
              <option value="0x1e293b">🎨 Nền Xám Đậm</option>
            </select>
          </div>
        </div>

        {/* KHUNG NHÌN VIEWPORT TRUNG TÂM */}
        <div className="app-viewport">
          <div className="canvas-frame">
            <canvas id="glcanvas" />
            <div className="mode-hint" id="modeHint">
              ✏️ Click Chuột Trái để vẽ / dựng 3D | Chuột Phải xoay 360° (Phím W
              A S D T: Đổi góc nhìn)
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

        {/* SIDEBAR PHẢI: THIẾT LẬP THÔNG SỐ */}
        <div className="app-inspector">
          <div
            className="card-group guided-node-panel"
            id="guidedNodeSettings"
            style={{ display: "none" }}
          >
            <div className="group-label">Đặt điểm theo chân tóc</div>
            <p id="guidedNodeStatus" role="status" aria-live="polite">
              1. Bấm trên da đầu để chọn chân tóc.
            </p>
            <button id="guidedNodeFit">Xem trọn đầu & điểm</button>
            <label htmlFor="guidedNodeAngle">
              Góc nâng <output id="guidedNodeAngleValue">90°</output>
            </label>
            <div className="btnrow node-angle-presets">
              <button type="button" data-node-angle="0">
                0°
              </button>
              <button type="button" data-node-angle="45">
                45°
              </button>
              <button type="button" data-node-angle="90" className="active">
                90°
              </button>
            </div>
            <input
              id="guidedNodeAngle"
              aria-label="Góc nâng"
              type="range"
              min="0"
              max="90"
              step="1"
              defaultValue="90"
            />
            <small>0° theo tiếp tuyến da đầu · 90° vuông góc da đầu</small>
            <label htmlFor="guidedNodeDirection">Hướng trên đầu</label>
            <select id="guidedNodeDirection" defaultValue="0">
              <option value="0">Hướng lên đỉnh đầu</option>
              <option value="90">Sang bên (+90°)</option>
              <option value="180">Hướng xuống</option>
              <option value="270">Sang bên (−90°)</option>
            </select>
            <label htmlFor="guidedNodeLengthNumber">
              Độ dài theo tỉ lệ mô hình
            </label>
            <div className="node-length-controls">
              <input
                id="guidedNodeLength"
                aria-label="Điều chỉnh độ dài"
                type="range"
                min="0.05"
                max="1.5"
                step="0.01"
                defaultValue="0.45"
              />
              <input
                id="guidedNodeLengthNumber"
                aria-label="Độ dài chính xác"
                type="number"
                min="0.05"
                max="1.5"
                step="0.01"
                defaultValue="0.45"
              />
            </div>
            <small>
              Chấm vàng: chân tóc. Chấm xanh: điểm xem trước. Độ dài chưa quy
              đổi sang cm.
            </small>
            <button id="guidedNodeApply" className="primary" disabled>
              Đặt điểm
            </button>
            <div className="btnrow">
              <button id="guidedNodeMoveRoot" disabled>
                Đổi chân tóc
              </button>
              <button id="guidedNodeCancel" disabled>
                Hủy chỉnh sửa
              </button>
            </div>
            <button id="guidedNodeClose" disabled>
              Khép mảng (từ 3 điểm)
            </button>
          </div>
          <div className="card-group">
            <div className="group-label">Màu / Cỡ nét / Snap</div>
            <div className="style-controls">
              <input type="color" id="colorPicker" defaultValue="#2563eb" />
              <input
                type="range"
                id="widthPicker"
                min="1"
                max="14"
                defaultValue="4"
              />
              <button id="snapToggleBtn" className="toggle-on">
                🧲 Snap
              </button>
            </div>
          </div>

          <div className="card-group">
            <div className="group-label">
              <span>Chiều dài vươn 3D</span>
              <span
                id="extrudeLenVal"
                style={{ color: "var(--accent-primary)" }}
              >
                0.45m
              </span>
            </div>
            <input
              type="range"
              id="extrudeLenPicker"
              min="0.2"
              max="1.0"
              step="0.05"
              defaultValue="0.45"
            />
          </div>

          <div
            className="card-group"
            id="groupRodSettings"
            style={{ display: "none" }}
          >
            <div className="group-label">Thông Số Trục & Hướng Cong</div>
            <select id="rodSizeSelect">
              <option value="16">Trục #16 (Vàng)</option>
              <option value="19" selected>
                Trục #19 (Hồng)
              </option>
              <option value="22">Trục #22 (Xanh)</option>
              <option value="25">Trục #25 (Cam)</option>
            </select>
            <select id="rodAngleSelect">
              <option value="90">On-Base (90°)</option>
              <option value="45">Half-Off Base (45°)</option>
              <option value="20">Off-Base (20°)</option>
            </select>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  minWidth: 48,
                }}
              >
                Biên độ:
              </span>
              <input
                type="range"
                id="waveAmpPicker"
                min="0.04"
                max="0.20"
                step="0.02"
                defaultValue="0.10"
              />
            </div>
            <select id="waveRollPicker">
              <option value="90" selected>
                ⬅️ Sang Trái (Bám da đầu)
              </option>
              <option value="270">➡️ Sang Phải (Bám da đầu)</option>
              <option value="0">⬆️ Vươn Trên (Bật ngửa ra)</option>
              <option value="180">⬇️ Gập Dưới (Úp vào trong)</option>
            </select>
          </div>

          <div className="card-group">
            <div className="group-label">Thao tác & Xuất file</div>
            <div className="history-actions">
              <button id="undoBtn" title="Ctrl+Z" style={{ flex: 1 }}>
                ↶ Hoàn tác
              </button>
              <button
                id="redoBtn"
                title="Ctrl+Y hoặc Ctrl+Shift+Z"
                style={{ flex: 1 }}
              >
                ↷ Làm lại
              </button>
            </div>
            <button id="clearBtn" className="danger" style={{ width: "100%" }}>
              Xoá toàn bộ 2D & 3D
            </button>
            <div className="export-actions">
              <button id="pngBtn" className="primary" style={{ flex: 1 }}>
                Xuất PNG
              </button>
              <button id="pdfBtn" className="primary" style={{ flex: 1 }}>
                Xuất PDF
              </button>
            </div>
          </div>

          <div className="card-group">
            <div className="group-label">Ghi chú kỹ thuật</div>
            <textarea
              id="notesArea"
              placeholder="Ghi chú kỹ thuật uốn / cắt..."
            />
          </div>

          <div className="card-group flat-preview">
            <div className="group-label">Bản trải phẳng (Texture)</div>
            <img id="flatPreview" alt="bản trải phẳng" />
          </div>
        </div>
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
        />
      </div>
    </div>
  );
};
