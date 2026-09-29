import * as THREE from 'three';

// Match the exported kit contract: metres, Y-up, centred footprint and a ground-level origin.
// The nested high-detail meshes also exercise the loader's handling of node transforms.
export const NEO_CITY_FIXTURE_MODELS = [
    { id: 'lg-a-core', size: new THREE.Vector3(48, 180, 38) },
    { id: 'lg-a-a', size: new THREE.Vector3(38, 140, 34) },
    { id: 'lg-a-b', size: new THREE.Vector3(44, 160, 30) },
    { id: 'lg-b', size: new THREE.Vector3(54, 200, 42) },
    { id: 'lg-c', size: new THREE.Vector3(40, 150, 36) },
    { id: 'md-a', size: new THREE.Vector3(28, 90, 24) },
    { id: 'md-b', size: new THREE.Vector3(32, 110, 28) },
    { id: 'md-c', size: new THREE.Vector3(36, 120, 26) },
];

export function createNeoCityFixture(): THREE.Group {
    const source = new THREE.Group();
    for (const { id, size } of NEO_CITY_FIXTURE_MODELS) {
        const material = new THREE.MeshStandardMaterial();
        for (const detail of ['high', 'medium']) {
            const level = new THREE.Group(); level.name = `${id}-${detail}`;
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z, detail === 'high' ? 2 : 1), material);
            mesh.name = 'facade';
            if (detail === 'high') {
                const nested = new THREE.Group(); nested.position.y = size.y / 4;
                mesh.position.y = size.y / 4; nested.add(mesh); level.add(nested);
            } else {
                mesh.position.y = size.y / 2; level.add(mesh);
            }
            source.add(level);
        }
    }
    return source;
}
