import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const ASSETS = [
  { id: "keys", label: "Keyboard", title: "A familiar instrument. A new perspective.", detail: "Ivory keys catch the light as a quiet pulse travels across the instrument.", body: "The centre of every practice session. A sculpted keyboard responds to your movement, with individual keys rising and falling in a slow, natural rhythm." },
  { id: "metronome", label: "Metronome", title: "Find the space between beats.", detail: "A pendulum keeps time with a warm brass glint.", body: "A small study in rhythm. The pendulum moves gently while the surrounding light shifts with the passing beat." },
  { id: "score", label: "Notation", title: "Let the music take shape.", detail: "A score floats in space, line by line.", body: "Notation becomes something you can almost reach. Notes, stems and staff lines sit in a layered paper form." },
  { id: "note", label: "Sound forms", title: "See the feeling in a sound.", detail: "A moving sculpture traces the shape of a note.", body: "A more abstract expression of music: a soft sculptural form, a brass orbit and a changing point of light." },
];

function createObjects(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const ivory = new THREE.MeshPhysicalMaterial({ color: 0xf2eee3, roughness: .24, metalness: .05, clearcoat: .85 });
  const charcoal = new THREE.MeshPhysicalMaterial({ color: 0x202920, roughness: .25, metalness: .3, clearcoat: .8 });
  const sage = new THREE.MeshPhysicalMaterial({ color: 0xa9c397, roughness: .22, metalness: .16, clearcoat: 1 });
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xc49b69, roughness: .2, metalness: .82, clearcoat: 1 });
  const groups = [];

  const keyboard = new THREE.Group();
  keyboard.add(new THREE.Mesh(new THREE.BoxGeometry(4.2, .2, 1.15), charcoal));
  for (let i = 0; i < 14; i++) {
    const key = new THREE.Mesh(new THREE.BoxGeometry(.28, .12, 1), ivory);
    key.position.set(-1.82 + i * .28, .12, 0); keyboard.add(key);
    if ([0, 1, 3, 4, 5].includes(i % 7) && i < 13) {
      const black = new THREE.Mesh(new THREE.BoxGeometry(.17, .16, .58), charcoal);
      black.position.set(-1.68 + i * .28, .25, -.16); keyboard.add(black);
    }
  }
  keyboard.rotation.x = -.3; keyboard.rotation.z = -.05; keyboard.position.y = -.05;
  root.add(keyboard); groups.push(keyboard);

  const metro = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(.82, 2.25, 4), sage);
  body.rotation.y = Math.PI / 4; body.position.y = .02; metro.add(body);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(1.9, .18, 1.15), charcoal);
  foot.position.y = -1.1; metro.add(foot);
  const pivot = new THREE.Group(); pivot.position.set(0, .55, .4); metro.add(pivot);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.7, 12), brass);
  rod.position.y = .15; pivot.add(rod);
  const weight = new THREE.Mesh(new THREE.SphereGeometry(.16, 24, 16), brass);
  weight.position.y = .85; pivot.add(weight);
  metro.scale.setScalar(.84); metro.position.y = -.05;
  root.add(metro); groups.push(metro);

  const score = new THREE.Group();
  score.add(new THREE.Mesh(new THREE.BoxGeometry(2.5, 3.1, .08), ivory));
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x64735d });
  for (let i = 0; i < 5; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(1.85, .018, .012), lineMat);
    line.position.set(0, .28 - i * .16, .055); score.add(line);
  }
  for (let i = 0; i < 6; i++) {
    const note = new THREE.Mesh(new THREE.SphereGeometry(.09, 16, 12), i % 2 ? brass : charcoal);
    note.scale.set(1.3, .72, .65);
    note.position.set(-.72 + i * .28, .2 - (i % 4) * .15, .09); score.add(note);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(.025, .48, .025), charcoal);
    stem.position.set(-.62 + i * .28, .42 - (i % 4) * .15, .08); score.add(stem);
  }
  score.rotation.set(-.12, .18, -.13); root.add(score); groups.push(score);

  const sculpture = new THREE.Group();
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(.9, 2), sage);
  orb.scale.set(.76, 1.15, .7); sculpture.add(orb);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(1.28, .025, 10, 100), brass);
  loop.rotation.set(.8, .3, .4); sculpture.add(loop);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.3, 28, 20), ivory);
  head.scale.set(1.45, .8, .8); head.position.set(.85, .72, .28); sculpture.add(head);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 1.45, 12), brass);
  stem.position.set(1.08, 1.38, .28); sculpture.add(stem);
  sculpture.scale.setScalar(.9); root.add(sculpture); groups.push(sculpture);

  return { root, groups, materials: [ivory, charcoal, sage, brass, lineMat] };
}

