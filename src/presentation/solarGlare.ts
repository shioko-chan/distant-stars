import * as THREE from 'three';

/** Optical glare around the Sun, not an enlarged photosphere or physical corona. */
export function createSolarGlare(radius: number, ownedTextures: Set<THREE.Texture>) {
    const size = 256;
    // Half-float alpha keeps the faint halo smooth after exposure and tone mapping.
    const pixels = new Uint16Array(size * size * 4);
    const rays = [[.16, .62, .19], [1.25, .43, .12], [2.5, .32, .09]];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1;
        const r = Math.hypot(u, v);
        // A broad, faint veil surrounds the brighter core without enlarging the solar mesh.
        let glow = .42 * Math.exp(-9 * r) + .30 * Math.exp(-30 * r);
        for (const [angle, length, strength] of rays) {
            const along = Math.abs(u * Math.cos(angle) + v * Math.sin(angle));
            const across = -u * Math.sin(angle) + v * Math.cos(angle);
            const width = .009 + .016 * Math.exp(-along * 8);
            glow += strength * Math.exp(-((across / width) ** 2) - along / length * 3);
        }
        const edge = 1 - THREE.MathUtils.smoothstep(r, .7, 1);
        const offset = (y * size + x) * 4;
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = THREE.DataUtils.toHalfFloat(1);
        pixels[offset + 3] = THREE.DataUtils.toHalfFloat(Math.min(1, glow * edge));
    }
    const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat, THREE.HalfFloatType);
    texture.magFilter = texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    ownedTextures.add(texture);
    const glare = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture, color: new THREE.Color(10, 9.75, 9.25),
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
    }));
    glare.name = 'solar-optical-glare';
    glare.scale.setScalar(radius * 32);
    return glare;
}
