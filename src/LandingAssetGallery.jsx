import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const ASSETS = [
  { id: "keys", label: "Keyboard", detail: "A responsive instrument, built from geometry.", index: 0 },
  { id: "metronome", label: "Metronome", detail: "A precise pulse with a little personality.", index: 1 },
  { id: "score", label: "Score", detail: "Notation becomes a tactile, floating object.", index: 2 },
  { id: "note", label: "Sound forms", detail: "Notes and rhythm, translated into shape.", index: 3 },
];

function createAssets(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const cream = new THREE.MeshPhysicalMaterial({ color: 0xf2eee3, roughness: .23, metalness: .08, clearcoat: .9 });
  const dark = new THREE.MeshPhysicalMaterial({ color: 0x1b241d, roughness: .24, metalness: .35, clearcoat: .8 });
  const sage = new THREE.MeshPhysicalMaterial({ color: 0xa9c397, roughness: .22, metalness: .18, clearcoat: 1 });
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xc49b69, roughness: .2, metalness: .82, clearcoat: 1 });
  const groups = [];

  // A miniature keyboard: individual ivory keys and raised black keys.
  const keyboard = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.8, .18, 1.1), dark);
  base.position.y = -.12; keyboard.add(base);
  for (let i = 0; i < 14; i++) {
    const key = new THREE.Mesh(new THREE.BoxGeometry(.25, .12, .96), cream);
    key.position.set(-1.62 + i * .25, 0, 0); keyboard.add(key);
    if ([0,1,3,4,5].includes(i % 7) && i < 13) {
      const black = new THREE.Mesh(new THREE.BoxGeometry(.15, .16, .58), dark);
      black.position.set(-1.495 + i * .25, .1, -.16); keyboard.add(black);
    }
  }
  keyboard.rotation.x = -.28; keyboard.rotation.z = -.07; keyboard.position.y = -.08;
  root.add(keyboard); groups.push(keyboard);

  // A sculptural metronome with a moving brass pendulum.
  const metro = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(.82, 2.25, 4), sage);
  body.rotation.y = Math.PI / 4; body.position.y = .02; metro.add(body);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(1.9, .18, 1.15), dark);
  foot.position.y = -1.1; metro.add(foot);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.7, 12), brass);
  rod.position.set(0, .22, .38); rod.rotation.z = -.2; metro.add(rod);
  const weight = new THREE.Mesh(new THREE.SphereGeometry(.16, 24, 16), brass);
  weight.position.set(0, .45, .38); metro.add(weight);
  metro.scale.setScalar(.82); metro.position.y = -.05;
  root.add(metro); groups.push(metro);

  // Floating sheet: paper, staff lines, notes and a treble-clef-like spiral.
  const score = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3.1, .08), cream);
  score.add(paper);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x64735d });
  for (let i = 0; i < 5; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(1.85, .018, .012), lineMat);
    line.position.set(0, .28 - i * .16, .055); score.add(line);
  }
  for (let i = 0; i < 6; i++) {
    const note = new THREE.Mesh(new THREE.SphereGeometry(.09, 16, 12), i % 2 ? brass : dark);
    note.scale.set(1.3, .72, .65);
    note.position.set(-.72 + i * .28, .2 - (i % 4) * .15, .09);
    score.add(note);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(.025, .48, .025), dark);
    stem.position.set(-.62 + i * .28, .42 - (i % 4) * .15, .08); score.add(stem);
  }
  score.rotation.set(-.12, .18, -.13); score.position.y = .02;
  root.add(score); groups.push(score);

  // Abstract note sculpture: torus, floating note heads and a brass orbit.
  const sculpture = new THREE.Group();
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(.9, 2), sage);
  orb.scale.set(.76, 1.15, .7); sculpture.add(orb);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(1.28, .025, 10, 100), brass);
  loop.rotation.set(.8, .3, .4); sculpture.add(loop);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.3, 28, 20), cream);
  head.scale.set(1.45, .8, .8); head.position.set(.85, .72, .28); sculpture.add(head);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 1.45, 12), brass);
  stem.position.set(1.08, 1.38, .28); sculpture.add(stem);
  sculpture.scale.setScalar(.85); sculpture.position.y = -.1;
  root.add(sculpture); groups.push(sculpture);

  return { root, groups, materials: [cream, dark, sage, brass, lineMat] };
}

