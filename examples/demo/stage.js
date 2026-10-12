// @ts-check
// Plain imperative three.js behind a narrow API — no signals in here.
// The store pushes data in through the setters; stats flow out through one
// callback. This boundary is invariant 4: never proxy foreign objects.
import * as THREE from 'three';

/** @typedef {{ fps: number, rotationX: number, rotationY: number, triangles: number }} StageStats */
/**
 * The narrow API: the only way in or out of the scene.
 * @typedef {object} Stage
 * @property {(name: string) => void} setShape  'knot' | 'box' | 'sphere'
 * @property {(s: number) => void} setScale
 * @property {(x: number, y: number) => void} setSpin  radians per second
 * @property {(on: boolean) => void} setWireframe
 * @property {(hex: string) => void} setColor
 * @property {(hex: string) => void} setBackground
 * @property {(on: boolean) => void} setRunning
 * @property {(fn: (s: StageStats) => void) => void} onStats
 * @property {() => void} dispose
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Stage}
 */
export function createStage(canvas) {
  /** @type {THREE.WebGLRenderer} */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (err) {
    // No WebGL (headless / remote session): the dashboard still runs, the
    // stage becomes inert. The narrow API is what makes this stub possible.
    console.warn('stage: WebGL unavailable, running without 3D —', err instanceof Error ? err.message : err);
    canvas.remove();
    const noop = () => {};
    return { setShape: noop, setScale: noop, setSpin: noop, setWireframe: noop, setColor: noop, setBackground: noop, setRunning: noop, onStats: noop, dispose: noop };
  }
  const scene = new THREE.Scene();
  const background = new THREE.Color(0x111111);
  scene.background = background;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 6);

  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(3, 4, 5);
  scene.add(key, new THREE.AmbientLight(0x888888));

  const material = new THREE.MeshStandardMaterial({ color: 0x8fc7ff });
  /** @type {Record<string, () => THREE.BufferGeometry>} */
  const geometries = {
    knot: () => new THREE.TorusKnotGeometry(1, 0.32, 128, 16),
    box: () => new THREE.BoxGeometry(1.8, 1.8, 1.8),
    sphere: () => new THREE.SphereGeometry(1.3, 48, 24),
  };

  /** @type {THREE.Mesh | null} */
  let mesh = null;
  let scale = 1;
  const spin = { x: 0, y: 0 };
  /** @type {((s: StageStats) => void) | null} */
  let statsListener = null;

  // sized by its container (the panel grid, the drag handles), not the window
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return; // hidden page: keep the last size
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const sizer = new ResizeObserver(resize);
  sizer.observe(canvas);

  const timer = new THREE.Timer();
  timer.connect(document); // a backgrounded tab resumes without a rotation jump
  let frames = 0;
  let elapsed = 0;
  function frame() {
    timer.update();
    const dt = timer.getDelta();
    if (mesh) {
      mesh.rotation.x += spin.x * dt;
      mesh.rotation.y += spin.y * dt;
    }
    renderer.render(scene, camera);
    frames++;
    elapsed += dt;
    if (frames >= 12 && statsListener) {
      statsListener({
        fps: Math.round(frames / elapsed),
        rotationX: mesh ? mesh.rotation.x : 0,
        rotationY: mesh ? mesh.rotation.y : 0,
        triangles: renderer.info.render.triangles,
      });
      frames = 0;
      elapsed = 0;
    }
  }
  renderer.setAnimationLoop(frame);

  return {
    setShape(name) {
      const make = geometries[name];
      if (!make) throw new Error(`stage: unknown shape "${name}"`);
      const rotation = mesh ? mesh.rotation.clone() : null;
      if (mesh) {
        mesh.geometry.dispose();
        scene.remove(mesh);
      }
      mesh = new THREE.Mesh(make(), material);
      mesh.scale.setScalar(scale);
      if (rotation) mesh.rotation.copy(rotation);
      scene.add(mesh);
    },
    setScale(s) {
      scale = s;
      if (mesh) mesh.scale.setScalar(s);
    },
    setSpin(x, y) {
      spin.x = x;
      spin.y = y;
    },
    setWireframe(on) {
      material.wireframe = on;
    },
    setColor(hex) {
      material.color.set(hex);
    },
    setBackground(hex) {
      background.set(hex);
    },
    // off: no frames at all (zero GPU work) and the canvas leaves the page
    setRunning(on) {
      canvas.hidden = !on;
      if (on) timer.reset(); // swallow the paused interval: no rotation jump on resume
      frames = 0;
      elapsed = 0;
      renderer.setAnimationLoop(on ? frame : null);
      if (!on && statsListener) statsListener({ fps: 0, rotationX: mesh ? mesh.rotation.x : 0, rotationY: mesh ? mesh.rotation.y : 0, triangles: 0 });
    },
    onStats(fn) {
      statsListener = fn;
    },
    dispose() {
      renderer.setAnimationLoop(null);
      sizer.disconnect();
      timer.dispose();
      if (mesh) mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
