// three.js WebGPU görüntüleyici (WebGPU yoksa three kendiliğinden WebGL2'ye düşer).
// Seçili kalemin elemanları vurgulanır, diğerleri soluklaşır; tıklanan elemanın kalemleri gösterilir;
// "Ölç" kipinde iki nokta arası 3B / yatay / düşey mesafe (köşelere yapışarak).
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LAYERS3, type El3, type Layer3, type Model3 } from '@shared/model3d';
import { measure, nearestVertex, type V3 } from './geometry';
import { geometryOf } from './sceneGeometry';
import { useUnderlay } from './useModel3d';

const COLORS: Record<Layer3, number> = {
  döşeme: 0xc9ccc7,
  mahal: 0xe9e4d6,
  duvar: 0xb4b9bf,
  kolon: 0x8a929c,
  tavan: 0xdde5ee,
  çatı: 0xa9b3a4,
  cephe: 0xc4cbd3,
  donatı: 0x6941c6,
};
/** Saçak alnı alüminyum bantları: bantlar ayrı okunsun diye bant başına ton (görünüşteki gerçek renk değil). */
const EAVE_BANDS: Record<string, number> = { 'C.5': 0xc3c8cd, 'C.6': 0x9aa2aa, 'C.7': 0xc3c8cd, 'C.8': 0x6f777e, 'C.17': 0x5c646b, 'D.13': 0xb4bbc2, frame: 0x4a5157 };
const HIGHLIGHT = 0xe8590c;
const PICKED = 0x1d4e89;
const fmt = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Meas = { a: V3; b: V3; line: THREE.Line; label: HTMLDivElement };
type Mode = 'seç' | 'ölç';
type UlPrefs = { plans: Record<string, boolean>; off: string[] };
const UL_KEY = 'v3-altlik';
const UL_PLANS = [
  { key: 'zemin', label: 'Zemin kat planı' },
  { key: 'ara', label: 'Ara kat planı' },
];
const readUl = (): UlPrefs => {
  try {
    const v = JSON.parse(localStorage.getItem(UL_KEY) ?? 'null') as UlPrefs | null;
    if (v?.plans && Array.isArray(v.off)) return v;
  } catch {
    /* tarayıcı depolaması yok */
  }
  return { plans: {}, off: [] };
};

