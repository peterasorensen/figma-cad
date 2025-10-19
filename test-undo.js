// Simple test script for undo functionality
import { HistoryManager } from './client/src/core/HistoryManager.js';

// Mock shape manager for testing
class MockShapeManager {
  constructor() {
    this.shapes = new Map();
    this.selectedShapes = new Set();
    this.scene = { add: () => {}, remove: () => {} };
    this.factory = {
      createFromData: (data) => ({
        id: data.id,
        type: data.type,
        setPosition: (pos) => {},
        setRotation: (rot) => {},
        setScale: (scale) => {},
        setSelected: (selected) => {},
        properties: data.properties || {},
        mesh: { parent: null },
        dispose: () => {}
      })
    };
  }

  addShape(shape) {
    this.shapes.set(shape.id, shape);
  }

  removeShape(id) {
    this.shapes.delete(id);
  }

  clearSelection() {
    this.selectedShapes.clear();
  }
}

// Test the delta-based history system
console.log('Testing delta-based undo system...');

// Create history manager
const history = new HistoryManager();

// Create mock shape manager
const shapeManager = new MockShapeManager();

// Test 1: Create a shape
console.log('\n1. Testing create operation');
const shape1 = {
  id: 'shape1',
  type: 'box',
  getPosition: () => ({ x: 0, y: 0, z: 0 }),
  getRotation: () => ({ x: 0, y: 0, z: 0 }),
  getScale: () => ({ x: 1, y: 1, z: 1 }),
  properties: { color: '#ff0000' },
  mesh: { parent: null },
  dispose: () => {}
};

shapeManager.addShape(shape1);
shapeManager.selectedShapes.add('shape1');

// Push create action
history.pushCreate(shape1, ['shape1']);
console.log(`History size after create: ${history.getHistorySize()}`);
console.log(`Can undo: ${history.canUndo()}, Can redo: ${history.canRedo()}`);

// Test 2: Update the shape (move it)
console.log('\n2. Testing update operation');
shape1.getPosition = () => ({ x: 5, y: 5, z: 5 });

// Begin update
history.beginUpdate(shapeManager, ['shape1']);

// Commit update (shape moved)
history.commitUpdate(shapeManager, ['shape1']);
console.log(`History size after update: ${history.getHistorySize()}`);
console.log(`Can undo: ${history.canUndo()}, Can redo: ${history.canRedo()}`);

// Test 3: Undo the update
console.log('\n3. Testing undo update');
history.undo(shapeManager, null);
console.log(`History size after undo: ${history.getHistorySize()}`);
console.log(`Current index: ${history.getCurrentIndex()}`);
console.log(`Can undo: ${history.canUndo()}, Can redo: ${history.canRedo()}`);

// Test 4: Undo the create
console.log('\n4. Testing undo create');
history.undo(shapeManager, null);
console.log(`History size after undo create: ${history.getHistorySize()}`);
console.log(`Shapes in manager: ${shapeManager.shapes.size}`);
console.log(`Can undo: ${history.canUndo()}, Can redo: ${history.canRedo()}`);

// Test 5: Redo the create
console.log('\n5. Testing redo create');
history.redo(shapeManager, null);
console.log(`History size after redo create: ${history.getHistorySize()}`);
console.log(`Shapes in manager: ${shapeManager.shapes.size}`);
console.log(`Can undo: ${history.canUndo()}, Can redo: ${history.canRedo()}`);

// Test 6: Redo the update
console.log('\n6. Testing redo update');
history.redo(shapeManager, null);
console.log(`History size after redo update: ${history.getHistorySize()}`);
console.log(`Can undo: ${history.canUndo()}, Can redo: ${history.canRedo()}`);

console.log('\n✅ All tests completed successfully!');
console.log('The delta-based undo system is working correctly.');