export default function LandingAssetGallery() {
  const hostRef = useRef(null);
  const sectionRef = useRef(null);
  const chapterRefs = useRef([]);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);

  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    const host = hostRef.current;
    const section = sectionRef.current;
    if (!host || !section) return undefined;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" }); }
    catch { host.dataset.webglFailed = "true"; return undefined; }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
    camera.position.set(0, .15, 9.2);
    scene.add(new THREE.HemisphereLight(0xfff7e9, 0x26372b, 2));
    const keyLight = new THREE.DirectionalLight(0xfff3df, 3.1);
    keyLight.position.set(4, 6, 6); scene.add(keyLight);
    const fill = new THREE.PointLight(0x9dc183, 26, 18);
    fill.position.set(-4, 1, 2); scene.add(fill);
    const rim = new THREE.PointLight(0xc49b69, 22, 16);
    rim.position.set(4, -2, -2); scene.add(rim);

    const objects = createObjects(scene);
    const waveMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uScroll: { value: 0 }, uPointer: { value: new THREE.Vector2(0, 0) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uScroll; uniform vec2 uPointer; varying vec2 vUv;
        void main(){
          vec2 p=vUv-0.5; float r=length(p);
          float wave=sin(r*34.0-uTime*1.1+uScroll*5.0+sin(p.x*9.0+uTime*.25)*.8);
          float ripple=sin(length(p-uPointer*.16)*58.0-uTime*1.7);
          float lines=smoothstep(.88,.98,abs(wave))*.16+smoothstep(.94,1.0,abs(ripple))*.08;
          float fade=1.0-smoothstep(.08,.52,r);
          vec3 color=mix(vec3(.15,.22,.17),vec3(.68,.78,.59),lines);
          gl_FragColor=vec4(color,lines*fade);
        }`
    });
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), waveMaterial);
    backdrop.position.z = -2.8; scene.add(backdrop);

    const count = 260;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - .5) * 10;
      positions[i * 3 + 1] = (Math.random() - .5) * 7;
      positions[i * 3 + 2] = (Math.random() - .5) * 3 - 1;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({ color: 0xc3d6b1, size: .025, transparent: true, opacity: .6, depthWrite: false });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    let frame = 0;
    let visible = true;
    let scrollProgress = 0;
    function onPointer(event) {
      const rect = host.getBoundingClientRect();
      pointer.tx = ((event.clientX - rect.left) / rect.width - .5) * 2;
      pointer.ty = ((event.clientY - rect.top) / rect.height - .5) * 2;
    }
    function onScroll() {
      const rect = section.getBoundingClientRect();
      const range = Math.max(1, section.offsetHeight - window.innerHeight);
      scrollProgress = THREE.MathUtils.clamp(-rect.top / range, 0, 1);
    }
    function resize() {
      const width = host.clientWidth, height = host.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height; camera.updateProjectionMatrix();
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host); resize();
    const visibilityObserver = new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? true;
      if (visible && !reduced && !frame) frame = requestAnimationFrame(render);
      if (!visible && frame) { cancelAnimationFrame(frame); frame = 0; }
    }, { threshold: .01 });
    visibilityObserver.observe(section);
    host.addEventListener("pointermove", onPointer);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    const clock = new THREE.Clock();
    function render() {
      const time = clock.getElapsedTime();
      pointer.x += (pointer.tx - pointer.x) * .045;
      pointer.y += (pointer.ty - pointer.y) * .045;
      const selected = activeRef.current;
      objects.groups.forEach((group, index) => {
        const show = index === selected;
        group.visible = show;
        if (show) {
          group.rotation.y = pointer.x * .2 + Math.sin(time * .22) * .07 + scrollProgress * .5;
          group.rotation.x += (pointer.y * .08 - group.rotation.x) * .015;
          group.position.y = Math.sin(time * .65) * .12 + Math.sin(scrollProgress * Math.PI) * .14;
          const base = index === 1 ? .84 : index === 2 ? 1 : .9;
          group.scale.setScalar(base * (1 + Math.sin(time * .55) * .012));
          if (index === 1) group.children[2].rotation.z = Math.sin(time * 1.7 + scrollProgress * 4) * .28;
        }
      });
      waveMaterial.uniforms.uTime.value = time;
      waveMaterial.uniforms.uScroll.value = scrollProgress;
      waveMaterial.uniforms.uPointer.value.set(pointer.x, pointer.y);
      particles.rotation.y = time * .012 + pointer.x * .04 + scrollProgress * .18;
      camera.position.x = pointer.x * .16;
      camera.position.y = .15 + pointer.y * .08 + scrollProgress * .24;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera); host.dataset.webglReady = "true";
      if (!reduced && visible) frame = requestAnimationFrame(render);
    }
    render();

    const chapterObserver = new IntersectionObserver(entries => {
      const visibleChapters = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visibleChapters[0]) {
        const next = Number(visibleChapters[0].target.dataset.index);
        if (Number.isInteger(next)) setActive(next);
      }
    }, { rootMargin: "-35% 0px -35% 0px", threshold: [0, .2, .45, .7, 1] });
    chapterRefs.current.forEach(chapter => chapter && chapterObserver.observe(chapter));

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect(); visibilityObserver.disconnect(); chapterObserver.disconnect();
      host.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      objects.root.traverse(object => { if (object.isMesh) object.geometry.dispose(); });
      objects.materials.forEach(material => material.dispose());
      backdrop.geometry.dispose(); waveMaterial.dispose();
      particleGeometry.dispose(); particleMaterial.dispose();
      renderer.dispose(); renderer.domElement.remove(); delete host.dataset.webglReady;
    };
  }, []);

  return <div className="lp-asset-gallery-scroll" ref={sectionRef} aria-label="Explore the visual world of Piano Coach">
    <div className="lp-asset-story">
      <div className="lp-asset-heading">
        <span className="lp-eyebrow">A WORLD OF ITS OWN</span>
        <h2>Music, made<br/><em>tangible.</em></h2>
        <p>Small details make a more memorable practice experience. Scroll to explore the objects and forms that bring Piano Coach to life.</p>
      </div>
      {ASSETS.map((asset, index) => <article className={"lp-asset-chapter" + (active === index ? " active" : "")} data-index={index} ref={node => { chapterRefs.current[index] = node; }} key={asset.id}>
        <span className="lp-asset-chapter-index">0{index + 1} / 04</span>
        <h3>{asset.title}</h3>
        <p>{asset.body}</p>
        <button type="button" onClick={() => setActive(index)} aria-pressed={active === index}>Explore {asset.label.toLowerCase()} <span>↗</span></button>
      </article>)}
    </div>
    <div className="lp-asset-sticky">
      <div className="lp-asset-stage-top"><span>PIANO COACH / OBJECT STUDIES</span><span>0{active + 1} — 04</span></div>
      <div ref={hostRef} className="lp-asset-canvas" aria-label={ASSETS[active].label + " interactive three-dimensional artwork"} />
      <div className={"lp-asset-fallback asset-" + ASSETS[active].id} aria-hidden="true">
        <svg viewBox="0 0 640 460">
          <defs><linearGradient id="pc-object-metal" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#e4c79d"/><stop offset="1" stopColor="#8c6846"/></linearGradient><linearGradient id="pc-object-ivory" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fffdf5"/><stop offset="1" stopColor="#cfcabb"/></linearGradient></defs>
          <ellipse cx="320" cy="375" rx="210" ry="26" fill="#9dc183" opacity=".12"/>
          {active===0&&<g transform="translate(100 180) skewX(-12)"><rect width="440" height="115" rx="10" fill="#202920" stroke="url(#pc-object-metal)" strokeWidth="4"/>{Array.from({length:14},(_,i)=><rect key={i} x={8+i*30.3} y="8" width="28" height="98" rx="3" fill="url(#pc-object-ivory)" stroke="#9b988d"/>)}{[1,2,4,5,6,8,9,11,12].map(i=><rect key={i} x={29+i*30.3} y="8" width="17" height="61" rx="2" fill="#202920"/>)}</g>}
          {active===1&&<g><path d="M320 350 L245 350 L270 170 L370 170 L395 350 Z" fill="#9dc183" stroke="#c49b69" strokeWidth="5"/><path d="M320 175 V65" stroke="url(#pc-object-metal)" strokeWidth="7"/><circle cx="320" cy="70" r="18" fill="#c49b69"/><path d="M320 65 L405 90" stroke="#d9bd91" strokeWidth="5"/><circle cx="405" cy="90" r="13" fill="#d9bd91"/></g>}
          {active===2&&<g transform="rotate(-7 320 230)"><rect x="170" y="75" width="300" height="330" rx="7" fill="#f2eee3" stroke="#c49b69" strokeWidth="5"/>{[0,1,2,3,4].map(i=><path key={i} d={`M205 ${190+i*28} H435`} stroke="#64735d" strokeWidth="3"/>)}{[0,1,2,3,4,5].map(i=><g key={i} fill={i%2?"#c49b69":"#202920"}><ellipse cx={230+i*36} cy={178+(i%4)*27} rx="9" ry="6"/><path d={`M238 ${178+(i%4)*27} v-58`} stroke="#202920" strokeWidth="4"/></g>)}</g>}
          {active===3&&<g><ellipse cx="320" cy="235" rx="118" ry="155" fill="#9dc183" opacity=".75" transform="rotate(28 320 235)"/><ellipse cx="320" cy="235" rx="160" ry="95" fill="none" stroke="url(#pc-object-metal)" strokeWidth="7" transform="rotate(-35 320 235)"/><circle cx="390" cy="145" r="38" fill="#f2eee3"/><path d="M390 110 V50" stroke="#c49b69" strokeWidth="9"/></g>}
        </svg>
      </div>
      <div className="lp-asset-stage-caption"><strong>{ASSETS[active].label}</strong><span>{ASSETS[active].detail}</span></div>
      <div className="lp-asset-stage-mark" aria-hidden="true">PC—3D</div>
      <div className="lp-asset-stage-counter"><span>SCROLL TO EXPLORE</span><b>0{active + 1}</b></div>
    </div>
  </div>;
}
