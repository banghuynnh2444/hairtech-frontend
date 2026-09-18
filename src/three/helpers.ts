import * as THREE from "three";

function disposeMaterial(mat: any) {
  if (!mat) return;
  if (mat.map) mat.map.dispose();
  if (mat.alphaMap) mat.alphaMap.dispose();
  if (mat.bumpMap) mat.bumpMap.dispose();
  if (mat.normalMap) mat.normalMap.dispose();
  if (mat.roughnessMap) mat.roughnessMap.dispose();
  if (mat.metalnessMap) mat.metalnessMap.dispose();
  if (mat.specularMap) mat.specularMap.dispose();
  if (mat.lightMap) mat.lightMap.dispose();
  if (mat.envMap) mat.envMap.dispose();
  mat.dispose();
}

/**
 * Đệ quy giải phóng tài nguyên Three.js (geometry, material, textures)
 * để chống rò rỉ bộ nhớ GPU/RAM khi xóa object khỏi scene.
 */
export function disposeObjectRecursively(obj: any) {
  if (!obj) return;
  obj.traverse((child: any) => {
    if (child.geometry) {
      child.geometry.dispose();
    }
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(disposeMaterial);
      } else {
        disposeMaterial(child.material);
      }
    }
  });
  if (obj.parent) obj.parent.remove(obj);
}

/**
 * Tạo nhãn canvas sprite 2D hiển thị trong không gian 3D
 * (dùng cho số hiệu góc 90°, kích thước lô uốn #19, v.v.)
 */
export function createAngleSprite(textStr: string) {
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

/**
 * Tính góc độ giữa 2 đoạn thẳng tạo bởi 3 điểm (posA -> posB -> posC)
 */
export function calculateAngleBetween2Lines(
  posA: THREE.Vector3,
  posB: THREE.Vector3,
  posC: THREE.Vector3,
) {
  const vecBA = posA.clone().sub(posB).normalize();
  const vecBC = posC.clone().sub(posB).normalize();
  return Math.round(vecBA.angleTo(vecBC) * (180 / Math.PI));
}
