import * as THREE from 'three';

/** Elevation is measured from the local scalp tangent: 90 degrees is outward. */
export function liftedPoint(root: THREE.Vector3, normal: THREE.Vector3, angle: number, direction: number, length: number) {
  const n = normal.clone().normalize();
  let up = new THREE.Vector3(0, 1, 0).projectOnPlane(n);
  if (up.lengthSq() < 1e-6) up = new THREE.Vector3(0, 0, 1).projectOnPlane(n);
  up.normalize();
  const right = new THREE.Vector3().crossVectors(up, n).normalize();
  const heading = THREE.MathUtils.degToRad(direction);
  const tangent = up.multiplyScalar(Math.cos(heading)).addScaledVector(right, Math.sin(heading));
  const elevation = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(angle, 0, 90));
  return root.clone().addScaledVector(n, Math.sin(elevation) * length).addScaledVector(tangent, Math.cos(elevation) * length);
}

/** Do not offer points outside the camera or hidden behind the head. */
export function isPointVisible(point: THREE.Vector3, camera: THREE.Camera, head: THREE.Object3D, tolerance = 0.035) {
  camera.updateMatrixWorld();
  head.updateWorldMatrix(true, false);
  const projected = point.clone().project(camera);
  if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || projected.z < -1 || projected.z > 1) return false;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
  const distance = ray.ray.origin.distanceTo(point);
  const surface = ray.intersectObject(head, false)[0];
  return !surface || surface.distance >= distance - tolerance;
}

export function rightAnglePoint(point: THREE.Vector3, previous: THREE.Vector3, anchor: THREE.Vector3) {
  const axis = anchor.clone().sub(previous).normalize();
  return point.clone().sub(point.clone().sub(anchor).projectOnVector(axis));
}
