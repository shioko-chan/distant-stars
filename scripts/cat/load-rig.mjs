import fs from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
globalThis.ProgressEvent = class {
    constructor(type, fields) { this.type = type; Object.assign(this, fields); }
};

export async function loadRig(path) {
    const bytes = fs.readFileSync(path);
    const jsonLength = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.subarray(20, 20 + jsonLength));
    json.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(28 + jsonLength).toString('base64');
    // Geometry and skin remain available for validation; Node does not need images.
    json.materials = [];
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
    const rig = await new GLTFLoader().parseAsync(JSON.stringify(json), '');
    rig.scene.updateMatrixWorld(true);
    return rig;
}

