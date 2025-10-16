import * as THREE from 'three';

/**
 * Wrapper class for Three.js meshes
 * Manages shape metadata and serialization
 */
export class Shape {
  constructor(type, mesh, properties = {}, id = null) {
    this.id = id || crypto.randomUUID();
    this.type = type;
    this.mesh = mesh;
    this.properties = properties;
    this.selected = false;

    // Store ID on mesh for reverse lookup
    this.mesh.userData.shapeId = this.id;
  }

  /**
   * Mark shape as selected
   */
  setSelected(selected) {
    this.selected = selected;

    // Visual feedback for selection
    if (selected) {
      // Add outline or change appearance
      this.mesh.material.emissive = new THREE.Color(0x444444);
      this.mesh.material.emissiveIntensity = 0.3;
    } else {
      this.mesh.material.emissive = new THREE.Color(0x000000);
      this.mesh.material.emissiveIntensity = 0;
    }
  }

  /**
   * Get shape position
   */
  getPosition() {
    return {
      x: this.mesh.position.x,
      y: this.mesh.position.y,
      z: this.mesh.position.z
    };
  }

  /**
   * Set shape position
   */
  setPosition(x, y, z) {
    this.mesh.position.set(x, y, z);
  }

  /**
   * Get shape rotation
   */
  getRotation() {
    return {
      x: this.mesh.rotation.x,
      y: this.mesh.rotation.y,
      z: this.mesh.rotation.z
    };
  }

  /**
   * Set shape rotation
   */
  setRotation(x, y, z) {
    this.mesh.rotation.set(x, y, z);
  }

  /**
   * Get shape scale
   */
  getScale() {
    return {
      x: this.mesh.scale.x,
      y: this.mesh.scale.y,
      z: this.mesh.scale.z
    };
  }

  /**
   * Set shape scale
   */
  setScale(x, y, z) {
    this.mesh.scale.set(x, y, z);
  }

  /**
   * Update shape color
   */
  setColor(color) {
    this.mesh.material.color.set(color);
    this.properties.color = color;
  }

  /**
   * Serialize shape to JSON
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      position: this.getPosition(),
      rotation: this.getRotation(),
      scale: this.getScale(),
      properties: this.properties
    };
  }

  /**
   * Clone the shape
   */
  clone() {
    const clonedMesh = this.mesh.clone();
    const clonedShape = new Shape(this.type, clonedMesh, { ...this.properties });
    return clonedShape;
  }

  /**
   * Dispose shape and free resources
   */
  dispose() {
    if (this.mesh.geometry) {
      this.mesh.geometry.dispose();
    }
    if (this.mesh.material) {
      if (Array.isArray(this.mesh.material)) {
        this.mesh.material.forEach(mat => mat.dispose());
      } else {
        this.mesh.material.dispose();
      }
    }
  }
}
