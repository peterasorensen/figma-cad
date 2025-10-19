import { ShapeFactory } from './client/src/shapes/ShapeFactory.js';
import { ShapeManager } from './client/src/shapes/ShapeManager.js';

console.log('Testing complex shape creation...');

// Create a shape factory and manager
const factory = new ShapeFactory();
const scene = { add: () => {}, remove: () => {} }; // Mock scene
const shapeManager = new ShapeManager(scene);

// Test creating complex shapes
const shapesToTest = [
  { type: 'torus', properties: { radius: 1, tube: 0.4 } },
  { type: 'torusKnot', properties: { radius: 1, tube: 0.4 } },
  { type: 'dodecahedron', properties: { radius: 1 } },
  { type: 'icosahedron', properties: { radius: 1 } },
  { type: 'octahedron', properties: { radius: 1 } },
  { type: 'tetrahedron', properties: { radius: 1 } },
  { type: 'tube', properties: { radius: 0.5, tubularSegments: 20, radialSegments: 8 } }
];

shapesToTest.forEach(({ type, properties }) => {
  try {
    console.log(`\nTesting ${type} shape creation...`);

    // Test direct factory creation
    const shape = factory[`create${type.charAt(0).toUpperCase() + type.slice(1)}`](0, 1, 0, null, properties);
    console.log(`✓ Factory created ${type} shape successfully!`);
    console.log(`  Shape ID: ${shape.id}`);
    console.log(`  Shape type: ${shape.type}`);
    console.log(`  Mesh geometry type: ${shape.mesh.geometry.type}`);
    console.log(`  Mesh material type: ${shape.mesh.material.type}`);

    // Test ShapeManager creation
    const managerShape = shapeManager.createShape(type, { x: 0, y: 1, z: 0 }, properties);
    console.log(`✓ ShapeManager created ${type} shape successfully!`);
    console.log(`  Shape ID: ${managerShape.id}`);
    console.log(`  Shape type: ${managerShape.type}`);

  } catch (error) {
    console.error(`❌ Error creating ${type} shape:`, error);
  }
});

console.log('\nAll complex shape tests completed!');
