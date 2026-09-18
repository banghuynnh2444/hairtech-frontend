import * as THREE from "three";
import { createAngleSprite } from "./helpers";

export const rodColorMap: Record<string, number> = {
  "16": 0xd97706,
  "19": 0xdb2777,
  "22": 0x2563eb,
  "25": 0xea580c,
};

/**
 * Dựng trục uốn tóc hình trụ 3D (Perm Rod) kèm nhãn kích cỡ
 */
export function createPermRod3D(
  hitScalp: any,
  sizeMM = "19",
  angleDeg = 90,
  scene?: THREE.Scene,
) {
  const group = new THREE.Group();
  const radius = (parseFloat(sizeMM) / 1000) * 2.2;
  // Chiều dài trục uốn chuẩn salon thực tế ~10cm (0.10m), thay vì 0.38m quá khổ
  const rodLength = 0.10;
  const rodGeo = new THREE.CylinderGeometry(radius, radius, rodLength, 16);
  const colorHex = rodColorMap[sizeMM] || 0xdb2777;
  const rodMesh = new THREE.Mesh(
    rodGeo,
    new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.4,
      metalness: 0.2,
    }),
  );

  let normal = hitScalp.normal.clone();
  // Đảm bảo normal hướng ly tâm ra ngoài hộp sọ manocanh
  const headCenter = new THREE.Vector3(0, 0.35, 0);
  const outVec = hitScalp.point.clone().sub(headCenter).normalize();
  if (normal.dot(outVec) < 0.2) {
    normal.lerp(outVec, 0.75).normalize();
  }

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
    .addScaledVector(dirVec, radius + 0.015);
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
    offsetPos.clone().addScaledVector(dirVec, radius + 0.045),
  );
  group.add(sprite);

  if (scene) scene.add(group);
  return group;
}

/**
 * Dựng lọn sóng uốn trục thẳng (C-curl, S-curl, Spiral, Hippie, Finger Wave, v.v.)
 */
export function createStraightAxisPermWave3D(
  hitScalp: any,
  waveType = "curlC",
  length = 0.45,
  amp = 0.1,
  colorHex = "#2563eb",
  targetPos: any = null,
  rollDeg = 90,
  scene?: THREE.Scene,
) {
  const group = new THREE.Group();
  const origin = hitScalp.point.clone();
  let normal = hitScalp.normal.clone();
  const headCenter = new THREE.Vector3(0, 0.35, 0);
  const outVec = origin.clone().sub(headCenter).normalize();
  if (normal.dot(outVec) < 0.2) {
    normal.lerp(outVec, 0.75).normalize();
  }
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

  if (scene) scene.add(group);
  return group;
}

/**
 * Tìm kiếm sóng uốn tóc mà tia chuột đang giao cắt
 */
export function findIntersectedPermWave(
  mouseNDC: THREE.Vector2,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
  historyStack: any[],
) {
  raycaster.setFromCamera(mouseNDC, camera);
  const waveMeshes: any[] = [];
  const indexMap = new Map<any, number>();

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
  if (intersects.length > 0) {
    const hitMesh = intersects[0].object;
    return indexMap.get(hitMesh) ?? -1;
  }
  return -1;
}