export default function LandingAssetGallery() {
  const hostRef = useRef(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" }); }
    catch { return undefined; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
    camera.position.set(0, .25, 9.5);
    scene.add(new THREE.HemisphereLight(0xfff7e9, 0x26372b, 2.1));
    const keyLight = new THREE.DirectionalLight(0xfff3df, 3.2);
    keyLight.position.set(4, 6, 6); scene.add(keyLight);
    const fill = new THREE.PointLight(0x9dc183, 28, 18);
    fill.position.set(-4, 1, 2); scene.add(fill);
    const rim = new THREE.PointLight(0xc49b69, 24, 16);
    rim.position.set(4, -2, -2); scene.add(rim);
    const assets = createAssets(scene);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.1, .012, 8, 160), new THREE.MeshBasicMaterial({ color: 0xb89a70, transparent: true, opacity: .45 }));
    ring.rotation.x = Math.PI / 2.7; ring.position.z = -1.5; scene.add(ring);
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    let frame = 0;
    function onPointer(event) {
      const rect = host.getBoundingClientRect();
      pointer.tx = ((event.clientX - rect.left) / rect.width - .5) * 2;
      pointer.ty = ((event.clientY - rect.top) / rect.height - .5) * 2;
    }
    function resize() {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    host.addEventListener("pointermove", onPointer);
    const clock = new THREE.Clock();
    function render() {
      const t = clock.getElapsedTime();
      pointer.x += (pointer.tx - pointer.x) * .045;
      pointer.y += (pointer.ty - pointer.y) * .045;
      assets.groups.forEach((group, i) => {
        const selected = i === active;
        group.visible = selected;
        if (selected) {
          group.rotation.y = pointer.x * .18 + Math.sin(t * .28) * .08;
          group.rotation.x += (pointer.y * .07 - group.rotation.x) * .015;
          group.position.y = Math.sin(t * .7) * .12;
          group.scale.setScalar((i === 1 ? .82 : i === 2 ? 1 : .85) * (1 + Math.sin(t * .6) * .012));
          if (i === 1) group.children[2].rotation.z = Math.sin(t * 1.7) * .22;
        }
      });
      ring.rotation.z = t * .035;
      camera.position.x = pointer.x * .18;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      if (!reduced) frame = requestAnimationFrame(render);
    }
    render();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); host.removeEventListener("pointermove", onPointer);
      assets.root.traverse(object => { if (object.isMesh) object.geometry.dispose(); });
      assets.materials.forEach(material => material.dispose());
      ring.geometry.dispose(); ring.material.dispose();
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [active]);
  return <div className="lp-asset-gallery">
    <div className="lp-asset-intro">
      <span className="lp-eyebrow">A WORLD IN THREE DIMENSIONS</span>
      <h2>Small details.<br/><em>A more tactile way to learn.</em></h2>
      <p>Purpose-built 3D objects give Piano Coach a visual language of its own — instruments, notation and rhythm brought to life with light, movement and depth.</p>
      <div className="lp-asset-picker" role="tablist" aria-label="Explore 3D elements">
        {ASSETS.map((asset, i) => <button type="button" role="tab" aria-selected={active === i} className={active === i ? "active" : ""} key={asset.id} onClick={() => setActive(i)}><span>0{i + 1}</span>{asset.label}<b>↗</b></button>)}
      </div>
    </div>
    <div className="lp-asset-stage">
      <div className="lp-asset-stage-top"><span>OBJECT STUDY / 0{active + 1}</span><span>WEBGL · REAL TIME</span></div>
      <div ref={hostRef} className="lp-asset-canvas" aria-label={ASSETS[active].label + " interactive 3D object"} />
      <div className="lp-asset-stage-caption"><strong>{ASSETS[active].label}</strong><span>{ASSETS[active].detail}</span></div>
      <div className="lp-asset-stage-mark" aria-hidden="true">PC—3D</div>
    </div>
  </div>;
}
