import { ShapeFactory } from './client/src/shapes/ShapeFactory.js';

console.log('Testing text shape creation...');

// Create a shape factory
const factory = new ShapeFactory();

// Test creating a text shape
try {
  const textShape = factory.createText(0, 1, 0, null, {
    text: 'Hello World',
    fontSize: 1,
    fontDepth: 0.1,
    color: 0xff0000
  });

  console.log('Text shape created successfully!');
  console.log('Shape ID:', textShape.id);
  console.log('Shape type:', textShape.type);
  console.log('Shape properties:', textShape.properties);
  console.log('Mesh type:', textShape.mesh.type);
  console.log('Material type:', textShape.mesh.material.type);

} catch (error) {
  console.error('Error creating text shape:', error);
}
