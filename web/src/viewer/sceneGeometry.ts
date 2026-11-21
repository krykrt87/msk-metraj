// El3 → three.js geometrisi (çekirdek three; WebGPU ve WebGL görüntüleyici aynı sınıfları kullanır).
import * as THREE from 'three';
import type { El3 } from '@shared/model3d';
import { ribbonPositions, splitShapes } from './geometry';

function shapeOf(outer: [number, number][], holes: [number, number][][]) {
  const s = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return s;
}

export function geometryOf(e: El3): THREE.BufferGeometry | null {
  if ((e.kind === 'prism' || e.kind === 'flat') && e.loops?.length) {
    const shapes = splitShapes(e.loops).map((s) => shapeOf(s.outer, s.holes));
    if (!shapes.length) return null;
    if (e.kind === 'flat') {
      const g = new THREE.ShapeGeometry(shapes);
      g.translate(0, 0, e.z0);
      return g;
    }
    const g = new THREE.ExtrudeGeometry(shapes, { depth: Math.max(0.01, e.z1 - e.z0), bevelEnabled: false });
    g.translate(0, 0, e.z0);
    return g;
  }
  if (e.kind === 'ribbon' && e.path && e.path.length >= 2) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(ribbonPositions(e.path, !!e.closed, e.z0, e.z1), 3));
    g.computeVertexNormals();
    return g;
  }
  if (e.kind === 'pin' && e.path?.length) {
    const h = Math.max(0.2, e.z1 - e.z0);
    const g = new THREE.CylinderGeometry(0.14, 0.14, h, 10);
    g.rotateX(Math.PI / 2);
    g.translate(e.path[0][0], e.path[0][1], e.z0 + h / 2);
    return g;
  }
  return null;
}

