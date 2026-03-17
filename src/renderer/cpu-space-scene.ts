import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { VMState } from '../vm/types';
import {
  INSTRUCTION_SIZE,
  OPCODE_NAMES,
  OP_NOP, OP_HLT, OP_RET,
  OP_MOV_IMM, OP_MOV_REG,
  OP_LOAD_ABS, OP_STORE_ABS, OP_LOAD_IND, OP_STORE_IND,
  OP_ADD, OP_SUB, OP_AND, OP_OR, OP_XOR, OP_SHL, OP_SHR, OP_CMP,
  OP_INC, OP_DEC, OP_PUSH, OP_POP, OP_VCOPY,
  OP_JMP, OP_JZ, OP_JNZ, OP_JG, OP_JL, OP_CALL,
  OP_VSTORE, OP_VLOAD,
} from '../vm/opcodes';

// ── Helpers ───────────────────────────────────────────────────────────────────
function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function hex2(n: number): string { return n.toString(16).toUpperCase().padStart(2, '0'); }
function hex4(n: number): string { return n.toString(16).toUpperCase().padStart(4, '0'); }
function toBin(n: number): string {
  const b = n.toString(2).padStart(8, '0');
  return `${b.slice(0, 4)} ${b.slice(4)}`;
}

/** Disassemble one instruction at `addr` in `mem`. */
function disassemble(mem: Uint8Array, addr: number): string {
  const op = mem[addr] ?? 0;
  const mnem = OPCODE_NAMES[op];
  if (!mnem) return `DB  0x${hex2(op)}`;
  const b = (i: number) => (addr + i < mem.length ? mem[addr + i] : 0);
  const addr16 = (lo: number, hi: number) => `0x${hex4((hi << 8) | lo)}`;
  switch (op) {
    case OP_NOP: case OP_HLT: case OP_RET:
      return mnem;
    case OP_MOV_IMM:  return `MOV  R${b(1)}, ${b(2)}`;
    case OP_MOV_REG:  return `MOV  R${b(1)}, R${b(2)}`;
    case OP_LOAD_ABS: return `LOAD  R${b(1)}, [${addr16(b(2), b(3))}]`;
    case OP_STORE_ABS:return `STORE  [${addr16(b(2), b(3))}], R${b(1)}`;
    case OP_LOAD_IND: return `LOAD  R${b(1)}, [R${b(2)}]`;
    case OP_STORE_IND:return `STORE  [R${b(1)}], R${b(2)}`;
    case OP_ADD:  case OP_SUB:  case OP_AND:
    case OP_OR:   case OP_XOR:  case OP_SHL:
    case OP_SHR:  case OP_CMP:
      return `${mnem}  R${b(1)}, R${b(2)}`;
    case OP_INC:  case OP_DEC:
    case OP_PUSH: case OP_POP: case OP_VCOPY:
      return `${mnem}  R${b(1)}`;
    case OP_JMP: case OP_JZ:  case OP_JNZ:
    case OP_JG:  case OP_JL:  case OP_CALL:
      return `${mnem}  ${addr16(b(1), b(2))}`;
    case OP_VSTORE: return `VSTORE  [${addr16(b(2), b(3))}], R${b(1)}`;
    case OP_VLOAD:  return `VLOAD  R${b(1)}, [${addr16(b(2), b(3))}]`;
    default: return mnem;
  }
}

type ZoomStage = 'Overview' | 'Registers' | 'Memory';

const REG_NAMES = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'];

const C = {
  bg:      0x050a14,
  alu:     0x22c55e,
  aluEmit: 0x16a34a,
  mem:     0x38bdf8,
  memEmit: 0x0ea5e9,
  bus:     0x818cf8,
  star:    0xdde1f0,
};

// ── Showcase state ────────────────────────────────────────────────────────────
interface ShowcaseState {
  entity:    any;
  type:      'reg' | 'mem';
  index:     number;
  phase:     'fly-in' | 'orbit' | 'fly-out';
  orbitAngle: number;
  t:         number;          // 0→1 eased progress for fly-in / fly-out
  startCamPos:  { x: number; y: number; z: number };
  startLookAt:  { x: number; y: number; z: number };
}

const DEFAULT_CAM  = new Vector3(0, 2, 11);
const DEFAULT_LOOK = new Vector3(0, 0, 0);

