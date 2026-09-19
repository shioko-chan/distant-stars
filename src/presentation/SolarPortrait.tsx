import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { solarTexture } from '../content/solar';

/** Real equirectangular UV mapping, including the poles, on a lit sphere. */
export function SolarPortrait({ planetId }: { planetId: string }) {
    const host=useRef<HTMLDivElement>(null);
    useEffect(()=>{
        const url=solarTexture(planetId); if(!url) return;
        const root=host.current!, renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
        renderer.setSize(160,160,false); renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)); root.appendChild(renderer.domElement);
        const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(35,1,.1,20); camera.position.z=3.6;
        scene.add(new THREE.AmbientLight(0xffffff,1.5));
        const light=new THREE.DirectionalLight(0xffffff,2); light.position.set(-3,2,4); scene.add(light);
        let disposed=false;
        const texture=new THREE.TextureLoader().load(url,()=>{if(!disposed)renderer.render(scene,camera);}); texture.colorSpace=THREE.SRGBColorSpace;
        const geometry=new THREE.SphereGeometry(1,64,32), material=new THREE.MeshStandardMaterial({map:texture,roughness:1});
        const sphere=new THREE.Mesh(geometry,material); sphere.rotation.y=-.8; scene.add(sphere);
        renderer.render(scene,camera);
        return ()=>{disposed=true; texture.dispose(); geometry.dispose(); material.dispose(); renderer.dispose(); root.removeChild(renderer.domElement);};
    },[planetId]);
    return <div ref={host} className="solar-portrait" aria-label="真实影像球面贴图"/>;
}
