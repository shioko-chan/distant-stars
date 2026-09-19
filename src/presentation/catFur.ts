import * as THREE from 'three';
import { mulberry32 } from '../simulation/rng';

/** Long shell Fur Shader: shared skinning, tapered strand coverage and a soft grazing sheen.
 * Shells are siblings of the original mesh so its node transform is applied only once.
 * Scene disposal owns the shared geometry, skeleton and generated texture.
 */
export function addCatFur(root: THREE.Object3D) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#000'; context.fillRect(0, 0, 256, 256);
    const random = mulberry32(9721);
    for (let i = 0; i < 8500; i++) {
        const shade = Math.round(110 + random() * 145);
        context.fillStyle = `rgb(${shade},${shade},${shade})`;
        context.fillRect(Math.floor(random() * 256), Math.floor(random() * 256), 1, 2);
    }
    const strands = new THREE.CanvasTexture(canvas);
    strands.wrapS = strands.wrapT = THREE.RepeatWrapping;
    strands.repeat.set(3, 3);
    strands.minFilter = THREE.LinearFilter;
    const bodies: THREE.SkinnedMesh[] = [];
    root.traverse(object => {
        if (object instanceof THREE.SkinnedMesh && !Array.isArray(object.material)
            && object.material.name === 'cat_diffuse'
            && object.geometry.getAttribute('position').count > 2000) bodies.push(object);
    });
    for (const body of bodies) {
        body.geometry.computeBoundingBox();
        const furLength = body.geometry.boundingBox!.getSize(new THREE.Vector3()).length() * .026;
        const original = body.material as THREE.MeshStandardMaterial;
        const coat = new THREE.MeshPhysicalMaterial({
            map: original.map, color: original.color.clone(), roughness: .92, metalness: 0,
            normalMap: original.normalMap, normalScale: new THREE.Vector2(.35, .35),
            bumpMap: strands, bumpScale: .0006,
            sheen: 1, sheenColor: new THREE.Color('#d8d4ce'), sheenRoughness: .8,
        });
        // Reuse the original base material; scene disposal owns every added shell.
        original.roughness = .9;
        original.normalScale.set(.35, .35);
        for (let layer = 1; layer <= 28; layer++) {
            const depth = layer / 28;
            const material = coat.clone();
            material.alphaMap = strands;
            material.alphaTest = .08 + depth * .67;
            material.color.multiplyScalar(.8 + depth * .2);
            material.onBeforeCompile = shader => {
                shader.uniforms.furLength = { value: furLength };
                shader.uniforms.furDepth = { value: depth };
                shader.uniforms.furNoise = { value: strands };
                shader.vertexShader = `uniform float furLength;
                    uniform float furDepth;
                    uniform sampler2D furNoise;\n` + shader.vertexShader;
                // Offset before skinning so every shell follows the animated skeleton.
                // Strand length varies across the coat, with curved tips rather than
                // identical parallel layers. Original atlas UVs retain the bicolor coat.
                shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
                    #include <begin_vertex>
                    float strand = texture2D(furNoise, uv * 3.0).g;
                    float lengthVariation = 0.65 + strand * 0.35;
                    vec3 tangent = cross(normal, vec3(0.0, 0.0, 1.0));
                    transformed += normal * furLength * furDepth * lengthVariation;
                    transformed += tangent * furLength * furDepth * furDepth * 0.18;
                `);
            };
            material.customProgramCacheKey = () => 'cat-long-fur-v2';
            const shell = new THREE.SkinnedMesh(body.geometry, material);
            shell.name = `long-fur-${layer}`;
            shell.position.copy(body.position); shell.quaternion.copy(body.quaternion); shell.scale.copy(body.scale);
            shell.morphTargetInfluences = body.morphTargetInfluences;
            shell.morphTargetDictionary = body.morphTargetDictionary;
            shell.bindMode = body.bindMode;
            shell.bind(body.skeleton, body.bindMatrix);
            shell.frustumCulled = false;
            shell.receiveShadow = true;
            body.parent!.add(shell);
        }
        coat.dispose();
    }
    // Return the texture even when a future asset has no matching body.
    return strands;
}
