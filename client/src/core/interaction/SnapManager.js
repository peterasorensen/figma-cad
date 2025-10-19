import * as THREE from 'three';

/**
 * Snap manager for grid and object snapping
 * Handles snapping objects to grid points and other objects
 */
export class SnapManager {
  constructor(shapeManager) {
    this.shapeManager = shapeManager;
    this.enabled = true;
    this.gridSize = 1.0; // Grid snapping increment
    this.snapDistance = 0.5; // Distance threshold for object snapping
  }

  /**
   * Enable/disable snapping
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Check if snapping is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Set grid size for snapping
   */
  setGridSize(size) {
    this.gridSize = size;
  }

  /**
   * Set snap distance threshold
   */
  setSnapDistance(distance) {
    this.snapDistance = distance;
  }

  /**
   * Snap position to grid
   */
  snapToGrid(position) {
    if (!this.enabled) return position;

    return {
      x: Math.round(position.x / this.gridSize) * this.gridSize,
      y: Math.round(position.y / this.gridSize) * this.gridSize,
      z: Math.round(position.z / this.gridSize) * this.gridSize
    };
  }

  /**
   * Snap position to nearby objects
   */
  snapToObjects(position, excludeShapeId = null) {
    if (!this.enabled) return position;

    let bestSnap = null;
    let bestDistance = this.snapDistance;

    // Get all shapes except the one being moved (if any)
    for (const [id, shape] of this.shapeManager.shapes) {
      if (excludeShapeId && id === excludeShapeId) continue;

      const shapePos = shape.getPosition();
      const shapeScale = shape.getScale();

      // Calculate snap points for this shape
      const snapPoints = this.getShapeSnapPoints(shape);

      for (const snapPoint of snapPoints) {
        const distance = Math.sqrt(
          Math.pow(position.x - snapPoint.x, 2) +
          Math.pow(position.y - snapPoint.y, 2) +
          Math.pow(position.z - snapPoint.z, 2)
        );

        if (distance < bestDistance) {
          bestDistance = distance;
          bestSnap = snapPoint;
        }
      }
    }

    return bestSnap || position;
  }

  /**
   * Get snap points for a shape (center, corners, face centers)
   * Uses generic bounding box - works for any shape regardless of type
   * Handles rotation/scale/position correctly by transforming from local to world space
   * Returns Vector3s for downstream math compatibility
   */
  getShapeSnapPoints(shape) {
    const points = [];
    const mesh = shape?.mesh;
    const geo = mesh?.geometry;
    if (!mesh || !geo) return points;

    // Compute/cache local snap points if not already cached
    if (!shape._snapCache) {
      this.computeSnapCache(shape);
    }

    // If cache failed, return empty
    if (!shape._snapCache) return points;

    // Transform all cached local points to world space
    mesh.updateMatrixWorld(true);

    // Reuse temp vector to avoid GC pressure
    const tmp = new THREE.Vector3();
    const toWorld = (src) => tmp.copy(src).applyMatrix4(mesh.matrixWorld).clone();

    const cache = shape._snapCache;
    points.push(toWorld(cache.centerLocal));
    for (const c of cache.cornersLocal) points.push(toWorld(c));
    for (const fc of cache.facesLocal) points.push(toWorld(fc));

    return points;
  }

  /**
   * Compute and cache local-space snap points for a shape
   * Should be called when geometry changes (creation, bake, boolean ops)
   */
  computeSnapCache(shape) {
    const geo = shape?.mesh?.geometry;
    if (!geo) return;

    // Ensure bbox is up-to-date
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb) return;

    const mins = bb.min, maxs = bb.max;

    // Precompute 8 corners in local space
    const cornersLocal = [
      new THREE.Vector3(mins.x, mins.y, mins.z),
      new THREE.Vector3(maxs.x, mins.y, mins.z),
      new THREE.Vector3(mins.x, maxs.y, mins.z),
      new THREE.Vector3(maxs.x, maxs.y, mins.z),
      new THREE.Vector3(mins.x, mins.y, maxs.z),
      new THREE.Vector3(maxs.x, mins.y, maxs.z),
      new THREE.Vector3(mins.x, maxs.y, maxs.z),
      new THREE.Vector3(maxs.x, maxs.y, maxs.z),
    ];

    // Center in local space
    const centerLocal = new THREE.Vector3().addVectors(mins, maxs).multiplyScalar(0.5);

    // 6 face centers in local space (±X, ±Y, ±Z)
    const facesLocal = [
      new THREE.Vector3(maxs.x, centerLocal.y, centerLocal.z),
      new THREE.Vector3(mins.x, centerLocal.y, centerLocal.z),
      new THREE.Vector3(centerLocal.x, maxs.y, centerLocal.z),
      new THREE.Vector3(centerLocal.x, mins.y, centerLocal.z),
      new THREE.Vector3(centerLocal.x, centerLocal.y, maxs.z),
      new THREE.Vector3(centerLocal.x, centerLocal.y, mins.z),
    ];

    // Cache on shape for reuse
    shape._snapCache = {
      cornersLocal,
      centerLocal,
      facesLocal
    };
  }

  /**
   * Apply snapping to a position
   */
  snapPosition(position, excludeShapeId = null) {
    if (!this.enabled) return position;

    // First try to snap to objects
    const objectSnap = this.snapToObjects(position, excludeShapeId);

    // Then apply grid snap to the result
    return this.snapToGrid(objectSnap);
  }

  /**
   * Snap rotation angles to grid increments
   */
  snapRotation(rotation) {
    if (!this.enabled) return rotation;

    const snapAngle = 15; // Snap to 15-degree increments
    return {
      x: Math.round(rotation.x / (Math.PI / 12)) * (Math.PI / 12), // 15 degrees in radians
      y: Math.round(rotation.y / (Math.PI / 12)) * (Math.PI / 12),
      z: Math.round(rotation.z / (Math.PI / 12)) * (Math.PI / 12)
    };
  }

  /**
   * Snap scale values to grid increments
   */
  snapScale(scale) {
    if (!this.enabled) return scale;

    const snapIncrement = 0.1; // Snap to 0.1 increments
    return {
      x: Math.round(scale.x / snapIncrement) * snapIncrement,
      y: Math.round(scale.y / snapIncrement) * snapIncrement,
      z: Math.round(scale.z / snapIncrement) * snapIncrement
    };
  }

  /**
   * Get visual feedback for snapping (optional - for preview)
   */
  getSnapPreview(position, excludeShapeId = null) {
    if (!this.enabled) return null;

    const objectSnap = this.snapToObjects(position, excludeShapeId);
    const gridSnap = this.snapToGrid(objectSnap);

    return {
      position: gridSnap,
      snappedToObject: !this.positionsEqual(objectSnap, position),
      snappedToGrid: !this.positionsEqual(gridSnap, objectSnap)
    };
  }

  /**
   * Check if two positions are approximately equal
   */
  positionsEqual(pos1, pos2, tolerance = 0.01) {
    return Math.abs(pos1.x - pos2.x) < tolerance &&
           Math.abs(pos1.y - pos2.y) < tolerance &&
           Math.abs(pos1.z - pos2.z) < tolerance;
  }
}
