import { CSG } from 'three-csg-ts';
import * as THREE from 'three';

// Test script for Boolean operations
console.log('Testing Boolean operations...');

// Create two simple geometries for testing
const boxGeometry1 = new THREE.BoxGeometry(2, 2, 2);
const boxGeometry2 = new THREE.BoxGeometry(1, 1, 1);

// Create meshes
const mesh1 = new THREE.Mesh(boxGeometry1);
const mesh2 = new THREE.Mesh(boxGeometry2);

// Position the second box to overlap with the first
mesh2.position.set(0.5, 0.5, 0.5);

// Create CSG objects
const csg1 = CSG.fromMesh(mesh1);
const csg2 = CSG.fromMesh(mesh2);

console.log('CSG objects created successfully');

// Test subtract operation
try {
  const resultCSG = csg1.subtract(csg2);
  const resultMesh = CSG.toMesh(resultCSG, mesh1.matrix);

  console.log('Boolean subtract operation successful!');
  console.log('Result geometry vertices:', resultMesh.geometry.attributes.position.count);
  console.log('Result geometry faces:', resultMesh.geometry.index ? resultMesh.geometry.index.count / 3 : 'N/A');
} catch (error) {
  console.error('Boolean operation failed:', error);
}
