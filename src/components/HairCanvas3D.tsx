import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface RollerItem {
  id: string;
  zone: string;
  size: number;
  angle: number;
  color: string;
  position: [number, number, number];
  rotation: [number, number, number];
}

interface HairCanvas3DProps {
  rollers: RollerItem[];
  activeZone: string;
}

export const HairCanvas3D: React.FC<HairCanvas3DProps> = ({ rollers, activeZone }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rollersGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Khởi tạo Scene, Camera và Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x16181d);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 1.5, 4.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);

    // OrbitControls xoay 360 độ
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 8;
    controls.minDistance = 2;
    controls.target.set(0, 0.6, 0);

    // Ánh sáng đa chiều
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(5, 10, 7);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.5);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);

    // Mô hình đầu Mannequin kỹ thuật số
    const mannequinGroup = new THREE.Group();

    // Khối đầu
    const headGeo = new THREE.SphereGeometry(1, 32, 32);
    headGeo.scale(0.85, 1.15, 0.95);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x2e3440,
      roughness: 0.6,
      metalness: 0.1,
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.y = 0.8;
    mannequinGroup.add(headMesh);

    // Cổ & Đế
    const neckGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.8, 32);
    const neckMesh = new THREE.Mesh(neckGeo, headMat);
    neckMesh.position.y = -0.2;
    mannequinGroup.add(neckMesh);

    const baseGeo = new THREE.CylinderGeometry(1.2, 1.4, 0.15, 32);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1f232a });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -0.65;
    mannequinGroup.add(baseMesh);

    // Mũi định hướng
    const noseGeo = new THREE.ConeGeometry(0.12, 0.35, 16);
    noseGeo.rotateX(Math.PI / 2);
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x4c566a });
    const noseMesh = new THREE.Mesh(noseGeo, noseMat);
    noseMesh.position.set(0, 0.7, 0.95);
    mannequinGroup.add(noseMesh);

    // Lưới sàn
    const grid = new THREE.GridHelper(6, 12, 0x3b82f6, 0x242b35);
    grid.position.y = -0.73;
    scene.add(grid);

    scene.add(mannequinGroup);

    // Group chứa các trục uốn
    const rollersGroup = new THREE.Group();
    scene.add(rollersGroup);
    rollersGroupRef.current = rollersGroup;

    // Vòng lặp render
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      const newW = containerRef.current.clientWidth;
      const newH = containerRef.current.clientHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, []);

  // Cập nhật các trục uốn khi danh sách rollers thay đổi
  useEffect(() => {
    if (!rollersGroupRef.current) return;
    const group = rollersGroupRef.current;

    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    rollers.forEach((r) => {
      const radius = (r.size / 20) * 0.12;
      const length = 0.55;
      const cylinderGeo = new THREE.CylinderGeometry(radius, radius, length, 24);
      const cylinderMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(r.color),
        metalness: 0.3,
        roughness: 0.4,
      });

      const rollerMesh = new THREE.Mesh(cylinderGeo, cylinderMat);
      rollerMesh.position.set(...r.position);
      rollerMesh.rotation.set(...r.rotation);

      const edgeGeo = new THREE.EdgesGeometry(cylinderGeo);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
      const wireframe = new THREE.LineSegments(edgeGeo, lineMat);
      rollerMesh.add(wireframe);

      group.add(rollerMesh);
    });
  }, [rollers]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div className="canvas-overlay-guide">
        <span>Xoay: <strong>Chuột trái</strong></span>
        <span>Thu phóng: <strong>Cuộn chuột</strong></span>
        <span>Di chuyển: <strong>Chuột phải</strong></span>
        <span className="active-zone-badge">Khu vực: <strong>{activeZone}</strong></span>
      </div>
    </div>
  );
};