import * as THREE from "three";
import { createAngleSprite } from "./helpers";
import { liftedPoint } from "../components/nodePlacement";

export interface Arrow3DData {
  id: string;
  scalpPos: THREE.Vector3;
  topPos: THREE.Vector3;
  normal: THREE.Vector3;
  group: THREE.Group;
  angleDeg?: number;
  directionDeg?: number;
}

export interface DirectSectionLine3DData {
  id: string;
  posA: THREE.Vector3;
  posB: THREE.Vector3;
  style: "solid" | "dashed" | "arrow";
  group: THREE.Group;
}

/**
 * Dựng mũi tên chỉ hướng nâng góc tự do (0° đến 180°) kèm nhãn góc độ
 */
export function createElevationArrow3D(
  hitScalp: any,
  length = 0.45,
  angleDeg = 90,
  directionDeg = 0,
  colorHex = "#2563eb",
  id: string = crypto.randomUUID(),
  scene?: THREE.Scene,
): Arrow3DData {
  const group = new THREE.Group();
  const origin = hitScalp.point.clone();
  let normal = hitScalp.normal.clone();
  const headCenter = new THREE.Vector3(0, 0.35, 0);
  const outVec = origin.clone().sub(headCenter).normalize();
  if (normal.dot(outVec) < 0.2) {
    normal.lerp(outVec, 0.75).normalize();
  }

  // Tính toạ độ đỉnh theo góc nâng và hướng ngả
  const topPos = liftedPoint(origin, normal, angleDeg, directionDeg, length);
  const dirVec = topPos.clone().sub(origin).normalize();

  const baseMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 12, 12),
    new THREE.MeshBasicMaterial({ color: colorHex }),
  );
  baseMesh.position.copy(origin);
  group.add(baseMesh);

  const lineGeo = new THREE.BufferGeometry().setFromPoints([origin, topPos]);
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
  coneMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirVec);
  group.add(coneMesh);

  // Nhãn hiển thị góc nâng (ví dụ: 45°, 90°, 135°)
  const sprite = createAngleSprite(`${Math.round(angleDeg)}°`);
  sprite.position.copy(topPos.clone().addScaledVector(dirVec, 0.05));
  group.add(sprite);

  if (scene) scene.add(group);
  return { id, scalpPos: origin, topPos, normal: dirVec, group, angleDeg, directionDeg };
}

/**
 * Dựng mũi tên chỉ hướng nâng góc 90 độ từ da đầu (tương thích ngược)
 */
export function create90DegreeArrow(
  hitScalp: any,
  length = 0.45,
  colorHex = "#2563eb",
  id: string = crypto.randomUUID(),
  scene?: THREE.Scene,
): Arrow3DData {
  return createElevationArrow3D(hitScalp, length, 90, 0, colorHex, id, scene);
}

/**
 * Dựng đường thẳng phân khu 3D trong không gian không bo theo khuôn sọ (Nét liền, nét đứt, mũi tên)
 */
export function create3DDirectSectionLine(
  hitA: any,
  hitB: any,
  style: "solid" | "dashed" | "arrow" = "solid",
  colorHex = "#2563eb",
  id: string = crypto.randomUUID(),
  scene?: THREE.Scene,
): DirectSectionLine3DData {
  const group = new THREE.Group();
  const normA = hitA.normal ? hitA.normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
  const normB = hitB.normal ? hitB.normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
  // Nhấc nhẹ lên 3mm để không bị z-fighting với bề mặt sọ
  const posA = hitA.point.clone().addScaledVector(normA, 0.003);
  const posB = hitB.point.clone().addScaledVector(normB, 0.003);

  const markerGeo = new THREE.SphereGeometry(0.016, 12, 12);
  const markerMat = new THREE.MeshBasicMaterial({ color: colorHex });
  const markerA = new THREE.Mesh(markerGeo, markerMat);
  markerA.position.copy(posA);
  group.add(markerA);

  const markerB = new THREE.Mesh(markerGeo, markerMat);
  markerB.position.copy(posB);
  group.add(markerB);

  const lineGeo = new THREE.BufferGeometry().setFromPoints([posA, posB]);
  let lineMesh: THREE.Line;
  if (style === "dashed") {
    const dashMat = new THREE.LineDashedMaterial({
      color: colorHex,
      linewidth: 3,
      dashSize: 0.03,
      gapSize: 0.02,
    });
    lineMesh = new THREE.Line(lineGeo, dashMat);
    lineMesh.computeLineDistances();
  } else {
    const solidMat = new THREE.LineBasicMaterial({
      color: colorHex,
      linewidth: 3,
    });
    lineMesh = new THREE.Line(lineGeo, solidMat);
  }
  group.add(lineMesh);

  if (style === "arrow") {
    const dir = posB.clone().sub(posA).normalize();
    const coneMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.022, 0.06, 12),
      new THREE.MeshBasicMaterial({ color: colorHex }),
    );
    coneMesh.position.copy(posB);
    coneMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    group.add(coneMesh);
  }

  if (scene) scene.add(group);
  return { id, posA, posB, style, group };
}

/**
 * Dựng mảng chữ nhật tự động tạo bởi 2 điểm chân tóc (2 mũi tên 90 độ nối nhau)
 */
export function createAutoRectSection3D(
  hitA: any,
  hitB: any,
  length = 0.45,
  colorHex = "#2563eb",
  arrowIds: [string, string] = [crypto.randomUUID(), crypto.randomUUID()],
  isMeshFillVisible = true,
  scene?: THREE.Scene,
) {
  const group = new THREE.Group();
  const posA = hitA.point.clone(),
    posB = hitB.point.clone();
  let normA = hitA.normal.clone(),
    normB = hitB.normal.clone();

  const headCenter = new THREE.Vector3(0, 0.35, 0);
  const outVecA = posA.clone().sub(headCenter).normalize();
  if (normA.dot(outVecA) < 0.2) {
    normA.lerp(outVecA, 0.75).normalize();
  }
  const outVecB = posB.clone().sub(headCenter).normalize();
  if (normB.dot(outVecB) < 0.2) {
    normB.lerp(outVecB, 0.75).normalize();
  }

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

  if (scene) scene.add(group);
  const tipA: Arrow3DData = {
    id: arrowIds[0],
    scalpPos: posA,
    topPos: posA_top,
    normal: normA,
    group,
  };
  const tipB: Arrow3DData = {
    id: arrowIds[1],
    scalpPos: posB,
    topPos: posB_top,
    normal: normB,
    group,
  };
  return { group, tipA, tipB };
}

/**
 * Dựng mặt phẳng / hộp 3D nối giữa 2 mũi tên
 */
export function create3DBoxQuad(
  arrowA: Arrow3DData,
  arrowB: Arrow3DData,
  colorHex = "#2563eb",
  isMeshFillVisible = true,
  scene?: THREE.Scene,
) {
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

  if (scene) scene.add(boxGroup);
  return boxGroup;
}
