import { useEffect, useRef } from "react";
import * as THREE from "three";

const WHITE_KEYS = 21;
const BLACK_STEPS = new Set([0, 1, 3, 4, 5]);

function makeKeyboard(scene) {
  const root = new THREE.Group();
  root.rotation.x = -0.12;
  root.rotation.z = -0.035;
  scene.add(root);
  const whiteMat = new THREE.MeshPhysicalMaterial({ color: 0xf8f5ed, roughness: .24, metalness: .02, clearcoat: .9 });
  const blackMat = new THREE.MeshPhysicalMaterial({ color: 0x171b19, roughness: .2, metalness: .16, clearcoat: 1 });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x252b25, roughness: .32, metalness: .35 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(9.25, .22, 1.9), baseMat);
  base.position.set(0, -.16, .1); root.add(base);
  const whiteGeo = new THREE.BoxGeometry(.42, .17, 1.72);
  const blackGeo = new THREE.BoxGeometry(.25, .19, 1.05);
  const keys = [];
  const start = -(WHITE_KEYS * .44) / 2 + .22;
  for (let i=0;i<WHITE_KEYS;i++) {
    const key = new THREE.Mesh(whiteGeo, whiteMat);
    key.position.set(start+i*.44, -.025, .1);
    root.add(key); keys.push({mesh:key,baseY:-.025,phase:i*.43});
  }
  for(let i=0;i<WHITE_KEYS-1;i++) if(BLACK_STEPS.has(i%7)) {
    const key=new THREE.Mesh(blackGeo,blackMat);
    key.position.set(start+i*.44+.22,.075,-.18);root.add(key);
  }
  return {root,keys,geometries:[whiteGeo,blackGeo,base.geometry],materials:[whiteMat,blackMat,baseMat]};
}