export default function Viewer3D({
  model,
  highlight,
  onSelectPoz,
  onClearSelection,
  onPickElement,
  focusIds,
  itemName,
}: {
  model: Model3;
  highlight: Set<string> | null;
  /** Bilgi kartındaki kalem bağlantısı: kalem + tıklanan elemanın o kalemdeki satırı. */
  onSelectPoz: (poz: string, line?: string | number) => void;
  /** Modelde elemana tıklandı (boşluğa tıklanınca null). Kalem seçimi değişecekse true döner (kamera yerinde kalır). */
  onPickElement?: (el: El3 | null) => boolean;
  /** Hesap detayında tıklanan satırın elemanları: mavi gösterilir ve görünüme sığdırılır. */
  focusIds?: Set<string> | null;
  /** Kalem seçimini kaldırır (bütün model görünür). */
  onClearSelection: () => void;
  itemName: (poz: string) => string | undefined;
}) {
  const clearSel = useRef(onClearSelection);
  clearSel.current = onClearSelection;
  const pickCb = useRef(onPickElement);
  pickCb.current = onPickElement;
  const keepView = useRef(false); // seçim modelden değiştiyse kamera ve seçili eleman korunur
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const api = useRef<{
    meshes: THREE.Mesh[];
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    scene: THREE.Scene;
    fit: (objs: THREE.Object3D[]) => void;
    applyStyle: () => void;
    setWalk: (on: boolean) => void;
    shot: () => void;
  } | null>(null);
  const [walk, setWalk] = useState(false);
  const [layers, setLayers] = useState<Record<string, boolean>>(() => Object.fromEntries(LAYERS3.map((l) => [l.key, l.visible])));
  const [mode, setMode] = useState<Mode>('seç');
  const [picked, setPicked] = useState<El3 | null>(null);
  const [backend, setBackend] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [ul, setUl] = useState<UlPrefs>(readUl);
  const ulOn = Object.values(ul.plans).some(Boolean);
  const { underlay, error: ulError } = useUnderlay(ulOn);
  const ulObjs = useRef<{ plan: string; layer: string; obj: THREE.Object3D }[]>([]);
  const state = useRef({ layers, highlight, mode, picked: null as El3 | null, focusIds: null as Set<string> | null | undefined, walk: false });
  state.current.layers = layers;
  state.current.highlight = highlight;
  state.current.mode = mode;
  state.current.picked = picked;
  state.current.focusIds = focusIds;
  const meas = useRef<{ list: Meas[]; start: V3 | null; preview: THREE.Line | null; snap: THREE.Mesh | null }>({ list: [], start: null, preview: null, snap: null });

  // --- sahne (bir kez)
  useEffect(() => {
    const el = host.current!;
    let disposed = false;
    const renderer = new THREE.WebGPURenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf6f7f5);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 6000);
    camera.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f94, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-80, -120, 160);
    scene.add(sun);
    const grid = new THREE.GridHelper(400, 80, 0xb9c0c6, 0xdce0e3);
    grid.rotateX(Math.PI / 2);
    grid.position.z = -0.32;
    scene.add(grid);

    const mats = new Map<string, THREE.Material>();
    const baseMat = (e: El3) => {
      const frame = e.kind === 'prism' && (e.items.includes('C.1') || e.items.includes('C.14')); // alüminyum doğrama dikme / kayıt
      const glass = !frame && e.items.includes('C.1');
      const stone = e.items.includes('C.10');
      const alu = frame ? 'frame' : e.items.find((p) => p in EAVE_BANDS);
      const k = glass ? 'glass' : stone ? 'stone' : alu ?? e.layer;
      if (!mats.has(k))
        mats.set(
          k,
          new THREE.MeshStandardMaterial({
            color: glass ? 0x8fb8d8 : stone ? 0xd6c6a3 : alu ? EAVE_BANDS[alu] : COLORS[e.layer],
            side: THREE.DoubleSide,
            transparent: glass || e.layer === 'tavan',
            opacity: glass ? 0.55 : e.layer === 'tavan' ? 0.85 : 1,
            roughness: 0.85,
          }),
        );
      return mats.get(k)!;
    };
    const hiMat = new THREE.MeshStandardMaterial({ color: HIGHLIGHT, side: THREE.DoubleSide, roughness: 0.6 });
    const pickMat = new THREE.MeshStandardMaterial({ color: PICKED, side: THREE.DoubleSide, roughness: 0.6 });
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0x9aa3ad, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });

    const meshes: THREE.Mesh[] = [];
    for (const e of model.elements) {
      const g = geometryOf(e);
      if (!g) continue;
      const m = new THREE.Mesh(g, baseMat(e));
      m.userData = { el: e, base: m.material };
      scene.add(m);
      meshes.push(m);
    }

    const box = new THREE.Box3();
    const fit = (objs: THREE.Object3D[]) => {
      if (state.current.walk) walkMode(false); // sığdırma yörünge görünümüdür
      box.makeEmpty();
      for (const o of objs) box.expandByObject(o);
      if (box.isEmpty()) return;
      const c = box.getCenter(new THREE.Vector3());
      const r = Math.max(4, box.getSize(new THREE.Vector3()).length() / 2);
      const dist = r / Math.sin((camera.fov * Math.PI) / 360);
      const dir = camera.position.clone().sub(controls.target).normalize();
      if (!Number.isFinite(dir.x) || dir.lengthSq() < 0.5) dir.set(-0.45, -0.65, 0.6).normalize();
      controls.target.copy(c);
      camera.position.copy(c).addScaledVector(dir, dist * 1.05);
      camera.near = Math.max(0.05, dist / 500);
      camera.updateProjectionMatrix();
      controls.update();
    };

    const applyStyle = () => {
      const { layers: L, highlight: H, picked: P, focusIds: F } = state.current;
      for (const m of meshes) {
        const e = m.userData.el as El3;
        const hit = !!H && e.items.some((p) => H.has(p));
        if ((P && P.id === e.id) || F?.has(e.id)) {
          m.material = pickMat;
          m.visible = true;
        } else if (H && H.size) {
          m.material = hit ? hiMat : ghostMat;
          m.visible = hit || L[e.layer];
        } else {
          m.material = m.userData.base;
          m.visible = L[e.layer];
        }
        m.userData.ghost = m.material === ghostMat;
      }
    };

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.screenSpacePanning = true;

    // --- gezme: göz yüksekliğinde birinci şahıs; sürükle = bak, tuşlar = yürü (duvarlardan geçilir)
    const keys = new Set<string>();
    const look = { yaw: 0, pitch: 0 };
    const lookDir = () => new THREE.Vector3(Math.cos(look.pitch) * Math.cos(look.yaw), Math.cos(look.pitch) * Math.sin(look.yaw), Math.sin(look.pitch));
    const aim = () => camera.lookAt(camera.position.clone().add(lookDir()));
    const walkMode = (on: boolean) => {
      if (on === state.current.walk) return;
      state.current.walk = on;
      setWalk(on);
      keys.clear();
      if (on) {
        // yörünge merkezinin üstünde, zemin kat göz yüksekliğinde (±0,00 + 1,60), aynı yöne bakarak başla
        const d = controls.target.clone().sub(camera.position);
        look.yaw = Math.atan2(d.y, d.x);
        look.pitch = 0;
        camera.position.set(controls.target.x, controls.target.y, 1.6);
        camera.near = 0.1;
        camera.updateProjectionMatrix();
        controls.enabled = false;
        aim();
      } else {
        controls.target.copy(camera.position).addScaledVector(lookDir(), 10);
        controls.enabled = true;
        controls.update();
      }
      renderer.domElement.style.cursor = on ? 'grab' : '';
    };
    const held = (...codes: string[]) => (codes.some((c) => keys.has(c)) ? 1 : 0);
    const walkStep = (dt: number) => {
      const f = held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown');
      const s = held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft');
      const u = held('KeyE', 'PageUp') - held('KeyQ', 'PageDown');
      if (!f && !s && !u) return;
      const step = (held('ShiftLeft', 'ShiftRight') ? 12 : 3) * dt; // m/s
      const [fx, fy] = [Math.cos(look.yaw), Math.sin(look.yaw)]; // yatay ileri; sağ = (fy, −fx)
      camera.position.x += (fx * f + fy * s) * step;
      camera.position.y += (fy * f - fx * s) * step;
      camera.position.z += u * step;
      aim();
    };
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]');
    const onKeyDown = (e: KeyboardEvent) => {
      if (!state.current.walk || typing(e)) return;
      keys.add(e.code);
      if (/^(Arrow|Page)/.test(e.code)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onBlur = () => keys.clear();
    const onWheel = (e: WheelEvent) => {
      if (!state.current.walk) return;
      e.preventDefault();
      camera.position.x -= Math.cos(look.yaw) * e.deltaY * 0.01;
      camera.position.y -= Math.sin(look.yaw) * e.deltaY * 0.01;
      aim();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    // --- görüntü al: bakılan açıdan PNG (çizim ile okuma aynı adımda; WebGPU/WebGL tamponu sonra boşalır)
    const shot = () => {
      renderer.render(scene, camera);
      renderer.domElement.toBlob((b) => {
        if (!b) return setError('Görüntü alınamadı.');
        const p = (n: number) => String(n).padStart(2, '0');
        const t = new Date();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `MSK-3B-${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }, 'image/png');
    };
    api.current = { meshes, camera, controls, scene, fit, applyStyle, setWalk: walkMode, shot };

    // --- tıklama / ölçüm
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hitAt = (ev: PointerEvent): { p: V3; e: El3 } | null => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(meshes.filter((m) => m.visible && !m.userData.ghost), false);
      const h = hits[0];
      if (!h) return null;
      let p: V3 = [h.point.x, h.point.y, h.point.z];
      if (h.face) {
        const pos = (h.object as THREE.Mesh).geometry.getAttribute('position');
        const vs: V3[] = [h.face.a, h.face.b, h.face.c].map((i) => [pos.getX(i), pos.getY(i), pos.getZ(i)]);
        const tol = Math.min(1, Math.max(0.05, h.distance * 0.015));
        p = nearestVertex(p, vs, tol) ?? p;
      }
      return { p, e: h.object.userData.el as El3 };
    };
    const lineMat = new THREE.LineBasicMaterial({ color: HIGHLIGHT, depthTest: false });
    const mkLine = (a: V3, b: V3) => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
      const l = new THREE.Line(g, lineMat);
      l.renderOrder = 10;
      scene.add(l);
      return l;
    };
    const snap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color: HIGHLIGHT, depthTest: false }));
    snap.renderOrder = 11;
    snap.visible = false;
    scene.add(snap);
    meas.current.snap = snap;

    let downAt: [number, number] | null = null;
    const onDown = (ev: PointerEvent) => (downAt = [ev.clientX, ev.clientY]);
    const onUp = (ev: PointerEvent) => {
      if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) return;
      downAt = null;
      const h = hitAt(ev);
      if (state.current.mode === 'seç') {
        setPicked(h ? h.e : null);
        if (pickCb.current?.(h ? h.e : null)) keepView.current = true;
        return;
      }
      if (!h) return;
      const M = meas.current;
      if (!M.start) {
        M.start = h.p;
        setHint('İkinci noktayı tıklayın · Esc: iptal');
        return;
      }
      const a = M.start;
      const b = h.p;
      M.start = null;
      if (M.preview) (scene.remove(M.preview), (M.preview = null));
      const label = document.createElement('div');
      label.className = 'v3-label';
      const m = measure(a, b);
      label.innerHTML = `<strong>${fmt.format(m.d)} m</strong><span>yatay ${fmt.format(m.horizontal)} · düşey ${fmt.format(m.dz)}</span>`;
      overlay.current?.appendChild(label);
      M.list.push({ a, b, line: mkLine(a, b), label });
      setHint('Birinci noktayı tıklayın');
    };
    const onMove = (ev: PointerEvent) => {
      if (state.current.walk && ev.buttons & 1) {
        look.yaw -= ev.movementX * 0.004;
        look.pitch = Math.max(-1.5, Math.min(1.5, look.pitch - ev.movementY * 0.004));
        aim();
      }
      if (state.current.mode !== 'ölç') return;
      const h = hitAt(ev);
      snap.visible = !!h;
      if (h) snap.position.set(...h.p);
      const M = meas.current;
      if (M.start && h) {
        if (M.preview) scene.remove(M.preview);
        M.preview = mkLine(M.start, h.p);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointermove', onMove);

    const v = new THREE.Vector3();
    const place = (p: V3, label: HTMLDivElement, w: number, h: number) => {
      v.set(...p).project(camera);
      const behind = v.z > 1;
      label.style.display = behind ? 'none' : '';
      label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -120%)`;
    };
    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);

    renderer
      .init()
      .then(() => {
        if (disposed) return;
        el.prepend(renderer.domElement);
        setBackend((renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL 2');
        resize();
        ro.observe(el);
        applyStyle();
        fit(meshes);
        let last = performance.now();
        renderer.setAnimationLoop(() => {
          const now = performance.now();
          if (state.current.walk) walkStep(Math.min(0.1, (now - last) / 1000));
          else controls.update();
          last = now;
          const w = el.clientWidth;
          const h = el.clientHeight;
          for (const m of meas.current.list) place([(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2, (m.a[2] + m.b[2]) / 2], m.label, w, h);
          renderer.render(scene, camera);
        });
      })
      .catch((e: unknown) => setError(`3B görüntüleyici başlatılamadı: ${(e as Error).message}`));

    return () => {
      disposed = true;
      ro.disconnect();
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      state.current.walk = false;
      setWalk(false);
      controls.dispose();
      for (const m of meshes) m.geometry.dispose();
      for (const m of meas.current.list) m.label.remove();
      meas.current = { list: [], start: null, preview: null, snap: null };
      renderer.domElement.remove();
      renderer.dispose();
      api.current = null;
    };
  }, [model]);

  // --- plan altlığı: katman × kat başına bir çizgi nesnesi (tıklanmaz, sığdırmaya girmez)
  useEffect(() => {
    const a = api.current;
    if (!a || !underlay) return;
    const mat = new THREE.LineBasicMaterial({ color: 0x3d4650, transparent: true, opacity: 0.55 });
    const objs: typeof ulObjs.current = [];
    // yazı: tuval dokulu düzlem, plan üzerinde yatay; sol alt köşe = ekleme noktası (taban çizgisi)
    const PX = 64;
    const textMesh = (x: number, y: number, h: number, s: string, z: number, centered: boolean) => {
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d')!;
      const font = `${PX}px sans-serif`;
      ctx.font = font;
      c.width = Math.ceil(ctx.measureText(s).width) + 4;
      c.height = Math.round(PX * 1.25);
      ctx.font = font;
      ctx.fillStyle = '#1f262d';
      ctx.fillText(s, 2, PX);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const k = h / PX;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(c.width * k, c.height * k), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      // ortalı (aks balonu): büyük harf ortası tuvalin ortasına denk gelir
      if (centered) m.position.set(x, y, z);
      else m.position.set(x + (c.width * k) / 2, y - 0.25 * h + (c.height * k) / 2, z);
      return m;
    };
    for (const L of underlay.layers)
      for (const plan of underlay.plans) {
        const lines = L.lines[plan.key] ?? [];
        const texts = L.texts?.[plan.key] ?? [];
        if (!lines.length && !texts.length) continue;
        const obj = new THREE.Group();
        if (lines.length) {
          const pos: number[] = [];
          for (const l of lines)
            for (let i = 2; i < l.length; i += 2) pos.push(l[i - 2] / 100, l[i - 1] / 100, plan.z, l[i] / 100, l[i + 1] / 100, plan.z);
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          obj.add(new THREE.LineSegments(g, mat));
        }
        for (const [x, y, h, s, c] of texts) obj.add(textMesh(x / 100, y / 100, h / 100, s, plan.z + 0.005, !!c));
        obj.visible = false;
        a.scene.add(obj);
        objs.push({ plan: plan.key, layer: L.name, obj });
      }
    ulObjs.current = objs;
    return () => {
      for (const o of objs) {
        a.scene.remove(o.obj);
        o.obj.traverse((c) => {
          if (c instanceof THREE.Mesh) (c.geometry.dispose(), c.material.map?.dispose(), c.material.dispose());
          else if (c instanceof THREE.LineSegments) c.geometry.dispose();
        });
      }
      mat.dispose();
      ulObjs.current = [];
    };
  }, [model, underlay]);
  useEffect(() => {
    const off = new Set(ul.off);
    for (const o of ulObjs.current) o.obj.visible = !!ul.plans[o.plan] && !off.has(o.layer);
    try {
      localStorage.setItem(UL_KEY, JSON.stringify(ul));
    } catch {
      /* tarayıcı depolaması yok */
    }
  }, [ul, underlay, model]);

  // --- vurgulama, katmanlar, seçili eleman
  useEffect(() => {
    api.current?.applyStyle();
  }, [layers, highlight, picked, focusIds]);
  useEffect(() => {
    const a = api.current;
    if (!a || !focusIds?.size) return;
    setPicked(null);
    a.fit(a.meshes.filter((m) => focusIds.has((m.userData.el as El3).id)));
  }, [focusIds]);
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const hits = highlight?.size ? a.meshes.filter((m) => (m.userData.el as El3).items.some((p) => highlight.has(p))) : [];
    if (keepView.current) {
      keepView.current = false;
      return;
    }
    if (hits.length) a.fit(hits);
    else if (!highlight?.size) a.fit(a.meshes.filter((m) => m.visible)); // seçim kalktı: bütün model
    setPicked(null);
  }, [highlight]);

  // --- ölçüm kipi ve klavye
  const clearMeas = () => {
    const a = api.current;
    const M = meas.current;
    for (const m of M.list) (a?.scene.remove(m.line), m.label.remove());
    if (M.preview) a?.scene.remove(M.preview);
    M.list = [];
    M.start = null;
    M.preview = null;
  };
  useEffect(() => {
    const M = meas.current;
    if (mode === 'ölç') setHint('Birinci noktayı tıklayın · köşelere yapışır');
    else {
      setHint('');
      M.start = null;
      if (M.preview) (api.current?.scene.remove(M.preview), (M.preview = null));
      if (M.snap) M.snap.visible = false;
    }
  }, [mode]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'Escape') {
        if (state.current.walk) api.current?.setWalk(false);
        else if (meas.current.start) {
          meas.current.start = null;
          if (meas.current.preview) (api.current?.scene.remove(meas.current.preview), (meas.current.preview = null));
          setHint('Birinci noktayı tıklayın');
        } else if (state.current.mode === 'ölç') setMode('seç');
        else if (state.current.picked) setPicked(null);
        else if (state.current.highlight?.size) clearSel.current();
      } else if (e.key === 'm' || e.key === 'M') setMode((m) => (m === 'ölç' ? 'seç' : 'ölç'));
      else if (e.key === 'g' || e.key === 'G') api.current?.setWalk(!state.current.walk);
      else if (e.key === 'f' || e.key === 'F') {
        const a = api.current;
        if (a) a.fit(a.meshes.filter((m) => m.visible && !m.userData.ghost));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const noMatch = !!highlight?.size && !model.elements.some((e) => e.items.some((p) => highlight.has(p)));

  return (
    <div className="v3" ref={host}>
      <div className="v3-overlay" ref={overlay} aria-hidden="true" />
      <div className="v3-tools" role="toolbar" aria-label="3B araçları">
        <button type="button" className={mode === 'seç' ? 'on' : ''} aria-pressed={mode === 'seç'} onClick={() => setMode('seç')}>
          Seç
        </button>
        <button type="button" className={mode === 'ölç' ? 'on' : ''} aria-pressed={mode === 'ölç'} onClick={() => setMode('ölç')} title="Kısayol: M">
          Ölç
        </button>
        <button type="button" onClick={() => api.current?.fit(api.current.meshes.filter((m) => m.visible && !m.userData.ghost))} title="Kısayol: F">
          Sığdır
        </button>
        <button type="button" onClick={clearMeas}>
          Ölçümleri sil
        </button>
        <button type="button" className={walk ? 'on' : ''} aria-pressed={walk} onClick={() => api.current?.setWalk(!walk)} title="Göz yüksekliğinde gez · Kısayol: G">
          Gez
        </button>
        <button type="button" onClick={() => api.current?.shot()} title="Bakılan açıdan PNG indirir">
          Görüntü al
        </button>
        {!!highlight?.size && (
          <button type="button" className="v3-clear" onClick={onClearSelection} title="Kısayol: Esc">
            Seçimi kaldır ×
          </button>
        )}
        {backend && <span className="v3-badge">{backend}</span>}
      </div>
      <div className="v3-side">
        <fieldset className="v3-layers">
          <legend>Katmanlar</legend>
          {LAYERS3.map((l) => (
            <label key={l.key} className="check">
              <input type="checkbox" checked={layers[l.key]} onChange={(e) => setLayers((s) => ({ ...s, [l.key]: e.target.checked }))} />
              {l.label}
            </label>
          ))}
        </fieldset>
        <fieldset className="v3-layers">
          <legend>Altlık (01-02-100)</legend>
          {UL_PLANS.map((p) => (
            <label key={p.key} className="check">
              <input type="checkbox" checked={!!ul.plans[p.key]} onChange={(e) => setUl((s) => ({ ...s, plans: { ...s.plans, [p.key]: e.target.checked } }))} />
              {p.label}
            </label>
          ))}
          {underlay && (
            <details className="v3-ul-layers">
              <summary>
                Çizim katmanları ({underlay.layers.filter((l) => !ul.off.includes(l.name)).length}/{underlay.layers.length})
              </summary>
              <div className="v3-ul-all">
                <button type="button" onClick={() => setUl((s) => ({ ...s, off: [] }))}>
                  Tümü
                </button>
                <button type="button" onClick={() => setUl((s) => ({ ...s, off: underlay.layers.map((l) => l.name) }))}>
                  Hiçbiri
                </button>
              </div>
              <div className="v3-ul-list">
                {underlay.layers.map((l) => (
                  <label key={l.name} className="check" title={l.name}>
                    <input
                      type="checkbox"
                      checked={!ul.off.includes(l.name)}
                      onChange={(e) => setUl((s) => ({ ...s, off: e.target.checked ? s.off.filter((n) => n !== l.name) : [...s.off, l.name] }))}
                    />
                    {l.name}
                  </label>
                ))}
              </div>
            </details>
          )}
          {ulOn && !underlay && !ulError && <span className="v3-ul-note">yükleniyor…</span>}
          {ulError && <span className="v3-ul-note warn">{ulError}</span>}
        </fieldset>
      </div>
      {(walk || hint) && (
        <p className="v3-hint">{[walk && 'Gezme · sürükle: bak · W A S D / oklar: yürü · Q / E: alçal / yüksel · Shift: hızlı · tekerlek: ileri / geri · Esc: çık', hint].filter(Boolean).join(' | ')}</p>
      )}
      {noMatch && <p className="v3-hint warn">Bu kalemin 3B karşılığı yok (görünüş ya da detaydan ölçüldü).</p>}
      {error && <p className="v3-hint warn">{error}</p>}
      {picked && (
        <div className="v3-info">
          <p className="v3-info-title">
            <span className="v3-id">{picked.id}</span> {picked.label}
          </p>
          <p className="v3-info-sub">
            Kot {fmt.format(picked.z0)}
            {picked.z1 !== picked.z0 ? ` → ${fmt.format(picked.z1)}` : ''} m
          </p>
          <ul>
            {picked.items.map((p) => (
              <li key={p}>
                <button type="button" onClick={() => onSelectPoz(p, picked.lines?.[p])}>
                  <span className="poz">{p}</span> {itemName(p) ?? ''}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="v3-close" aria-label="Kapat" onClick={() => setPicked(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
