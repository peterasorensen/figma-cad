import * as THREE from 'three';

/**
 * Raycaster for detecting object intersections with mouse clicks
 * Handles object selection in 3D space
 */
export class Raycaster {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
  }

  /**
   * Update mouse position for raycasting
   */
  updateMousePosition(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * Cast ray and find intersected objects
   * @param {Array} objects - Array of THREE.Object3D to test against
   * @param {boolean} recursive - Whether to check children recursively
   */
  intersect(objects, recursive = true) {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(objects, recursive);
    return intersects;
  }

  /**
   * Get the first intersected object
   */
  getFirstIntersection(objects, recursive = true) {
    const intersects = this.intersect(objects, recursive);
    return intersects.length > 0 ? intersects[0] : null;
  }

  /**
   * Get all intersected objects
   */
  getAllIntersections(objects, recursive = true) {
    return this.intersect(objects, recursive);
  }
}
