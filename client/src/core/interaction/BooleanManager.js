import * as THREE from 'three';
import { CSG } from 'three-csg-ts';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Manages boolean operations (subtract, union, intersect) between shapes
 */
export class BooleanManager {
  constructor(app) {
    this.app = app;
    this.cuttingObject = null; // The object being used for cutting
    this.isWireframeMode = false;
    this.originalMaterial = null; // Store original material when switching to wireframe
  }

  /**
   * Start boolean subtract mode with a cutting object
   * @param {Shape} cuttingShape - The shape to use as the cutting tool
   */
  startSubtractMode(cuttingShape) {
    if (!cuttingShape || !cuttingShape.mesh) {
      console.error('Invalid cutting shape provided');
      return;
    }

    this.cuttingObject = cuttingShape;

    // Switch to wireframe mode
    this.enableWireframeMode();

    // Attach transform controls to the cutting object
    this.app.transform.attach(cuttingShape.mesh);

    console.log(`Started boolean subtract mode with cutting object: ${cuttingShape.id}`);
  }

  /**
   * Enable wireframe visualization for the cutting object
   */
  enableWireframeMode() {
    if (!this.cuttingObject || !this.cuttingObject.mesh) return;

    // Store original material
    this.originalMaterial = this.cuttingObject.mesh.material.clone();

    // Create wireframe material
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6b6b, // Red color for cutting object
      wireframe: true,
      transparent: true,
      opacity: 0.8
    });

    this.cuttingObject.mesh.material = wireframeMaterial;
    this.isWireframeMode = true;

    console.log('Enabled wireframe mode for cutting object');
  }

  /**
   * Disable wireframe mode and restore original material
   */
  disableWireframeMode() {
    if (!this.cuttingObject || !this.cuttingObject.mesh || !this.originalMaterial) return;

    // Restore original material
    this.cuttingObject.mesh.material = this.originalMaterial;
    this.originalMaterial = null;
    this.isWireframeMode = false;

    console.log('Disabled wireframe mode for cutting object');
  }

  /**
   * Apply boolean subtract operation
   * @param {Shape} targetShape - The shape to be modified (hole will be cut into this)
   * @returns {boolean} - Success status
   */
  applySubtract(targetShape) {
    if (!this.cuttingObject || !targetShape) {
      console.error('Both cutting object and target shape required for subtract operation');
      return false;
    }

    if (this.cuttingObject.id === targetShape.id) {
      console.error('Cannot subtract object from itself');
      return false;
    }

    try {
      console.log(`Applying boolean subtract: cutting ${this.cuttingObject.id} from ${targetShape.id}`);

      // Debug: Log original geometries
      console.log('Target geometry vertices:', targetShape.mesh.geometry.attributes.position.count);
      console.log('Cutting geometry vertices:', this.cuttingObject.mesh.geometry.attributes.position.count);

      // Create CSG objects from meshes
      const targetCSG = CSG.fromMesh(targetShape.mesh.clone());
      const cuttingCSG = CSG.fromMesh(this.cuttingObject.mesh.clone());

      console.log('CSG objects created successfully');

      // Perform subtract operation
      const resultCSG = targetCSG.subtract(cuttingCSG);
      const resultMesh = CSG.toMesh(resultCSG, targetShape.mesh.matrix);

      console.log('CSG operation completed, result geometry vertices:', resultMesh.geometry.attributes.position.count);

      // Validate result geometry
      if (!resultMesh.geometry.attributes.position || resultMesh.geometry.attributes.position.count === 0) {
        console.error('Boolean operation resulted in empty geometry!');
        return false;
      }

      // Check for invalid values
      const positions = resultMesh.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i++) {
        if (!isFinite(positions[i])) {
          console.error(`Invalid position value at index ${i}:`, positions[i]);
          return false;
        }
      }

      // Optimize geometry for storage and performance
      console.log('Optimizing geometry...');
      const originalVertexCount = resultMesh.geometry.attributes.position.count;

      // Remove unused attributes to reduce size
      if (resultMesh.geometry.attributes.uv) {
        resultMesh.geometry.deleteAttribute('uv');
        console.log('Removed UV attributes');
      }
      if (resultMesh.geometry.attributes.color) {
        resultMesh.geometry.deleteAttribute('color');
        console.log('Removed color attributes');
      }

      // Aggressive vertex merging with larger threshold (more aggressive deduplication)
      resultMesh.geometry = mergeVertices(resultMesh.geometry, 1e-4); // Increased from 1e-5 to 1e-4

      // Recompute normals and bounds
      resultMesh.geometry.computeVertexNormals();
      resultMesh.geometry.computeBoundingBox();
      resultMesh.geometry.computeBoundingSphere();

      const optimizedVertexCount = resultMesh.geometry.attributes.position.count;
      console.log(`Geometry optimized: ${originalVertexCount} -> ${optimizedVertexCount} vertices`);
      console.log('Result geometry validation and optimization passed');

      // Copy original material and properties
      resultMesh.material = targetShape.mesh.material.clone();
      resultMesh.position.copy(targetShape.mesh.position);
      resultMesh.rotation.copy(targetShape.mesh.rotation);
      resultMesh.scale.copy(targetShape.mesh.scale);

      // Update the target shape's mesh
      this.app.scene.remove(targetShape.mesh);
      targetShape.mesh = resultMesh;
      this.app.scene.add(resultMesh);

      // Update mesh userData for raycasting
      resultMesh.userData.shapeId = targetShape.id;

      // Update geometry in shape properties
      targetShape.geometry = resultMesh.geometry;

      // Disable wireframe mode
      this.disableWireframeMode();

      // Remove the cutting object from the scene
      this.app.shapeManager.removeShape(this.cuttingObject.id);

      // Clear cutting object reference
      this.cuttingObject = null;

      console.log(`Boolean subtract operation completed successfully`);
      return true;

    } catch (error) {
      console.error('Error performing boolean subtract operation:', error);
      return false;
    }
  }

  /**
   * Cancel the current boolean operation
   */
  cancelOperation() {
    if (this.cuttingObject) {
      this.disableWireframeMode();
      this.cuttingObject = null;
      console.log('Boolean operation cancelled');
    }
  }

  /**
   * Check if currently in boolean subtract mode
   */
  isActive() {
    return this.cuttingObject !== null;
  }

  /**
   * Get the current cutting object
   */
  getCuttingObject() {
    return this.cuttingObject;
  }

  /**
   * Find overlapping shapes that the cutting object intersects with
   * @returns {Array<Shape>} - Array of overlapping shapes
   */
  findOverlappingShapes() {
    if (!this.cuttingObject) return [];

    const overlappingShapes = [];
    const allShapes = this.app.shapeManager.getAllShapes();

    // Create bounding box for cutting object
    const cuttingBox = new THREE.Box3().setFromObject(this.cuttingObject.mesh);

    for (const shape of allShapes) {
      if (shape.id === this.cuttingObject.id) continue;

      // Create bounding box for target shape
      const targetBox = new THREE.Box3().setFromObject(shape.mesh);

      // Check if bounding boxes intersect
      if (cuttingBox.intersectsBox(targetBox)) {
        overlappingShapes.push(shape);
      }
    }

    return overlappingShapes;
  }
}
