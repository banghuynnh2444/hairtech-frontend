export type JsonValue =
  null | boolean | number | string | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

export interface ProjectDataV1 {
  version: 1;
  drawing_2d: JsonObject[];
  nodes_3d: JsonObject[];
  sections: JsonObject[];
  perm_rods: JsonObject[];
  waves: JsonObject[];
  timeline: { entries: JsonObject[]; cursor: number };
  camera: {
    position: [number, number, number];
    target: [number, number, number];
    zoom: number;
  };
  settings: JsonObject;
}

export function createEmptyProjectData(): ProjectDataV1 {
  return {
    version: 1,
    drawing_2d: [],
    nodes_3d: [],
    sections: [],
    perm_rods: [],
    waves: [],
    timeline: { entries: [], cursor: 0 },
    camera: { position: [0, 0.5, 4.3], target: [0, 0.3, 0], zoom: 1 },
    settings: {
      mode: "draw",
      color: "#2563eb",
      width: 4,
      background: "0xffffff",
      mesh_fill_visible: true,
      cage_visible: true,
      snap_enabled: true,
      technical_notes: "",
    },
  };
}

export function isProjectDataV1(value: unknown): value is ProjectDataV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const project = value as Partial<ProjectDataV1>;
  const objectArray = (items: unknown): items is JsonObject[] =>
    Array.isArray(items) &&
    items.every((item) =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
    );
  const vector = (items: unknown): items is [number, number, number] =>
    Array.isArray(items) &&
    items.length === 3 &&
    items.every((item) => typeof item === "number" && Number.isFinite(item));
  const timeline = project.timeline;
  const camera = project.camera;
  return (
    project.version === 1 &&
    objectArray(project.drawing_2d) &&
    objectArray(project.nodes_3d) &&
    objectArray(project.sections) &&
    objectArray(project.perm_rods) &&
    objectArray(project.waves) &&
    Boolean(
      timeline &&
      objectArray(timeline.entries) &&
      Number.isInteger(timeline.cursor) &&
      timeline.cursor >= 0 &&
      timeline.cursor <= timeline.entries.length,
    ) &&
    Boolean(
      camera &&
      vector(camera.position) &&
      vector(camera.target) &&
      typeof camera.zoom === "number" &&
      Number.isFinite(camera.zoom) &&
      camera.zoom > 0,
    ) &&
    Boolean(
      project.settings &&
      typeof project.settings === "object" &&
      !Array.isArray(project.settings),
    )
  );
}
