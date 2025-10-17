import * as THREE from 'three';

/**
 * Snap manager for grid and object snapping
 * Handles snapping objects to grid points and other objects
 */
export class SnapManager {
  constructor(shapeManager) {
    this.shapeManager = shapeManager;
    this.enabled = false;
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
   * Get snap points for a shape (edges, corners, centers)
   */
  getShapeSnapPoints(shape) {
    const position = shape.getPosition();
    const scale = shape.getScale();
    const points = [];

    // For now, we'll focus on basic shapes and their bounding box snap points
    // This can be expanded for more complex snapping logic

    switch (shape.type) {
      case 'box':
      case 'rectangle':
        // Add corner points and center
        const halfWidth = scale.x / 2;
        const halfHeight = scale.y / 2;
        const halfDepth = scale.z / 2;

        // Center
        points.push({
          x: position.x,
          y: position.y,
          z: position.z
        });

        // Corner points
        for (let xSign of [-1, 1]) {
          for (let ySign of [-1, 1]) {
            for (let zSign of [-1, 1]) {
              points.push({
                x: position.x + xSign * halfWidth,
                y: position.y + ySign * halfHeight,
                z: position.z + zSign * halfDepth
              });
            }
          }
        }

        // Edge midpoints
        points.push(
          { x: position.x + halfWidth, y: position.y, z: position.z },
          { x: position.x - halfWidth, y: position.y, z: position.z },
          { x: position.x, y: position.y + halfHeight, z: position.z },
          { x: position.x, y: position.y - halfHeight, z: position.z },
          { x: position.x, y: position.y, z: position.z + halfDepth },
          { x: position.x, y: position.y, z: position.z - halfDepth }
        );
        break;

      case 'sphere':
      case 'circle':
        // Add center point and surface points
        points.push({
          x: position.x,
          y: position.y,
          z: position.z
        });

        // Cardinal direction points
        const radius = Math.max(scale.x, scale.y, scale.z) / 2;
        points.push(
          { x: position.x + radius, y: position.y, z: position.z },
          { x: position.x - radius, y: position.y, z: position.z },
          { x: position.x, y: position.y + radius, z: position.z },
          { x: position.x, y: position.y - radius, z: position.z },
          { x: position.x, y: position.y, z: position.z + radius },
          { x: position.x, y: position.y, z: position.z - radius }
        );
        break;

      case 'cylinder':
        // Add center point and edge points
        points.push({
          x: position.x,
          y: position.y,
          z: position.z
        });

        const cylRadius = Math.max(scale.x, scale.z) / 2;
        const cylHeight = scale.y;

        // Top and bottom centers
        points.push(
          { x: position.x, y: position.y + cylHeight / 2, z: position.z },
          { x: position.x, y: position.y - cylHeight / 2, z: position.z }
        );

        // Side points
        points.push(
          { x: position.x + cylRadius, y: position.y, z: position.z },
          { x: position.x - cylRadius, y: position.y, z: position.z },
          { x: position.x, y: position.y, z: position.z + cylRadius },
          { x: position.x, y: position.y, z: position.z - cylRadius }
        );
        break;
    }

    return points;
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
