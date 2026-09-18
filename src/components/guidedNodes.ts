import * as THREE from 'three';
import { lastClearIndex } from './historyTimeline';
import { isPointVisible, liftedPoint } from './nodePlacement';

type Vec = [number, number, number];
type Node = { id: string; chain: string; root: Vec; normal: Vec; angle: number; direction: number; length: number; color: string };
type Operation = { type: 'put'; node: Node } | { type: 'close'; chain: string };
type ScalpHit = { point: THREE.Vector3; normal: THREE.Vector3 };
type Options = {
  scene: THREE.Scene; camera: THREE.Camera; canvas: HTMLCanvasElement;
  head: () => THREE.Object3D; scalpHit: (event: PointerEvent) => ScalpHit | null;
  color: () => string; fit?: (points: THREE.Vector3[]) => void;
  push: (entry: { kind: 'guided_nodes'; operation: Operation }) => void;
  onRequestRender?: () => void;
};

export class GuidedNodes {
  private readonly sceneGroup = new THREE.Group();
  private readonly preview = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly panel = document.getElementById('guidedNodeSettings')!;
  private readonly status = document.getElementById('guidedNodeStatus')!;
  private readonly apply = document.getElementById('guidedNodeApply') as HTMLButtonElement;
  private readonly close = document.getElementById('guidedNodeClose') as HTMLButtonElement | null;
  private readonly angle = document.getElementById('guidedNodeAngle') as HTMLInputElement;
  private readonly direction = document.getElementById('guidedNodeDirection') as HTMLSelectElement;
  private readonly length = document.getElementById('guidedNodeLength') as HTMLInputElement;
  private readonly lengthNumber = document.getElementById('guidedNodeLengthNumber') as HTMLInputElement;
  private readonly cancel = document.getElementById('guidedNodeCancel') as HTMLButtonElement;
  private readonly moveRoot = document.getElementById('guidedNodeMoveRoot') as HTMLButtonElement;
  private listeners: Array<() => void> = [];
  private nodes = new Map<string, Node>();
  private closed = new Set<string>();
  private draft: Node | null = null;
  private chain = crypto.randomUUID();
  private enabled = false;
  private visibleFill = true;
  private movingRoot = false;
  private valid = false;