export class CpuSpaceScene {
  private readonly renderer:  any;
  private readonly scene:     any;
  private readonly camera:    any;
  private readonly controls:  any;
  private readonly root = new Group();

  private readonly aluGroup = new Group();
  private readonly regGroup = new Group();
  private readonly memGroup = new Group();

  private readonly aluSlab:   any;
  private readonly regBars:   any[] = [];
  private readonly memCells:  any[] = [];

  // HTML overlays
  private readonly labelOverlay:   HTMLDivElement;
  private readonly tooltip:        HTMLDivElement;
  private readonly showcasePanel:  HTMLDivElement;
  private readonly regLabelEls:    HTMLSpanElement[] = [];

  // Raycasting
  private readonly raycaster    = new Raycaster();
  private readonly mouse        = new Vector2(Infinity, Infinity);
  private readonly mousePixel   = { x: 0, y: 0 };
  private readonly canvas:        HTMLCanvasElement;

  // Drag guard — don't trigger click after a drag
  private mouseDownAt = { x: 0, y: 0 };

  private readonly stageEl:  HTMLElement;
  private readonly detailEl: HTMLElement;
  private state:     VMState | null = null;
  private active     = true;
  private lastStage: ZoomStage | '' = '';
  private readonly tmpColor = new Color();

  private showcase: ShowcaseState | null = null;

  private static readonly Y_ALU = 2.4;
  private static readonly Y_REG = 0.0;
  private static readonly Y_MEM = -2.8;

  constructor(
    private readonly container: HTMLElement,
    canvas: HTMLCanvasElement,
    stageEl: HTMLElement,
    detailEl: HTMLElement,
  ) {
    this.stageEl  = stageEl;
    this.detailEl = detailEl;
    this.canvas   = canvas;
    container.style.position = 'relative';

    // ── Renderer ─────────────────────────────────────────────────────────
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    // ── Scene ────────────────────────────────────────────────────────────
    this.scene = new Scene();
    this.scene.background = new Color(C.bg);

    // ── Camera ───────────────────────────────────────────────────────────
    this.camera = new PerspectiveCamera(45, 1, 0.1, 200);
    this.camera.position.copy(DEFAULT_CAM);

    // ── Controls ─────────────────────────────────────────────────────────
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 20;
    this.controls.minPolarAngle = 0.1;
    this.controls.maxPolarAngle = Math.PI * 0.82;
    this.controls.target.copy(DEFAULT_LOOK);

    // ── Lighting ─────────────────────────────────────────────────────────
    this.scene.add(new HemisphereLight(0xffffff, 0x1e293b, 0.6));
    const key = new DirectionalLight(0xffffff, 2.5);
    key.position.set(6, 10, 8);
    this.scene.add(key);
    const fill = new DirectionalLight(0x7dd3fc, 0.7);
    fill.position.set(-8, 4, -4);
    this.scene.add(fill);
    const midGlow = new PointLight(C.bus, 1.4, 10, 1.5);
    midGlow.position.set(0, CpuSpaceScene.Y_REG, 0);
    this.root.add(midGlow);

    // ── 3D objects ────────────────────────────────────────────────────────
    this.aluSlab = this.buildAlu();
    this.buildRegisters();
    this.buildMemoryGrid();
    this.buildBusLines();
    this.scene.add(this.createStarfield());
    this.root.add(this.aluGroup, this.regGroup, this.memGroup);
    this.scene.add(this.root);

    // ── HTML overlay ──────────────────────────────────────────────────────
    this.labelOverlay = document.createElement('div');
    this.labelOverlay.style.cssText =
      'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    container.appendChild(this.labelOverlay);

    // Register labels
    for (let i = 0; i < 8; i++) {
      const el = document.createElement('span');
      el.textContent = REG_NAMES[i];
      el.style.cssText = [
        'position:absolute',
        'transform:translate(-50%,0)',
        'color:#fde68a',
        'font-family:ui-monospace,monospace',
        'font-size:10px',
        'font-weight:700',
        'letter-spacing:.05em',
        'text-shadow:0 0 8px #f59e0b,0 1px 3px rgba(0,0,0,.9)',
        'display:none',
      ].join(';');
      this.labelOverlay.appendChild(el);
      this.regLabelEls.push(el);
    }

    // Hover tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.style.cssText = [
      'position:absolute', 'display:none',
      'background:rgba(5,10,20,.96)',
      'border:1px solid #334155', 'border-radius:6px',
      'color:#e2e8f0', 'font-family:ui-monospace,monospace',
      'font-size:12px', 'line-height:1.65', 'padding:7px 11px',
      'pointer-events:none', 'white-space:pre',
      'box-shadow:0 4px 24px rgba(0,0,0,.7)', 'z-index:10',
    ].join(';');
    this.labelOverlay.appendChild(this.tooltip);

