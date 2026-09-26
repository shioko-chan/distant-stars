import * as THREE from 'three';

/** Optical glare around the Sun, not an enlarged photosphere or physical corona. */
export function createSolarGlare(radius: number, ownedTextures: Set<THREE.Texture>) {
    const size = 512;
    // Half-float alpha keeps the faint halo smooth after exposure and tone mapping.
    const pixels = new Uint16Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1;
        const r = Math.hypot(u, v);
        // Broadband veiling glare: a small white core with continuous inverse-power falloff.
        // There is no star-shaped flare or yellow painted corona around the solar disk.
        const glow = .8 * Math.exp(-r * r / .0035)
            + .085 / (1 + (r / .13) ** 2.6)
            + .006 * Math.exp(-r * 4);
        const edge = 1 - THREE.MathUtils.smoothstep(r, .7, 1);
        const offset = (y * size + x) * 4;
        const warmth = THREE.MathUtils.smoothstep(r, .04, .5);
        pixels[offset] = THREE.DataUtils.toHalfFloat(1);
        pixels[offset + 1] = THREE.DataUtils.toHalfFloat(1 - .055 * warmth);
        pixels[offset + 2] = THREE.DataUtils.toHalfFloat(1 - .13 * warmth);
        pixels[offset + 3] = THREE.DataUtils.toHalfFloat(Math.min(1, glow * edge));
    }
    const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat, THREE.HalfFloatType);
    texture.magFilter = texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    ownedTextures.add(texture);
    const glare = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture, color: new THREE.Color(12, 12, 12),
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
    }));
    glare.name = 'solar-optical-glare';
    glare.scale.setScalar(radius * 64);
    return glare;
}