  constructor(private readonly options: Options) {
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.042, 0.054, 32), new THREE.MeshBasicMaterial({ color: '#fbbf24', side: THREE.DoubleSide }));
    this.ring.visible = false;
    options.scene.add(this.sceneGroup, this.preview, this.ring);
    const on = (element: HTMLElement, event: string, listener: EventListener) => {
      element.addEventListener(event, listener);
      this.listeners.push(() => element.removeEventListener(event, listener));
    };
    on(this.angle, 'input', () => this.changeSettings());
    on(this.direction, 'change', () => this.changeSettings());
    on(this.length, 'input', () => { this.lengthNumber.value = this.length.value; this.changeSettings(); });
    on(this.lengthNumber, 'input', () => {
      const value = this.lengthNumber.valueAsNumber;
      if (!Number.isFinite(value) || value < 0.05 || value > 1.5) {
        this.apply.disabled = true;
        this.valid = false;
        this.status.textContent = 'Nhập độ dài từ 0.05 đến 1.50.';
        return;
      }
      this.length.value = String(value);
      this.changeSettings();
    });
    this.panel.querySelectorAll<HTMLButtonElement>('[data-node-angle]').forEach(button => on(button, 'click', () => {
      this.angle.value = button.dataset.nodeAngle!;
      this.changeSettings();
    }));
    on(this.apply, 'click', () => this.commit());
    on(this.cancel, 'click', () => this.cancelDraft());
    on(this.moveRoot, 'click', () => {
      if (!this.draft) return;
      this.movingRoot = true;
      this.status.textContent = 'Bấm vị trí chân tóc mới trên da đầu. Điểm cũ chỉ đổi khi bấm Cập nhật.';
    });

    const fit = document.getElementById('guidedNodeFit');
    if (fit) on(fit, 'click', () => {
      const points = [...this.nodes.values()].map(node => this.tip(node));
      if (this.draft) points.push(this.tip(this.draft));
      options.fit?.(points);
    });
    if (this.close) {
      on(this.close, 'click', () => {
        if (this.close?.disabled) return;
        options.push({ kind: 'guided_nodes', operation: { type: 'close', chain: this.chain } });
        this.chain = crypto.randomUUID();
        this.cancelDraft();
      });
    }
    this.changeSettings();
  }

  private requestRender() {
    this.options.onRequestRender?.();
  }

  private disposeChildren(group: THREE.Group) {
    for (const child of [...group.children]) {
      child.traverse(object => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => material.dispose());
      });
      group.remove(child);
    }
  }

  private tip(node: Node) {
    return liftedPoint(new THREE.Vector3(...node.root), new THREE.Vector3(...node.normal), node.angle, node.direction, node.length);
  }

  private marker(group: THREE.Group, point: THREE.Vector3, color: string, radius = 0.026) {
    const marker = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), new THREE.MeshBasicMaterial({ color }));
    marker.position.copy(point);
    group.add(marker);
  }

  private line(group: THREE.Group, points: THREE.Vector3[], color: string, dashed = false) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.025, gapSize: 0.015 }) : new THREE.LineBasicMaterial({ color });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    group.add(line);
  }

  private draw(group: THREE.Group, node: Node, preview = false) {
    const root = new THREE.Vector3(...node.root);
    const tip = this.tip(node);
    this.marker(group, root, '#fbbf24', 0.017);
    this.marker(group, tip, preview ? '#22d3ee' : node.color);
    this.line(group, [root, tip], preview ? '#22d3ee' : '#94a3b8', true);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.panel.style.display = enabled ? '' : 'none';
    if (!enabled) this.cancelDraft();
  }

  cancelDraft() {
    this.draft = null;
    this.movingRoot = false;
    this.valid = false;
    this.apply.disabled = true;
    this.cancel.disabled = true;
    this.moveRoot.disabled = true;
    this.apply.textContent = 'Đặt điểm';
    this.ring.visible = false;
    this.disposeChildren(this.preview);
    this.status.textContent = '1. Bấm trên da đầu để chọn chân tóc.';
    this.updateClose();
    this.requestRender();
  }

  breakChain() {
    this.chain = crypto.randomUUID();
    this.cancelDraft();
  }

  private updateClose() {
    if (this.close) {
      this.close.disabled = !!this.draft || this.closed.has(this.chain) || [...this.nodes.values()].filter(node => node.chain === this.chain).length < 3;
    }
  }

  private changeSettings() {
    const value = this.lengthNumber.valueAsNumber;
    if (!Number.isFinite(value) || value < 0.05 || value > 1.5) return;
    document.getElementById('guidedNodeAngleValue')!.textContent = this.angle.value + '°';
    this.direction.disabled = Number(this.angle.value) === 90;
    this.panel.querySelectorAll<HTMLButtonElement>('[data-node-angle]').forEach(button => {
      const active = button.dataset.nodeAngle === this.angle.value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (!this.draft) return;
    this.draft.angle = Number(this.angle.value);
    this.draft.direction = Number(this.direction.value);
    this.draft.length = value;
    this.updatePreview();
  }

  private updatePreview() {
    this.disposeChildren(this.preview);
    if (!this.enabled || !this.draft) return;
    this.draw(this.preview, this.draft, true);
    const length = this.lengthNumber.valueAsNumber;
    const validLength = Number.isFinite(length) && length >= 0.05 && length <= 1.5;
    this.valid = validLength;
    this.apply.disabled = !this.valid;
    this.cancel.disabled = false;
    this.moveRoot.disabled = false;
    const editing = this.nodes.has(this.draft.id);
    this.apply.textContent = editing ? 'Cập nhật điểm' : 'Đặt điểm';
    this.status.textContent = !validLength
      ? 'Nhập độ dài từ 0.05 đến 1.50.'
      : '2. Chỉnh góc (0°-180°) và độ dài. 3. Bấm ' + (editing ? 'Cập nhật điểm' : 'Đặt điểm') + ' để giữ điểm mốc.';
    this.updateClose();
    this.requestRender();
  }

  private pick(event: PointerEvent) {
    const rect = this.options.canvas.getBoundingClientRect();
    let best: Node | null = null;
    let distance = 18;
    for (const node of this.nodes.values()) {
      const tip = this.tip(node);
      if (!isPointVisible(tip, this.options.camera, this.options.head())) continue;
      const screen = tip.project(this.options.camera);
      const d = Math.hypot((screen.x + 1) * rect.width / 2 - (event.clientX - rect.left), (1 - screen.y) * rect.height / 2 - (event.clientY - rect.top));
      if (d < distance) { best = node; distance = d; }
    }
    return best;
  }

  pointerDown(event: PointerEvent) {
    if (!this.enabled) return false;
    const selected = this.movingRoot ? null : this.pick(event);
    if (selected) {
      this.draft = structuredClone(selected);
      this.angle.value = String(selected.angle);
      this.direction.value = String(selected.direction);
      this.length.value = this.lengthNumber.value = String(selected.length);
      this.changeSettings();
    } else {
      const hit = this.options.scalpHit(event);
      if (!hit) {
        this.status.textContent = 'Chọn chân tóc trên bề mặt đầu. Dùng nút góc nhìn nếu vùng cần chọn đang ở phía sau.';
        return true;
      }
      this.draft = { id: this.draft?.id ?? crypto.randomUUID(), chain: this.draft?.chain ?? this.chain,
        root: hit.point.toArray(), normal: hit.normal.toArray(), angle: Number(this.angle.value), direction: Number(this.direction.value),
        length: Number(this.length.value), color: this.draft?.color ?? this.options.color() };
      this.movingRoot = false;
      this.lengthNumber.value = this.length.value;
      this.updatePreview();
    }
    this.ring.visible = false;
    this.requestRender();
    return true;
  }

  pointerMove(event: PointerEvent) {
    if (!this.enabled) return false;
    if (this.draft) return true;
    this.disposeChildren(this.preview);
    const selected = this.pick(event);
    if (selected) {
      this.ring.position.copy(this.tip(selected));
      this.ring.lookAt(this.options.camera.position);
      this.ring.visible = true;
      this.status.textContent = 'Bấm điểm đang sáng để chỉnh lại góc, độ dài hoặc chân tóc.';
    } else {
      this.ring.visible = false;
      const hit = this.options.scalpHit(event);
      if (hit) {
        const node: Node = { id: '', chain: this.chain, root: hit.point.toArray(), normal: hit.normal.toArray(), angle: Number(this.angle.value), direction: Number(this.direction.value), length: Number(this.length.value), color: this.options.color() };
        this.draw(this.preview, node, true);
        this.status.textContent = 'Bấm để giữ chân tóc tại chấm vàng; chấm xanh là vị trí điểm dự kiến.';
      } else this.status.textContent = 'Bấm trên da đầu để chọn chân tóc.';
    }
    this.requestRender();
    return true;
  }

  hideRing() {
    this.ring.visible = false;
  }

  viewChanged() {
    this.ring.visible = false;
    if (this.draft) {
      this.updatePreview();
    }
  }

  commit() {
    if (!this.enabled || !this.draft || !this.valid || this.apply.disabled) return;
    this.options.push({ kind: 'guided_nodes', operation: { type: 'put', node: structuredClone(this.draft) } });
    this.chain = crypto.randomUUID();
    this.cancelDraft();
    this.status.textContent = 'Đã lưu điểm mốc chân tóc. Tiếp tục click trên da đầu để đặt điểm mới.';
  }

  getNodesList(): Array<{
    id: string;
    root: THREE.Vector3;
    tip: THREE.Vector3;
    normal: THREE.Vector3;
    color: string;
    length: number;
    angle: number;
    direction: number;
  }> {
    return [...this.nodes.values()].map(node => ({
      id: node.id,
      root: new THREE.Vector3(...node.root),
      tip: this.tip(node),
      normal: new THREE.Vector3(...node.normal),
      color: node.color,
      length: node.length,
      angle: node.angle,
      direction: node.direction,
    }));
  }

  renderHistory(history: Array<{ kind: string; operation?: Operation }>, step: number) {
    this.nodes.clear();
    this.closed.clear();
    const visibleHistory = history.slice(0, step);
    const lastClear = lastClearIndex(visibleHistory, visibleHistory.length);
    for (const item of visibleHistory.slice(lastClear + 1)) {
      if (item.kind !== 'guided_nodes' || !item.operation) continue;
      if (item.operation.type === 'put') this.nodes.set(item.operation.node.id, structuredClone(item.operation.node));
      else this.closed.add(item.operation.chain);
    }
    this.disposeChildren(this.sceneGroup);
    const chains = new Map<string, Node[]>();
    for (const node of this.nodes.values()) {
      this.draw(this.sceneGroup, node);
      if (!chains.has(node.chain)) chains.set(node.chain, []);
      chains.get(node.chain)!.push(node);
    }
    for (const [id, nodes] of chains) {
      const points = nodes.map(node => this.tip(node));
      if (points.length > 1) this.line(this.sceneGroup, this.closed.has(id) ? [...points, points[0]] : points, nodes[0].color);
      if (this.closed.has(id) && points.length >= 3) {
        const positions: number[] = [];
        for (let i = 1; i < points.length - 1; i++) positions.push(...points[0].toArray(), ...points[i].toArray(), ...points[i + 1].toArray());
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: nodes[0].color, side: THREE.DoubleSide, opacity: 0.25, transparent: true, depthWrite: false }));
        mesh.visible = this.visibleFill;
        mesh.userData.isFillMesh = true;
        this.sceneGroup.add(mesh);
      }
    }
    this.updateClose();
    this.requestRender();
  }

  setFillVisible(visible: boolean) {
    this.visibleFill = visible;
    this.sceneGroup.traverse((obj: any) => {
      if (obj.userData?.isFillMesh) obj.visible = visible;
    });
    this.requestRender();
  }

  dispose() {
    this.listeners.forEach(remove => remove());
    this.disposeChildren(this.sceneGroup);
    this.disposeChildren(this.preview);
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.options.scene.remove(this.sceneGroup, this.preview, this.ring);
  }
}
