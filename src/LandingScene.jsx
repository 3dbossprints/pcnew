import { useEffect, useRef } from "react";
import * as THREE from "three";

const WHITE_KEY_COUNT = 14;
const KEY_WIDTH = 0.42;
const BLACK_PATTERN = [0, 1, 3, 4, 5];

function buildKeyboard(group, whiteMaterial, blackMaterial) {
  const whiteGeometry = new THREE.BoxGeometry(KEY_WIDTH * 0.92, 0.18, 2.6);
  const blackGeometry = new THREE.BoxGeometry(KEY_WIDTH * 0.52, 0.22, 1.5);
  const keys = [];
  const startX = -(WHITE_KEY_COUNT * KEY_WIDTH) / 2 + KEY_WIDTH / 2;

  for (let i = 0; i < WHITE_KEY_COUNT; i += 1) {
    const mesh = new THREE.Mesh(whiteGeometry, whiteMaterial);
    mesh.position.set(startX + i * KEY_WIDTH, 0, 0.4);
    group.add(mesh);
    keys.push({ mesh, baseY: 0 });
  }

  for (let i = 0; i < WHITE_KEY_COUNT - 1; i += 1) {
    if (!BLACK_PATTERN.includes(i % 7)) continue;
    const mesh = new THREE.Mesh(blackGeometry, blackMaterial);
    mesh.position.set(startX + i * KEY_WIDTH + KEY_WIDTH / 2, 0.1, -0.35);
    group.add(mesh);
    keys.push({ mesh, baseY: 0.1 });
  }

  return { keys, geometries: [whiteGeometry, blackGeometry] };
}

function buildParticles(count) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 12;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 7;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0x9dc183, size: 0.045, transparent: true, opacity: 0.7, depthWrite: false });
  return { points: new THREE.Points(geometry, material), geometry, material };
}

export default function LandingScene({ className = "" }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return undefined;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 2.6, 10);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xfff6eb, 0x526d4c, 1.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(4, 7, 6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x9dc183, 1.4);
    rimLight.position.set(-6, 3, -4);
    scene.add(rimLight);

    const whiteMaterial = new THREE.MeshPhysicalMaterial({ color: 0xfffdf8, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.18 });
    const blackMaterial = new THREE.MeshPhysicalMaterial({ color: 0x242423, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.12 });
    const ringMaterial = new THREE.MeshStandardMaterial({ color: 0x9dc183, metalness: 0.35, roughness: 0.3, transparent: true, opacity: 0.85 });

    const rig = new THREE.Group();
    rig.rotation.x = -0.55;
    scene.add(rig);
    const keyboard = buildKeyboard(rig, whiteMaterial, blackMaterial);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.9, 0.035, 16, 160), ringMaterial);
    ring.rotation.x = Math.PI / 2.4;
    ring.position.z = -1.2;
    scene.add(ring);

    // A suspended, translucent score plane and gently drifting 3D notation
    // give the hero a recognisable musical focal point without loading media.
    const scoreGroup = new THREE.Group();
    scoreGroup.position.set(0, 1.45, -1.8);
    scoreGroup.rotation.x = -0.08;
    scene.add(scoreGroup);
    const staffGeometry = new THREE.BoxGeometry(5.9, 0.012, 0.012);
    const staffMaterial = new THREE.MeshStandardMaterial({ color: 0x9b9a88, transparent: true, opacity: 0.48 });
    const staffLines = [];
    for (let i = 0; i < 5; i += 1) {
      const line = new THREE.Mesh(staffGeometry, staffMaterial);
      line.position.y = (i - 2) * 0.28;
      scoreGroup.add(line);
      staffLines.push(line);
    }
    const noteHeadGeometry = new THREE.SphereGeometry(0.12, 16, 12);
    noteHeadGeometry.scale(1.45, 0.78, 0.55);
    const noteStemGeometry = new THREE.BoxGeometry(0.035, 0.66, 0.035);
    const noteMaterials = [
      new THREE.MeshPhysicalMaterial({ color: 0x526d4c, roughness: 0.28, metalness: 0.18, clearcoat: 0.7 }),
      new THREE.MeshPhysicalMaterial({ color: 0xb88c62, roughness: 0.3, metalness: 0.28, clearcoat: 0.65 }),
    ];
    const floatingNotes = [];
    for (let i = 0; i < 9; i += 1) {
      const note = new THREE.Group();
      const material = noteMaterials[i % noteMaterials.length];
      const head = new THREE.Mesh(noteHeadGeometry, material);
      const stem = new THREE.Mesh(noteStemGeometry, material);
      stem.position.set(0.13, 0.3, 0);
      note.add(head, stem);
      note.position.set((i - 4) * 0.62, (i % 3 - 1) * 0.42, 0.08 + (i % 2) * 0.04);
      note.rotation.z = i % 2 ? -0.22 : 0.18;
      scoreGroup.add(note);
      floatingNotes.push({ note, baseY: note.position.y, phase: i * 0.72 });
    }

    const particles = buildParticles(260);
    scene.add(particles.points);

    const pointer = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };

    function onPointerMove(event) {
      const rect = host.getBoundingClientRect();
      target.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      target.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    }
    function onPointerLeave() {
      target.x = 0;
      target.y = 0;
    }
    if (!reduceMotion) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      host.addEventListener("pointerleave", onPointerLeave);
    }

    function resize() {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const clock = new THREE.Clock();
    let frame = 0;

    function render() {
      const t = clock.getElapsedTime();
      pointer.x += (target.x - pointer.x) * 0.06;
      pointer.y += (target.y - pointer.y) * 0.06;

      rig.rotation.y = pointer.x * 0.28 + Math.sin(t * 0.25) * 0.05;
      rig.rotation.z = pointer.y * 0.05;
      ring.rotation.z = t * 0.12;
      particles.points.rotation.y = t * 0.02;
      scoreGroup.rotation.y = pointer.x * 0.08 + Math.sin(t * 0.18) * 0.035;
      floatingNotes.forEach(({ note, baseY, phase }) => {
        note.position.y = baseY + (reduceMotion ? 0 : Math.sin(t * 0.72 + phase) * 0.12);
        note.rotation.z += reduceMotion ? 0 : Math.sin(t * 0.35 + phase) * 0.0008;
      });

      keyboard.keys.forEach(({ mesh, baseY }, index) => {
        const wave = Math.max(0, Math.sin(t * 1.6 - index * 0.45));
        mesh.position.y = baseY - wave * 0.05;
      });

      renderer.render(scene, camera);
      if (!reduceMotion) frame = requestAnimationFrame(render);
    }
    render();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      keyboard.geometries.forEach((geometry) => geometry.dispose());
      whiteMaterial.dispose();
      blackMaterial.dispose();
      ringMaterial.dispose();
      ring.geometry.dispose();
      particles.geometry.dispose();
      particles.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className={"lp-scene " + className} aria-hidden="true" />;
}
