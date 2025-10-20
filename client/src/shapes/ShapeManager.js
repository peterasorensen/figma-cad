import * as THREE from 'three';
import { ShapeFactory } from './ShapeFactory.js';
import { Shape } from './Shape.js';

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
   * @param {string} type - Shape type (box, sphere, cylinder, rectangle, circle) - only used if no geometry provided
   * @param {object} position - {x, y, z} position
   * @param {object} properties - {width, height, depth, radius, color} shape-specific properties (ignored if geometry provided)
   * @param {string} id - Optional shape ID (for deserialization/sync)
   * @param {object} transform - Optional {rotation: {x,y,z}} for deserialization
   * @param {THREE.BufferGeometry} geometry - Optional pre-built geometry (for remote sync - avoids double allocation)
   */
  createShape(type, position = {}, properties = {}, id = null, transform = null, geometry = null) {
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
      tube: properties.tube !== undefined ? properties.tube : 0.4,
      tubularSegments: properties.tubularSegments !== undefined ? properties.tubularSegments : 20,
      radialSegments: properties.radialSegments !== undefined ? properties.radialSegments : 8,
      color: properties.color !== undefined ? properties.color : this.factory.getNextColor()
    };

    // If geometry is provided, create shape directly from it (remote sync path)
    if (geometry) {
      shape = this.factory.createFromGeometry(geometry, x, y, z, id, props, type);
    } else {
      // Otherwise create from type (local creation path)
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
        case 'text':
          shape = this.factory.createText(x, y, z, id, props);
          break;
        case 'torus':
          shape = this.factory.createTorus(x, y, z, id, props);
          break;
        case 'torusKnot':
          shape = this.factory.createTorusKnot(x, y, z, id, props);
          break;
        case 'dodecahedron':
          shape = this.factory.createDodecahedron(x, y, z, id, props);
          break;
        case 'icosahedron':
          shape = this.factory.createIcosahedron(x, y, z, id, props);
          break;
        case 'octahedron':
          shape = this.factory.createOctahedron(x, y, z, id, props);
          break;
        case 'tetrahedron':
          shape = this.factory.createTetrahedron(x, y, z, id, props);
          break;
        case 'tube':
          shape = this.factory.createTube(x, y, z, id, props);
          break;
        default:
          console.warn(`Unknown shape type: ${type}`);
          return null;
      }
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
      console.log(`Created ${geometry ? 'shape from geometry' : type} with id: ${shape.id}`);
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
   * Invalidate cached data after geometry modifications
   * Called after baking scale into geometry
   */
  updateShapePropertiesFromScale(shape, scale) {
    // Invalidate snap cache since geometry changed
    if (shape._snapCache) {
      delete shape._snapCache;
    }

    // Geometry is the single source of truth - no type-specific properties needed
    console.log(`Baked scale into geometry for shape ${shape.id}:`, scale);
  }

  /**
   * Create shape from remote data (for synchronization)
   * If geometry is present, uses it directly. Otherwise falls back to creating from type/properties.
   */
  createShapeFromData(data) {
    try {
      const position = {
        x: data.position_x || 0,
        y: data.position_y || 0,
        z: data.position_z || 0
      };

      const transform = {
        rotation: {
          x: data.rotation_x || 0,
          y: data.rotation_y || 0,
          z: data.rotation_z || 0
        }
      };

      // Build properties from database columns
      const properties = {
        color: data.color || '#ffffff',
        width: data.width,
        height: data.height,
        depth: data.depth
      };

      // For text shapes, extract text from geometry if it exists
      if (data.type === 'text' && data.geometry) {
        try {
          const geometryData = JSON.parse(data.geometry);
          if (geometryData.text) {
            properties.text = geometryData.text;
            properties.fontSize = geometryData.fontSize || 16;
          }
        } catch (e) {
          console.warn('Failed to parse text geometry data:', e);
        }
      }

      let shape;

      // If geometry is present, try to use it (preferred path for existing shapes)
      if (data.geometry && data.geometry !== '') {
        try {
          // Deserialize geometry first (static method, no shape instance needed)
          const geometry = Shape.deserializeGeometry(data.geometry);

          if (geometry) {
            // Create shape directly from geometry (avoids double allocation)
            shape = this.createShape(data.type, position, properties, data.id, transform, geometry);
            console.log(`✓ Created shape from geometry: ${data.id}`);
          }
        } catch (error) {
          console.warn(`Failed to deserialize geometry for shape ${data.id}, falling back to type-based creation:`, error);
        }
      }

      // If geometry creation failed or no geometry provided, create from type (fallback path)
      if (!shape) {
        shape = this.createShape(data.type, position, properties, data.id, transform, null);
        if (shape) {
          console.log(`✓ Created shape from type (no geometry): ${data.id}`);

          // For AI-created shapes, we need to serialize and store the geometry
          // so it persists in the database for future sessions
          setTimeout(() => {
            this.updateShapeGeometryInDatabase(shape);
          }, 100); // Small delay to ensure shape is fully initialized
        }
      }

      return shape;
    } catch (error) {
      console.error('Error creating shape from data:', error);
      return null;
    }
  }

  /**
   * Update shape geometry in database (for AI-created shapes that need geometry persistence)
   */
  updateShapeGeometryInDatabase(shape) {
    if (!shape || !shape.mesh) return;

    try {
      const geometryData = shape.serializeGeometry();
      if (!geometryData) {
        console.warn('Failed to serialize geometry for shape:', shape.id);
        return;
      }

      // Send only the geometry data to update the database record
      const updateData = {
        geometry: geometryData
      };

      // Import socketManager dynamically to avoid circular imports
      import('../core/network/SocketManager.js').then(({ socketManager }) => {
        if (socketManager.isConnected) {
          socketManager.updateObject(shape.id, updateData);
          console.log('📤 Updated geometry in database for AI-created shape:', shape.id);
        }
      });
    } catch (error) {
      console.error('Error updating shape geometry in database:', error);
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
      // Check if this is a significant position change that warrants interpolation
      const currentPos = existingShape.mesh.position;
      const hasPositionChange = data.position_x !== undefined && data.position_y !== undefined && data.position_z !== undefined;
      const positionChanged = hasPositionChange &&
        (Math.abs(currentPos.x - data.position_x) > 0.01 ||
         Math.abs(currentPos.y - data.position_y) > 0.01 ||
         Math.abs(currentPos.z - data.position_z) > 0.01);

      if (positionChanged) {
        // Use smooth interpolation for significant position changes to prevent jumpy movement
        const targetData = {
          position_x: data.position_x,
          position_y: data.position_y,
          position_z: data.position_z
        };

        this.startInterpolation(existingShape, targetData);
      } else {
        // For non-significant changes or no position changes, set position directly
        if (data.position_x !== undefined) existingShape.mesh.position.x = data.position_x;
        if (data.position_y !== undefined) existingShape.mesh.position.y = data.position_y;
        if (data.position_z !== undefined) existingShape.mesh.position.z = data.position_z;
      }

      // Always update other properties immediately (rotation, scale, color don't need interpolation)
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

      // If geometry data is present (e.g., after resize operation), apply it
      // This preserves baked scale and non-uniform transformations
      if (data.geometry) {
        existingShape.applySerializedGeometry(data.geometry);
      }
    } catch (error) {
      console.error('Error updating shape from remote data:', error);
    }
  }

  /**
   * Start smooth interpolation for shape properties
   * @param {Shape} shape - The shape to interpolate
   * @param {object} targetData - Target values for interpolation
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

    const duration = 50; // 50ms for smooth, responsive interpolation
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Linear interpolation for smooth, responsive movement
      const easeProgress = progress;

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
        shape.mesh.scale.z = startData.scale.z + (targetData.scale.z - startData.scale.z) * easeProgress;
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
