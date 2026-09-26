import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createCityMaterials } from './cityMaterials';

function deferredTexture() {
    let resolve!: (texture: THREE.Texture) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<THREE.Texture>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function dispose(materials: ReturnType<typeof createCityMaterials>, textures: Set<THREE.Texture>) {
    materials.facade.dispose(); materials.structure.dispose();
    textures.forEach(texture => texture.dispose());
}

describe('photographic city materials', () => {
    it('waits for both photos and keeps texture ownership on ordinary material properties', async () => {
        const facadeLoad = deferredTexture(), roofLoad = deferredTexture();
        const owned = new Set<THREE.Texture>();
        const loader = { loadAsync: vi.fn((url: string) => url.includes('curtain-wall') ? facadeLoad.promise : roofLoad.promise) };
        const materials = createCityMaterials(loader, owned, () => false);
        const facade = new THREE.Texture(), roof = new THREE.Texture();
        const settled = vi.fn();
        void materials.ready.then(settled);
        facadeLoad.resolve(facade);
        await facadeLoad.promise;
        expect(settled).not.toHaveBeenCalled();
        roofLoad.resolve(roof);
        await materials.ready;
        expect(loader.loadAsync.mock.calls.map(([url]) => url)).toEqual(['/textures/city/curtain-wall.png', '/textures/city/roof-mineral.png']);
        expect(materials.facade.map).toBe(facade);
        expect(materials.structure.map).toBe(roof);
        expect(materials.structure.bumpMap).toBe(roof);
        expect(materials.structure.bumpScale).toBeLessThan(.01);
        expect(materials.structure.roughness).toBeGreaterThan(.85);
        expect(materials.structure.metalness).toBe(0);
        expect(materials.facade.emissiveIntensity).toBeLessThan(.3);
        for (const texture of [facade, roof]) {
            expect(owned.has(texture)).toBe(true);
            expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
            expect(texture.wrapS).toBe(THREE.RepeatWrapping);
            expect(texture.wrapT).toBe(THREE.RepeatWrapping);
            expect(texture.generateMipmaps).toBe(true);
            expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
        }
        dispose(materials, owned);
    });

    it('disposes late loads after the room has closed instead of reviving disposed materials', async () => {
        let closed = false;
        const facadeLoad = deferredTexture(), roofLoad = deferredTexture();
        const owned = new Set<THREE.Texture>();
        const materials = createCityMaterials({ loadAsync: url => url.includes('curtain-wall') ? facadeLoad.promise : roofLoad.promise }, owned, () => closed);
        const facade = new THREE.Texture(), roof = new THREE.Texture();
        const disposedFacade = vi.spyOn(facade, 'dispose'), disposedRoof = vi.spyOn(roof, 'dispose');
        closed = true;
        dispose(materials, owned);
        facadeLoad.resolve(facade); roofLoad.resolve(roof);
        await materials.ready;
        expect(disposedFacade).toHaveBeenCalledOnce();
        expect(disposedRoof).toHaveBeenCalledOnce();
        expect(materials.facade.map).toBeNull();
        expect(materials.structure.map).toBeNull();
        expect(owned.has(facade)).toBe(false);
        expect(owned.has(roof)).toBe(false);
    });

    it('propagates failed photo loading to the room readiness promise', async () => {
        const owned = new Set<THREE.Texture>();
        const failure = new Error('city photo unavailable');
        const materials = createCityMaterials({ loadAsync: async url => {
            if (url.includes('curtain-wall')) throw failure;
            return new THREE.Texture();
        } }, owned, () => false);
        await expect(materials.ready).rejects.toBe(failure);
        dispose(materials, owned);
    });
});