export default function LandingScene({ className = "" }) {
  const hostRef=useRef(null);
  useEffect(()=>{
    const host=hostRef.current;if(!host)return;
    let renderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:"high-performance"});}catch{return;}
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.12;
    host.appendChild(renderer.domElement);
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(34,1,.1,100);
    camera.position.set(0,3.6,13);camera.lookAt(0,0,0);
    scene.add(new THREE.HemisphereLight(0xfff5e7,0x26372b,2));
    const keyLight=new THREE.AreaLight?null:null;
    const light=new THREE.DirectionalLight(0xfff3df,3.2);light.position.set(4,8,7);scene.add(light);
    const greenLight=new THREE.PointLight(0x9dc183,36,18);greenLight.position.set(-5,2,1);scene.add(greenLight);
    const goldLight=new THREE.PointLight(0xc59a6b,28,16);goldLight.position.set(5,-1,-2);scene.add(goldLight);
    const piano=makeKeyboard(scene);
    piano.root.position.set(0,-2.05,.15);piano.root.rotation.x=-.3;
    const ringGroup=new THREE.Group();scene.add(ringGroup);
    const ringMat=new THREE.MeshStandardMaterial({color:0xc6a47c,metalness:.8,roughness:.22,transparent:true,opacity:.8});
    for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(3.6+i*.27,.012,8,180),ringMat);ring.rotation.x=Math.PI/2.5+i*.07;ring.rotation.z=i*.24;ring.position.set(0,.35,-1.4-i*.12);ringGroup.add(ring);}
    const staff=new THREE.Group();staff.position.set(0,1.65,-1.1);staff.rotation.x=-.08;scene.add(staff);
    const lineGeo=new THREE.BoxGeometry(8.4,.012,.012);
    const lineMat=new THREE.MeshBasicMaterial({color:0xb9c8aa,transparent:true,opacity:.42});
    for(let i=0;i<5;i++){const line=new THREE.Mesh(lineGeo,lineMat);line.position.y=(i-2)*.34;staff.add(line);}
    const notes=[];
    const noteMat=[new THREE.MeshPhysicalMaterial({color:0xb6d09e,metalness:.22,roughness:.2,clearcoat:1}),new THREE.MeshPhysicalMaterial({color:0xd0a879,metalness:.3,roughness:.22,clearcoat:1})];
    for(let i=0;i<15;i++){
      const group=new THREE.Group();
      const head=new THREE.Mesh(new THREE.SphereGeometry(.13,20,16),noteMat[i%2]);head.scale.set(1.5,.78,.55);
      const stem=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.78,8),noteMat[i%2]);stem.position.set(.17,.38,0);
      group.add(head,stem);group.position.set((i-7)*.55,Math.sin(i*1.7)*.45,.05+(i%3)*.035);group.rotation.z=i%2?-.28:.2;staff.add(group);
      notes.push({group,baseY:group.position.y,phase:i*.51});
    }
    const particleCount=420,positions=new Float32Array(particleCount*3);
    for(let i=0;i<particleCount;i++){positions[i*3]=(Math.random()-.5)*17;positions[i*3+1]=(Math.random()-.5)*10;positions[i*3+2]=(Math.random()-.5)*8-2;}
    const particleGeo=new THREE.BufferGeometry();particleGeo.setAttribute("position",new THREE.BufferAttribute(positions,3));
    const particleMat=new THREE.PointsMaterial({color:0xc3d6b1,size:.025,transparent:true,opacity:.65,depthWrite:false});
    const particles=new THREE.Points(particleGeo,particleMat);scene.add(particles);
    const pointer={x:0,y:0},target={x:0,y:0};let scroll=0,frame=0;
    function onPointer(e){const r=host.getBoundingClientRect();target.x=(e.clientX-r.left)/r.width-.5;target.y=(e.clientY-r.top)/r.height-.5;}
    function onScroll(){const r=host.getBoundingClientRect();scroll=Math.max(-1,Math.min(1,-r.top/Math.max(window.innerHeight,1)));}
    if(!reduced){host.addEventListener("pointermove",onPointer);window.addEventListener("scroll",onScroll,{passive:true});}
    function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
    const observer=new ResizeObserver(resize);observer.observe(host);resize();
    const clock=new THREE.Clock();
    function render(){
      const t=clock.getElapsedTime();pointer.x+=(target.x-pointer.x)*.045;pointer.y+=(target.y-pointer.y)*.045;
      piano.root.rotation.y=pointer.x*.16+Math.sin(t*.22)*.025;
      piano.root.position.y=-2.05+Math.sin(t*.65)*.045;
      piano.keys.forEach(({mesh,baseY,phase})=>{mesh.position.y=baseY-(reduced?0:Math.max(0,Math.sin(t*1.15-phase))*.045);});
      staff.rotation.y=pointer.x*.055+scroll*.12;staff.position.y=1.65+scroll*.35;
      notes.forEach(({group,baseY,phase})=>{group.position.y=baseY+(reduced?0:Math.sin(t*.55+phase)*.12);});
      ringGroup.rotation.y=t*.055+scroll*.2;ringGroup.rotation.z=t*.018;
      particles.rotation.y=t*.012+pointer.x*.04;
      camera.position.x=pointer.x*.35;camera.position.y=3.6+scroll*.3+pointer.y*.2;camera.lookAt(0,-.1,0);
      renderer.render(scene,camera);if(!reduced)frame=requestAnimationFrame(render);
    }
    render();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();host.removeEventListener("pointermove",onPointer);window.removeEventListener("scroll",onScroll);piano.geometries.forEach(g=>g.dispose());piano.materials.forEach(m=>m.dispose());ringGroup.children.forEach(m=>m.geometry.dispose());ringMat.dispose();staff.traverse(o=>{if(o.isMesh){o.geometry.dispose();}});lineGeo.dispose();lineMat.dispose();noteMat.forEach(m=>m.dispose());particleGeo.dispose();particleMat.dispose();renderer.dispose();renderer.domElement.remove();};
  },[]);
  return <div ref={hostRef} className={"lp-scene "+className} aria-hidden="true"/>;
}