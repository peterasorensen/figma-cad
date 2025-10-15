import { ShapeFactory } from './ShapeFactory.js';

/**
 * Manages all shapes in the scene
 * Handles creation, selection, deletion, and state management
 */
export class ShapeManager {
  constructor(scene) {
    this.scene = scene;
    this.factory = new ShapeFactory();
    this.shapes = new Map(); // id -> Shape
    this.selectedShapes = new Set(); // Set of selected shape IDs
  }

  /**
   * Create a new shape and add to scene
   */
  createShape(type, position = {}, properties = {}) {
    let shape;

    const x = position.x || 0;
    const y = position.y || 0;
    const z = position.z || 0;

    switch (type) {
      case 'box':
        shape = this.factory.createBox(x, y, z);
        break;
      case 'sphere':
        shape = this.factory.createSphere(x, y, z);
        break;
      case 'cylinder':
        shape = this.factory.createCylinder(x, y, z);
        break;
      case 'rectangle':
        shape = this.factory.createRectangle(x, z);
        break;
      case 'circle':
        shape = this.factory.createCircle(x, z);
        break;
      default:
        console.warn(`Unknown shape type: ${type}`);
        return null;
    }

    if (shape) {
      this.shapes.set(shape.id, shape);
      this.scene.add(shape.mesh);
      console.log(`Created ${type} with id: ${shape.id}`);
    }

    return shape;
  }

  /**
   * Remove a shape from the scene
   */
  removeShape(shapeId) {
    const shape = this.shapes.get(shapeId);
    if (shape) {
      this.scene.remove(shape.mesh);
      shape.dispose();
      this.shapes.delete(shapeId);
      this.selectedShapes.delete(shapeId);
      console.log(`Removed shape: ${shapeId}`);
      return true;
    }
    return false;
  }

  /**
   * Get shape by ID
   */
  getShape(shapeId) {
    return this.shapes.get(shapeId);
  }

  /**
   * Get all shapes
   */
  getAllShapes() {
    return Array.from(this.shapes.values());
  }

  /**
   * Select a shape
   */
  selectShape(shapeId, addToSelection = false) {
    if (!addToSelection) {
      this.clearSelection();
    }

    const shape = this.shapes.get(shapeId);
    if (shape) {
      this.selectedShapes.add(shapeId);
      shape.setSelected(true);
      console.log(`Selected shape: ${shapeId}`);
    }
  }

  /**
   * Deselect a shape
   */
  deselectShape(shapeId) {
    const shape = this.shapes.get(shapeId);
    if (shape) {
      this.selectedShapes.delete(shapeId);
      shape.setSelected(false);
      console.log(`Deselected shape: ${shapeId}`);
    }
  }

  /**
   * Clear all selections
   */
  clearSelection() {
    this.selectedShapes.forEach(shapeId => {
      const shape = this.shapes.get(shapeId);
      if (shape) {
        shape.setSelected(false);
      }
    });
    this.selectedShapes.clear();
  }

  /**
   * Get selected shapes
   */
  getSelectedShapes() {
    return Array.from(this.selectedShapes).map(id => this.shapes.get(id));
  }

  /**
   * Delete selected shapes
   */
  deleteSelected() {
    const toDelete = Array.from(this.selectedShapes);
    toDelete.forEach(shapeId => {
      this.removeShape(shapeId);
    });
    console.log(`Deleted ${toDelete.length} shape(s)`);
    return toDelete; // Return array of deleted IDs for broadcasting
  }

  /**
   * Duplicate selected shapes
   */
  duplicateSelected() {
    const selected = this.getSelectedShapes();
    this.clearSelection();

    const newShapes = [];
    selected.forEach(shape => {
      const cloned = shape.clone();
      // Offset position slightly
      cloned.mesh.position.x += 1;
      cloned.mesh.position.z += 1;

      this.shapes.set(cloned.id, cloned);
      this.scene.add(cloned.mesh);
      this.selectShape(cloned.id, true);
      newShapes.push(cloned);
    });

    console.log(`Duplicated ${newShapes.length} shape(s)`);
    return newShapes;
  }

  /**
   * Find shape by mesh (for raycasting)
   */
  findShapeByMesh(mesh) {
    const shapeId = mesh.userData.shapeId;
    if (shapeId) {
      return this.shapes.get(shapeId);
    }
    return null;
  }

  /**
   * Export all shapes to JSON
   */
  exportToJSON() {
    return Array.from(this.shapes.values()).map(shape => shape.toJSON());
  }