    // Showcase panel
    this.showcasePanel = document.createElement('div');
    this.showcasePanel.style.cssText = [
      'position:absolute', 'bottom:16px', 'left:16px',
      'display:none',
      'background:rgba(5,10,20,.96)',
      'border:1px solid #334155', 'border-radius:10px',
      'color:#e2e8f0', 'font-family:ui-monospace,monospace',
      'font-size:13px', 'line-height:1.7',
      'padding:14px 18px', 'min-width:240px',
      'box-shadow:0 8px 40px rgba(0,0,0,.8)',
      'pointer-events:auto', 'z-index:20',
    ].join(';');
    this.labelOverlay.appendChild(this.showcasePanel);

    // ── Mouse events ──────────────────────────────────────────────────────
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.mousePixel.x = e.clientX - rect.left;
      this.mousePixel.y = e.clientY - rect.top;
    });
    canvas.addEventListener('mouseleave', () => {
      this.mouse.set(Infinity, Infinity);
      this.tooltip.style.display = 'none';
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDownAt = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('click', (e) => {
      // Ignore if the mouse moved more than 5px (it was a drag)
      const dx = e.clientX - this.mouseDownAt.x;
      const dy = e.clientY - this.mouseDownAt.y;
      if (dx * dx + dy * dy > 25) return;
      this.handleClick(e);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.showcase) this.exitShowcase();
    });

    this.resize();
    this.animate();
  }

  setState(state: VMState): void { this.state = state; }

  setActive(active: boolean): void {
    this.active = active;
    if (!this.showcase) this.controls.enabled = active;
    this.resize();
  }

  resize(): void {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  // ── Click → showcase ──────────────────────────────────────────────────────
  private handleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx   = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const my   = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new Vector2(mx, my), this.camera);
    const hits = this.raycaster.intersectObjects([...this.regBars, ...this.memCells], false);

    if (hits.length > 0) {
      const hit = hits[0].object;
      this.enterShowcase(hit, hit.userData.type as 'reg' | 'mem', hit.userData.index as number);
    } else if (this.showcase) {
      this.exitShowcase();
    }
  }

  private enterShowcase(entity: any, type: 'reg' | 'mem', index: number): void {
    this.controls.enabled = false;
    this.tooltip.style.display = 'none';
    this.showcase = {
      entity, type, index,
      phase: 'fly-in',
      orbitAngle: 0,
      t: 0,
      startCamPos:  this.camera.position.clone(),
      startLookAt:  this.controls.target.clone(),
    };
    this.renderShowcasePanel();
    this.showcasePanel.style.display = 'block';
  }

  private exitShowcase(): void {
    if (!this.showcase) return;
    // Record where the camera is right now as the fly-out start
    this.showcase.phase = 'fly-out';
    this.showcase.t     = 0;
    this.showcase.startCamPos  = this.camera.position.clone();
    // startLookAt = entity world pos (where camera was looking during orbit)
    const entityPos = new Vector3();
    this.showcase.entity.getWorldPosition(entityPos);
    this.showcase.startLookAt = entityPos.clone();
    this.showcasePanel.style.display = 'none';
  }

  // ── ALU slab ─────────────────────────────────────────────────────────────
  private buildAlu(): any {
    const mat = new MeshStandardMaterial({
      color: C.alu, emissive: C.aluEmit, emissiveIntensity: 0.9,
      roughness: 0.25, metalness: 0.15,
    });
    const slab = new Mesh(new BoxGeometry(3.8, 0.3, 3.8), mat);
    slab.position.y = CpuSpaceScene.Y_ALU;
    this.aluGroup.add(slab);
    slab.add(new LineSegments(
      new EdgesGeometry(slab.geometry),
      new LineBasicMaterial({ color: 0x4ade80 }),
    ));
    const fuMat = new MeshStandardMaterial({
      color: 0x4ade80, emissive: C.aluEmit, emissiveIntensity: 1.2,
      roughness: 0.2, metalness: 0.1,
    });
    for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
      const fu = new Mesh(new BoxGeometry(1.0, 0.15, 1.0), fuMat);
      fu.position.set(x, 0.22, z);
      slab.add(fu);
    }
    const ringMat = new MeshStandardMaterial({
      color: 0x86efac, emissive: 0x22c55e, emissiveIntensity: 1.5,
      roughness: 0.1, metalness: 0.0,
    });
    const hw = 3.8 / 2 + 0.04;
    for (const { x, z, w, d } of [
      { x: 0, z: hw, w: 3.88, d: 0.08 }, { x: 0, z: -hw, w: 3.88, d: 0.08 },
      { x: hw, z: 0, w: 0.08, d: 3.8  }, { x: -hw, z: 0, w: 0.08, d: 3.8  },
    ]) {
      const r = new Mesh(new BoxGeometry(w, 0.08, d), ringMat);
      r.position.set(x, 0.19, z);
      slab.add(r);
    }
    return slab;
  }

  // ── Register towers ───────────────────────────────────────────────────────
  private buildRegisters(): void {
    const base = new Mesh(
      new BoxGeometry(7.0, 0.1, 1.6),
      new MeshStandardMaterial({
        color: 0x1c1917, emissive: 0x78350f, emissiveIntensity: 0.3,
        roughness: 0.6, metalness: 0.2,
      }),
    );
    base.position.y = CpuSpaceScene.Y_REG - 0.05;
    base.add(new LineSegments(new EdgesGeometry(base.geometry), new LineBasicMaterial({ color: 0xf59e0b })));
    this.regGroup.add(base);

    const geo = new BoxGeometry(0.5, 1, 0.5);
    for (let i = 0; i < 8; i++) {
      const hue = 35 + i * 3;
      const bar = new Mesh(geo, new MeshStandardMaterial({
        color: new Color(`hsl(${hue},95%,55%)`),
        emissive: new Color(`hsl(${hue},90%,40%)`),
        emissiveIntensity: 0.8, roughness: 0.2, metalness: 0.15,
      }));
      bar.position.set(-3.15 + i * 0.9, CpuSpaceScene.Y_REG + 0.5, 0);
      bar.userData = { type: 'reg', index: i };
      this.regBars.push(bar);
      this.regGroup.add(bar);
    }
  }

  // ── Memory grid ───────────────────────────────────────────────────────────
  private buildMemoryGrid(): void {
    const base = new Mesh(
      new BoxGeometry(5.5, 0.08, 5.5),
      new MeshStandardMaterial({
        color: 0x0c1a26, emissive: 0x0369a1, emissiveIntensity: 0.2,
        roughness: 0.7, metalness: 0.1,
      }),
    );
    base.position.y = CpuSpaceScene.Y_MEM - 0.14;
    this.memGroup.add(base);

    const geo = new BoxGeometry(0.28, 0.28, 0.28);
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const cell = new Mesh(geo, new MeshStandardMaterial({
          color: C.mem, emissive: C.memEmit, emissiveIntensity: 0.4,
          roughness: 0.3, metalness: 0.1,
        }));
        cell.position.set(-2.45 + col * 0.7, CpuSpaceScene.Y_MEM, -2.45 + row * 0.7);
        cell.userData = { type: 'mem', index: row * 8 + col };
        this.memCells.push(cell);
        this.memGroup.add(cell);
      }
    }
  }

  // ── Bus lines ─────────────────────────────────────────────────────────────
  private buildBusLines(): void {
    const mat = new LineBasicMaterial({ color: C.bus });
    for (const x of [-1.2, -0.4, 0.4, 1.2]) {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(
        new Float32Array([x, CpuSpaceScene.Y_ALU, 0, x, CpuSpaceScene.Y_REG + 1.5, 0]), 3));
      this.root.add(new LineSegments(geo, mat));
    }
    for (const x of [-0.9, 0, 0.9]) {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(
        new Float32Array([x, CpuSpaceScene.Y_REG - 0.1, 0, x, CpuSpaceScene.Y_MEM + 0.14, 0]), 3));
      this.root.add(new LineSegments(geo, mat));
    }
  }

  // ── Animation ─────────────────────────────────────────────────────────────
  private animate = (): void => {
    window.requestAnimationFrame(this.animate);
    const t = performance.now() * 0.001;

    if (this.showcase) {
      this.updateShowcaseCamera();
      if (this.showcase.phase === 'orbit') this.renderShowcasePanel();
    } else {
      this.controls.update();
    }

    this.root.position.y = Math.sin(t * 0.5) * 0.06;
    this.aluSlab.material.emissiveIntensity = 0.7 + Math.sin(t * 1.8) * 0.2;
    this.applyState(t);

    this.scene.updateMatrixWorld();
    this.updateLabels();
    if (!this.showcase) this.updateHover();
    this.updateHud();

    if (!this.active) return;
    this.renderer.render(this.scene, this.camera);
  };

  // ── Showcase camera ───────────────────────────────────────────────────────
  private updateShowcaseCamera(): void {
    const s = this.showcase!;
    const entityPos = new Vector3();
    s.entity.getWorldPosition(entityPos);

    const radius  = s.type === 'reg' ? 3.2 : 5.0;
    const yOffset = s.type === 'reg' ? 1.4 : 2.2;

    if (s.phase === 'fly-in') {
      s.t = Math.min(s.t + 0.018, 1);
      const ease = smoothstep(s.t);

      const targetCamPos = new Vector3(
        entityPos.x + radius,
        entityPos.y + yOffset,
        entityPos.z,
      );
      this.camera.position.lerpVectors(s.startCamPos, targetCamPos, ease);
      const lookAt = new Vector3().lerpVectors(s.startLookAt, entityPos, ease);
      this.camera.lookAt(lookAt);

      if (s.t >= 1) {
        s.phase = 'orbit';
        s.orbitAngle = 0;
      }

    } else if (s.phase === 'orbit') {
      s.orbitAngle += 0.007;
      this.camera.position.set(
        entityPos.x + radius * Math.cos(s.orbitAngle),
        entityPos.y + yOffset,
        entityPos.z + radius * Math.sin(s.orbitAngle),
      );
      this.camera.lookAt(entityPos);

    } else if (s.phase === 'fly-out') {
      s.t = Math.min(s.t + 0.022, 1);
      const ease = smoothstep(s.t);

      this.camera.position.lerpVectors(s.startCamPos, DEFAULT_CAM, ease);
      const lookAt = new Vector3().lerpVectors(s.startLookAt, DEFAULT_LOOK, ease);
      this.camera.lookAt(lookAt);

      if (s.t >= 1) {
        // Restore OrbitControls cleanly
        this.camera.position.copy(DEFAULT_CAM);
        this.controls.target.copy(DEFAULT_LOOK);
        this.controls.enabled = true;
        this.showcase = null;
      }
    }
  }

  // ── Showcase panel content ────────────────────────────────────────────────
  private renderShowcasePanel(): void {
    const s = this.showcase!;
    const regs = this.state?.registers;
    const mem  = this.state?.memory;

    let html = '';
    const escBtn =
      `<button onclick="this.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"` +
      ` style="float:right;background:none;border:1px solid #475569;border-radius:4px;` +
      `color:#94a3b8;font-family:inherit;font-size:11px;padding:2px 8px;cursor:pointer;margin-left:12px"` +
      ` title="Exit showcase (Esc)">Esc ✕</button>`;

    if (s.type === 'reg') {
      const vals = regs
        ? [regs.R0, regs.R1, regs.R2, regs.R3, regs.R4, regs.R5, regs.R6, regs.R7]
        : Array(8).fill(0);
      const val = vals[s.index] ?? 0;
      html = `
        <div style="margin-bottom:10px">
          ${escBtn}
          <span style="color:#fde68a;font-weight:700;font-size:15px">R${s.index}</span>
          <span style="color:#64748b;font-size:11px;margin-left:8px">General-purpose register</span>
        </div>
        <div style="color:#94a3b8;border-top:1px solid #1e293b;padding-top:8px">
          <div style="display:flex;justify-content:space-between;gap:24px">
            <span>Value</span>
            <span><span style="color:#86efac;font-weight:600">${val}</span>
                  <span style="color:#475569"> (0x${hex2(val)})</span></span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:24px">
            <span>Binary</span>
            <span style="color:#7dd3fc;letter-spacing:.08em">${toBin(val)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:24px">
            <span>PC</span>
            <span style="color:#c4b5fd">0x${hex4(regs?.PC ?? 0)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:24px">
            <span>SP</span>
            <span style="color:#c4b5fd">0x${hex4(regs?.SP ?? 0)}</span>
          </div>
        </div>
        <div style="color:#475569;font-size:10px;margin-top:8px">
          Click empty space or press Esc to exit
        </div>`;
    } else {
      const pc   = regs?.PC ?? 0;
      const addr = mem ? (pc + s.index) % mem.length : s.index;
      const val  = mem?.[addr] ?? 0;
      const offset = s.index;
      const instr  = mem ? disassemble(mem, addr) : '—';
      const size   = mem ? (INSTRUCTION_SIZE[mem[addr]] ?? 1) : 1;
      const rawBytes = mem
        ? Array.from(mem.slice(addr, addr + size)).map(b => `0x${hex2(b)}`).join(' ')
        : '—';

      html = `
        <div style="margin-bottom:10px">
          ${escBtn}
          <span style="color:#7dd3fc;font-weight:700;font-size:15px">0x${hex4(addr)}</span>
          <span style="color:#64748b;font-size:11px;margin-left:8px">Memory cell</span>
        </div>
        <div style="color:#94a3b8;border-top:1px solid #1e293b;padding-top:8px">
          <div style="display:flex;justify-content:space-between;gap:24px">
            <span>Value</span>
            <span><span style="color:#86efac;font-weight:600">${val}</span>
                  <span style="color:#475569"> (0x${hex2(val)})</span></span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:24px">
            <span>Binary</span>
            <span style="color:#7dd3fc;letter-spacing:.08em">${toBin(val)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:24px">
            <span>Offset</span>
            <span style="color:#94a3b8">+${offset} from PC</span>
          </div>
          <div style="border-top:1px solid #1e293b;margin-top:6px;padding-top:6px">
            <div style="display:flex;justify-content:space-between;gap:24px">
              <span>Instr</span>
              <span style="color:#fde68a;font-weight:600">${instr}</span>
            </div>
            <div style="display:flex;justify-content:space-between;gap:24px">
              <span>Bytes</span>
              <span style="color:#475569;font-size:11px">${rawBytes}</span>
            </div>
          </div>
        </div>
        <div style="color:#475569;font-size:10px;margin-top:8px">
          Click empty space or press Esc to exit
        </div>`;
    }

    this.showcasePanel.innerHTML = html;

    // The Esc button uses a keyboard event trick — wire it simpler via event delegation
    const btn = this.showcasePanel.querySelector('button');
    if (btn) btn.onclick = () => this.exitShowcase();
  }

  // ── Project world → screen ────────────────────────────────────────────────
  private projectToScreen(wx: number, wy: number, wz: number): { x: number; y: number; behind: boolean } {
    const v = new Vector3(wx, wy, wz).project(this.camera);
    const rect = this.container.getBoundingClientRect();
    return {
      x: (v.x * 0.5 + 0.5) * rect.width,
      y: (-v.y * 0.5 + 0.5) * rect.height,
      behind: v.z >= 1,
    };
  }

  // ── Register labels ───────────────────────────────────────────────────────
  private updateLabels(): void {
    const rootY      = this.root.position.y;
    const labelWorldY = CpuSpaceScene.Y_REG - 0.85 + rootY;
    const rect = this.container.getBoundingClientRect();

    this.regBars.forEach((bar, i) => {
      const el = this.regLabelEls[i];
      const { x, y, behind } = this.projectToScreen(bar.position.x, labelWorldY, 0);
      const inBounds = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
      el.style.display = (!behind && inBounds) ? 'block' : 'none';
      el.style.left = `${x}px`;
      el.style.top  = `${y}px`;
    });
  }

  // ── Hover tooltip ─────────────────────────────────────────────────────────
  private updateHover(): void {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObjects([...this.regBars, ...this.memCells], false);

    if (hits.length === 0) {
      this.tooltip.style.display = 'none';
      this.canvas.style.cursor = '';
      return;
    }

    this.canvas.style.cursor = 'pointer';
    const hit  = hits[0].object;
    const regs = this.state?.registers;
    const mem  = this.state?.memory;

    let html = '';
    if (hit.userData.type === 'reg') {
      const i    = hit.userData.index as number;
      const vals = regs
        ? [regs.R0, regs.R1, regs.R2, regs.R3, regs.R4, regs.R5, regs.R6, regs.R7]
        : Array(8).fill(0);
      const val = vals[i] ?? 0;
      html =
        `<span style="color:#fde68a;font-weight:bold">${REG_NAMES[i]}</span>\n` +
        `Value: <span style="color:#86efac">${val}</span>  <span style="color:#64748b">(0x${hex2(val)})</span>\n` +
        `<span style="color:#475569;font-size:11px">Click to inspect</span>`;
    } else if (hit.userData.type === 'mem') {
      const i    = hit.userData.index as number;
      const pc   = regs?.PC ?? 0;
      const addr = mem ? (pc + i) % mem.length : i;
      const val  = mem?.[addr] ?? 0;
      const instr = mem ? disassemble(mem, addr) : '—';
      html =
        `<span style="color:#7dd3fc;font-weight:bold">0x${hex4(addr)}</span>  <span style="color:#475569">(+${i} from PC)</span>\n` +
        `Value: <span style="color:#86efac">${val}</span>  <span style="color:#64748b">(0x${hex2(val)})</span>\n` +
        `Instr: <span style="color:#fde68a">${instr}</span>\n` +
        `<span style="color:#475569;font-size:11px">Click to inspect</span>`;
    }

    if (!html) return;
    this.tooltip.innerHTML = html;
    this.tooltip.style.display = 'block';
    const rect = this.container.getBoundingClientRect();
    const tw = this.tooltip.offsetWidth  || 200;
    const th = this.tooltip.offsetHeight || 64;
    this.tooltip.style.left = `${Math.min(this.mousePixel.x + 14, rect.width  - tw - 6)}px`;
    this.tooltip.style.top  = `${Math.max(this.mousePixel.y - th - 8, 4)}px`;
  }

  // ── State-driven visuals ──────────────────────────────────────────────────
  private applyState(t: number): void {
    const regs = this.state?.registers;
    const mem  = this.state?.memory;
    const pc   = regs?.PC ?? 0;
    const regValues = regs
      ? [regs.R0, regs.R1, regs.R2, regs.R3, regs.R4, regs.R5, regs.R6, regs.R7]
      : Array.from({ length: 8 }, (_, i) => Math.round((Math.sin(t * 0.4 + i * 0.9) + 1) * 127));

    this.regBars.forEach((bar, i) => {
      const norm = (regValues[i] ?? 0) / 255;
      const h = 0.8 + norm * 2.2;
      bar.scale.y = h;
      bar.position.y = CpuSpaceScene.Y_REG + h / 2;
      bar.material.emissiveIntensity = 0.5 + norm * 1.4;
    });

    this.memCells.forEach((cell, i) => {
      const byte = mem ? mem[(pc + i) % mem.length] : (i * 23 + Math.floor(t * 40)) & 0xFF;
      const norm = byte / 255;
      this.tmpColor.setHSL(0.56 - norm * 0.08, 0.85, 0.28 + norm * 0.38);
      cell.material.color.copy(this.tmpColor);
      cell.material.emissive.copy(this.tmpColor);
      cell.material.emissiveIntensity = 0.15 + norm * 1.6;
      cell.scale.y = 0.4 + norm * 1.8;
      cell.position.y = CpuSpaceScene.Y_MEM + (cell.scale.y * 0.28) / 2;
    });
  }

  private updateHud(): void {
    if (this.showcase) return; // HUD is quiet during showcase
    const dist  = this.camera.position.distanceTo(this.controls.target);
    const stage: ZoomStage = dist > 12 ? 'Overview' : dist > 7 ? 'Registers' : 'Memory';
    if (stage === this.lastStage) return;
    this.stageEl.textContent = stage;
    this.detailEl.textContent =
      stage === 'Overview'
        ? 'Three-layer CPU: ALU (green), register file (amber), memory grid (blue). Click any element to inspect.'
        : stage === 'Registers'
          ? 'Hover a register bar to preview its value. Click to enter showcase view.'
          : 'Hover a memory cell to preview its value and instruction. Click to inspect.';
    this.lastStage = stage;
  }

  // ── Starfield ─────────────────────────────────────────────────────────────
  private createStarfield(): any {
    const count = 900;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 30 + Math.random() * 50;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      pos[i * 3]     = r * Math.sin(p) * Math.cos(t);
      pos[i * 3 + 1] = r * Math.cos(p);
      pos[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    return new Points(geo, new PointsMaterial({ color: C.star, size: 0.12, sizeAttenuation: true }));
  }
}
