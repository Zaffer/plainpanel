// Plain imperative three.js behind a narrow API — no signals in here.
// The store pushes data in through the setters; stats flow out through one
// callback. This boundary is invariant 4: never proxy foreign objects.
import * as THREE from 'three';

export function createStage(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (err) {
    // No WebGL (headless / remote session): the dashboard still runs, the
    // stage becomes inert. The narrow API is what makes this stub possible.
    console.warn('stage: WebGL unavailable, running without 3D —', err.message);
    canvas.remove();
    const noop = () => {};
    return { setShape: noop, setScale: noop, setSpin: noop, setWireframe: noop, setColor: noop, setBackground: noop, setRunning: noop, onStats: noop, dispose: noop };
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 6);

  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(3, 4, 5);
  scene.add(key, new THREE.AmbientLight(0x888888));

  const material = new THREE.MeshStandardMaterial({ color: 0x8fc7ff });
  const geometries = {
    knot: () => new THREE.TorusKnotGeometry(1, 0.32, 128, 16),
    box: () => new THREE.BoxGeometry(1.8, 1.8, 1.8),
    sphere: () => new THREE.SphereGeometry(1.3, 48, 24),
  };

  let mesh = null;
  let scale = 1;
  const spin = { x: 0, y: 0 };
  let statsListener = null;

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let frames = 0;
  let elapsed = 0;
  function frame() {
    const dt = clock.getDelta();
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
      scene.background.set(hex);
    },
    // off: no frames at all (zero GPU work) and the canvas leaves the page
    setRunning(on) {
      canvas.hidden = !on;
      if (on) clock.getDelta(); // swallow the paused interval: no rotation jump on resume
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
      window.removeEventListener('resize', resize);
      if (mesh) mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