  /**
   * Import shapes from JSON
   */
  importFromJSON(data) {
    data.forEach(shapeData => {
      const shape = this.factory.createFromData(shapeData);
      if (shape) {
        this.shapes.set(shape.id, shape);
        this.scene.add(shape.mesh);
      }
    });
  }

  /**
   * Clear all shapes
   */
  clear() {
    this.shapes.forEach(shape => {
      this.scene.remove(shape.mesh);
      shape.dispose();
    });
    this.shapes.clear();
    this.selectedShapes.clear();
  }

  /**
   * Get shape count
   */
  getShapeCount() {
    return this.shapes.size;
  }

  /**
   * Create shape from remote data (for synchronization)
   */
  createShapeFromData(data) {
    try {
      const position = {
        x: data.position_x || 0,
        y: data.position_y || 0,
        z: data.position_z || 0
      };

      // Map generic properties to shape-specific properties
      const properties = {
        color: data.color || '#ffffff'
      };

      // Add shape-specific properties based on type
      switch (data.type) {
        case 'box':
        case 'rectangle':
          properties.width = data.width || 100;
          properties.height = data.height || 100;
          properties.depth = data.depth || 100;
          break;
        case 'sphere':
        case 'circle':
          properties.radius = data.width || 100; // Use width as radius for spheres/circles
          break;
        case 'cylinder':
          properties.radius = data.width || 100; // Use width as radius
          properties.height = data.height || 100;
          break;
      }

      // Create shape using existing method
      const shape = this.createShape(data.type, position, properties);

      if (shape && data.id) {
        // Remove the old entry and add with the correct ID
        this.shapes.delete(shape.id);
        shape.id = data.id;
        this.shapes.set(data.id, shape);

        // Update mesh userData with correct ID
        shape.mesh.userData.shapeId = data.id;

        // Set additional properties
        if (data.rotation_x !== undefined) shape.mesh.rotation.x = data.rotation_x;
        if (data.rotation_y !== undefined) shape.mesh.rotation.y = data.rotation_y;
        if (data.rotation_z !== undefined) shape.mesh.rotation.z = data.rotation_z;
        if (data.scale_x !== undefined) shape.mesh.scale.x = data.scale_x;
        if (data.scale_y !== undefined) shape.mesh.scale.y = data.scale_y;
        if (data.scale_z !== undefined) shape.mesh.scale.z = data.scale_z;

        console.log(`Created shape from remote data: ${data.id} (${data.type})`);
      }

      return shape;
    } catch (error) {
      console.error('Error creating shape from remote data:', error);
      return null;
    }
  }

  /**
   * Add shape to scene (for synchronization)
   */
  addShapeToScene(shape) {
    if (shape && shape.mesh && !this.scene.children.includes(shape.mesh)) {
      this.scene.add(shape.mesh);
      // Only set if not already in map (prevents overwriting existing shapes)
      if (!this.shapes.has(shape.id)) {
        this.shapes.set(shape.id, shape);
      }
      console.log(`Added shape to scene: ${shape.id}`);
    }
  }

  /**
   * Update shape from remote data (for synchronization)
   */
  updateShapeFromData(existingShape, data) {
    if (!existingShape || !existingShape.mesh) return;

    try {
      // Update position
      if (data.position_x !== undefined) existingShape.mesh.position.x = data.position_x;
      if (data.position_y !== undefined) existingShape.mesh.position.y = data.position_y;
      if (data.position_z !== undefined) existingShape.mesh.position.z = data.position_z;

      // Update rotation
      if (data.rotation_x !== undefined) existingShape.mesh.rotation.x = data.rotation_x;
      if (data.rotation_y !== undefined) existingShape.mesh.rotation.y = data.rotation_y;
      if (data.rotation_z !== undefined) existingShape.mesh.rotation.z = data.rotation_z;

      // Update scale
      if (data.scale_x !== undefined) existingShape.mesh.scale.x = data.scale_x;
      if (data.scale_y !== undefined) existingShape.mesh.scale.y = data.scale_y;
      if (data.scale_z !== undefined) existingShape.mesh.scale.z = data.scale_z;

      // Update color if it's a material property
      if (data.color && existingShape.mesh.material) {
        existingShape.mesh.material.color.setStyle(data.color);
      }

      console.log(`Updated shape from remote data: ${data.id}`);
    } catch (error) {
      console.error('Error updating shape from remote data:', error);
    }
  }
}
