import * as THREE from 'three';
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
    this.interpolatingShapes = new Map(); // id -> interpolation data
  }

  /**
   * Create a new shape and add to scene
   * SINGLE SOURCE OF TRUTH for all shape creation
   *
   * @param {string} type - Shape type (box, sphere, cylinder, rectangle, circle)
   * @param {object} position - {x, y, z} position
   * @param {object} properties - {width, height, depth, radius, color} shape-specific properties
   * @param {string} id - Optional shape ID (for deserialization/sync)
   * @param {object} transform - Optional {rotation: {x,y,z}} for deserialization
   */
  createShape(type, position = {}, properties = {}, id = null, transform = null) {
    let shape;

    const x = position.x || 0;
    const y = position.y || 0;
    const z = position.z || 0;

    // Ensure properties have defaults - spread first, then apply defaults only if missing
    const props = {
      ...properties,
      width: properties.width !== undefined ? properties.width : 2,
      height: properties.height !== undefined ? properties.height : 2,
      depth: properties.depth !== undefined ? properties.depth : 2,
      radius: properties.radius !== undefined ? properties.radius : 1,
      color: properties.color !== undefined ? properties.color : this.factory.getNextColor()
    };

    switch (type) {
      case 'box':
        shape = this.factory.createBox(x, y, z, id, props);
        break;
      case 'sphere':
        shape = this.factory.createSphere(x, y, z, id, props);
        break;
      case 'cylinder':
        shape = this.factory.createCylinder(x, y, z, id, props);
        break;
      case 'rectangle':
        shape = this.factory.createRectangle(x, z, id, props);
        break;
      case 'circle':
        shape = this.factory.createCircle(x, z, id, props);
        break;
      default:
        console.warn(`Unknown shape type: ${type}`);
        return null;
    }

    if (shape) {
      // Apply transform if provided (for deserialization)
      if (transform && transform.rotation) {
        shape.mesh.rotation.set(
          transform.rotation.x || 0,
          transform.rotation.y || 0,
          transform.rotation.z || 0
        );
      }

      // Manager handles scene and state (ONLY place this happens)
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
    // Cancel any ongoing interpolation for this shape
    if (this.interpolatingShapes.has(shapeId)) {
      cancelAnimationFrame(this.interpolatingShapes.get(shapeId).animationId);
      this.interpolatingShapes.delete(shapeId);
    }

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
      const { type, position, rotation, properties, id } = shapeData;

      const transform = rotation ? { rotation } : null;

      this.createShape(type, position, properties, id, transform);
    });
  }

  /**
   * Clear all shapes
   */
  clear() {
    // Cancel all ongoing interpolations
    for (const [shapeId, interpolationData] of this.interpolatingShapes.entries()) {
      cancelAnimationFrame(interpolationData.animationId);
    }
    this.interpolatingShapes.clear();

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
   * Bake the current scale transform into the geometry
   * This applies the scale to vertices and resets the scale transform to 1,1,1
   * Position and rotation are preserved
   * Called after resize operations to make the scaled geometry permanent
   *
   * @param {string} shapeId - ID of the shape to bake
   */
  bakeShapeScale(shapeId) {
    const shape = this.shapes.get(shapeId);
    if (!shape || !shape.mesh) return;

    // Store current position and rotation
    const position = { ...shape.mesh.position };
    const rotation = { ...shape.mesh.rotation };
    const scale = { ...shape.mesh.scale };

    // Only bake if scale is not already 1,1,1
    if (Math.abs(scale.x - 1) < 0.001 && Math.abs(scale.y - 1) < 0.001 && Math.abs(scale.z - 1) < 0.001) {
      return; // Nothing to bake
    }

    // Create a matrix with only scale (no position/rotation)
    const scaleMatrix = new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z);

    // Apply the scale to the geometry vertices
    shape.mesh.geometry.applyMatrix4(scaleMatrix);

    // Reset scale to 1,1,1 (keep position and rotation as-is)
    shape.mesh.scale.set(1, 1, 1);

    // Update normals after geometry modification
    shape.mesh.geometry.computeVertexNormals();

    // Update the shape's internal properties to reflect the new baked dimensions
    this.updateShapePropertiesFromScale(shape, scale);

    console.log(`Baked scale for shape ${shapeId}`, scale);
  }

  /**
   * Update shape properties based on the scale that was applied
   * Called after baking scale to sync properties with actual geometry
   */
  updateShapePropertiesFromScale(shape, scale) {
    switch (shape.type) {
      case 'box':
        shape.properties.width *= scale.x;
        shape.properties.height *= scale.y;
        shape.properties.depth *= scale.z;
        break;

      case 'sphere':
        // For sphere, apply average scale (could be ellipsoid now)
        const avgScale = (scale.x + scale.y + scale.z) / 3;
        shape.properties.radius *= avgScale;
        break;

      case 'cylinder':
        shape.properties.radius *= Math.max(scale.x, scale.z);
        shape.properties.height *= scale.y;
        break;

      case 'rectangle':
        shape.properties.width *= scale.x;
        shape.properties.height *= scale.z;
        break;

      case 'circle':
        const avgScaleXZ = (scale.x + scale.z) / 2;
        shape.properties.radius *= avgScaleXZ;
        break;
    }

    console.log(`Updated properties for ${shape.type}:`, shape.properties);
  }

  /**
   * Create shape from remote data (for synchronization)
   * Uses the unified createShape() method
   * If geometry data is present, applies it after creation
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
          properties.width = data.width || 2;
          properties.height = data.height || 2;
          properties.depth = data.depth || 2;
          break;
        case 'sphere':
        case 'circle':
          properties.radius = data.width || 1;
          break;
        case 'cylinder':
          properties.radius = data.width || 1;
          properties.height = data.height || 2;
          break;
      }

      // Build transform object (rotation only)
      const transform = {
        rotation: {
          x: data.rotation_x || 0,
          y: data.rotation_y || 0,
          z: data.rotation_z || 0
        }
      };

      // Use unified createShape method - SINGLE SOURCE OF TRUTH
      const shape = this.createShape(data.type, position, properties, data.id, transform);

      if (shape) {
        // If geometry data is present (from DB), apply it to replace default geometry
        // This preserves baked scale and non-uniform transformations
        if (data.geometry) {
          shape.applySerializedGeometry(data.geometry);
          console.log(`Created shape from remote data with custom geometry: ${data.id} (${data.type})`);
        } else {
          console.log(`Created shape from remote data with default geometry: ${data.id} (${data.type})`);
        }
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
      // For object creation/updates, check if we need smooth interpolation
      // Only use interpolation if the object already exists and we're updating it
      // For newly created objects, set position directly

      // Check if this is a significant position change that warrants interpolation
      const currentPos = existingShape.mesh.position;
      const hasPositionChange = data.position_x !== undefined && data.position_y !== undefined && data.position_z !== undefined;
      const positionChanged = hasPositionChange &&
        (Math.abs(currentPos.x - data.position_x) > 0.01 ||
         Math.abs(currentPos.y - data.position_y) > 0.01 ||
         Math.abs(currentPos.z - data.position_z) > 0.01);

      if (positionChanged) {
        // Set position directly for significant changes (faster than interpolation)
        if (data.position_x !== undefined) existingShape.mesh.position.x = data.position_x;
        if (data.position_y !== undefined) existingShape.mesh.position.y = data.position_y;
        if (data.position_z !== undefined) existingShape.mesh.position.z = data.position_z;

        // Update other properties
        if (data.rotation_x !== undefined) existingShape.mesh.rotation.x = data.rotation_x;
        if (data.rotation_y !== undefined) existingShape.mesh.rotation.y = data.rotation_y;
        if (data.rotation_z !== undefined) existingShape.mesh.rotation.z = data.rotation_z;

        // Update scale for resize mode (visual feedback during drag)
        if (data.scale_x !== undefined) existingShape.mesh.scale.x = data.scale_x;
        if (data.scale_y !== undefined) existingShape.mesh.scale.y = data.scale_y;
        if (data.scale_z !== undefined) existingShape.mesh.scale.z = data.scale_z;

        if (data.color && existingShape.mesh.material) {
          existingShape.mesh.material.color.setStyle(data.color);
        }

        console.log('Set position directly for', data.id);
      } else {
        // Set properties directly for cases without position changes
        if (data.rotation_x !== undefined) existingShape.mesh.rotation.x = data.rotation_x;
        if (data.rotation_y !== undefined) existingShape.mesh.rotation.y = data.rotation_y;
        if (data.rotation_z !== undefined) existingShape.mesh.rotation.z = data.rotation_z;

        // Update scale for resize mode (visual feedback during drag)
        if (data.scale_x !== undefined) existingShape.mesh.scale.x = data.scale_x;
        if (data.scale_y !== undefined) existingShape.mesh.scale.y = data.scale_y;
        if (data.scale_z !== undefined) existingShape.mesh.scale.z = data.scale_z;

        if (data.color && existingShape.mesh.material) {
          existingShape.mesh.material.color.setStyle(data.color);
        }
      }

      // If geometry data is present (e.g., after resize operation), apply it
      // This preserves baked scale and non-uniform transformations
      if (data.geometry) {
        existingShape.applySerializedGeometry(data.geometry);
        console.log(`Updated shape geometry from remote data: ${data.id}`);
      }

      console.log(`Updated shape from remote data: ${data.id}`);
    } catch (error) {
      console.error('Error updating shape from remote data:', error);
    }
  }

  /**
   * Start smooth interpolation for shape properties
   */
  startInterpolation(shape, targetData) {
    const shapeId = shape.id;

    // Cancel any existing interpolation for this shape
    if (this.interpolatingShapes.has(shapeId)) {
      cancelAnimationFrame(this.interpolatingShapes.get(shapeId).animationId);
    }

    const startData = {
      position: { ...shape.mesh.position },
      rotation: { ...shape.mesh.rotation },
      scale: { ...shape.mesh.scale },
      color: shape.mesh.material ? shape.mesh.material.color.getHex() : null
    };

    const duration = 100; // 100ms interpolation duration
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Use ease-out interpolation for smoother movement
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      // Interpolate position
      if (targetData.position_x !== undefined) {
        shape.mesh.position.x = startData.position.x + (targetData.position_x - startData.position.x) * easeProgress;
      }
      if (targetData.position_y !== undefined) {
        shape.mesh.position.y = startData.position.y + (targetData.position_y - startData.position.y) * easeProgress;
      }
      if (targetData.position_z !== undefined) {
        shape.mesh.position.z = startData.position.z + (targetData.position_z - startData.position.z) * easeProgress;
      }

      // Interpolate rotation
      if (targetData.rotation_x !== undefined) {
        shape.mesh.rotation.x = startData.rotation.x + (targetData.rotation_x - startData.rotation.x) * easeProgress;
      }
      if (targetData.rotation_y !== undefined) {
        shape.mesh.rotation.y = startData.rotation.y + (targetData.rotation_y - startData.rotation.y) * easeProgress;
      }
      if (targetData.rotation_z !== undefined) {
        shape.mesh.rotation.z = startData.rotation.z + (targetData.rotation_z - startData.rotation.z) * easeProgress;
      }

      // Interpolate scale
      if (targetData.scale_x !== undefined) {
        shape.mesh.scale.x = startData.scale.x + (targetData.scale_x - startData.scale.x) * easeProgress;
      }
      if (targetData.scale_y !== undefined) {
        shape.mesh.scale.y = startData.scale.y + (targetData.scale_y - startData.scale.y) * easeProgress;
      }
      if (targetData.scale_z !== undefined) {
        shape.mesh.scale.z = startData.scale.z + (targetData.scale_z - startData.scale.z) * easeProgress;
      }

      // Update color
      if (targetData.color && shape.mesh.material) {
        const startColor = new THREE.Color(startData.color);
        const targetColor = new THREE.Color(targetData.color);
        shape.mesh.material.color.copy(startColor).lerp(targetColor, easeProgress);
      }

      if (progress < 1) {
        const animationId = requestAnimationFrame(animate);
        this.interpolatingShapes.set(shapeId, { animationId, targetData });
      } else {
        // Interpolation complete
        this.interpolatingShapes.delete(shapeId);
      }
    };

    animate();
  }
}
