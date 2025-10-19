import * as THREE from 'three';
import { Shape } from './Shape.js';
import { TextShape } from './Text.js';

/**
 * Factory for creating different types of shapes
 * Supports both 2D (flat) and 3D shapes
 */
export class ShapeFactory {
  constructor() {
    this.defaultColors = [
      0x5a8fd6, // Blue
      0xe85d75, // Pink
      0x4caf50, // Green
      0xff9800, // Orange
      0x9c27b0, // Purple
      0xffeb3b, // Yellow
    ];
    this.colorIndex = 0;
  }

  /**
   * Get next color in rotation
   */
  getNextColor() {
    const color = this.defaultColors[this.colorIndex];
    this.colorIndex = (this.colorIndex + 1) % this.defaultColors.length;
    return color;
  }

  /**
   * Create shape directly from pre-built geometry (for remote sync)
   * Avoids double allocation - geometry is already deserialized
   */
  createFromGeometry(geometry, x = 0, y = 1, z = 0, id = null, properties = {}, type = 'mesh') {
    const { color } = properties;

    // Ensure geometry has required attributes
    if (!geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    if (!geometry.boundingSphere) {
      geometry.computeBoundingSphere();
    }

    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.5,
      metalness: 0.3
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(1, 1, 1); // Geometry should be baked
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return new Shape(type, mesh, {
      color: '#' + material.color.getHexString()
    }, id);
  }

  /**
   * Create a 3D box
   */
  createBox(x = 0, y = 1, z = 0, id = null, properties = {}) {
    const { width, height, depth, color } = properties;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.5,
      metalness: 0.3
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return new Shape('box', mesh, {
      width,
      height,
      depth,
      color: '#' + material.color.getHexString()
    }, id);
  }


  /**
   * Create a 3D sphere
   */
  createSphere(x = 0, y = 1, z = 0, id = null, properties = {}) {
    const { radius, color } = properties;
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.5,
      metalness: 0.3
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return new Shape('sphere', mesh, {
      radius,
      color: '#' + material.color.getHexString()
    }, id);
  }

  /**
   * Create a 3D cylinder
   */
  createCylinder(x = 0, y = 1, z = 0, id = null, properties = {}) {
    const { radius, height, color } = properties;
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 32);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.5,
      metalness: 0.3
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return new Shape('cylinder', mesh, {
      radius,
      height,
      color: '#' + material.color.getHexString()
    }, id);
  }

  /**
   * Create a 2D rectangle (flat box on the ground)
   */
  createRectangle(x = 0, z = 0, id = null, properties = {}) {
    const { width, height, color } = properties;
    const geometry = new THREE.BoxGeometry(width, 0.1, height);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.5,
      metalness: 0.3
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, 0.05, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return new Shape('rectangle', mesh, {
      width,
      height,
      color: '#' + material.color.getHexString()
    }, id);
  }

  /**
   * Create a 2D circle (flat cylinder on the ground)
   */
  createCircle(x = 0, z = 0, id = null, properties = {}) {
    const { radius, color } = properties;
    const geometry = new THREE.CylinderGeometry(radius, radius, 0.1, 32);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.5,
      metalness: 0.3
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, 0.05, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return new Shape('circle', mesh, {
      radius,
      color: '#' + material.color.getHexString()
    }, id);
  }

  /**
   * Create a 3D text object
   */
  createText(x = 0, y = 1, z = 0, id = null, properties = {}) {
    const { text, fontSize, fontDepth, color } = properties;
    return new TextShape(text, x, y, z, id, {
      text: text || 'Text',
      fontSize: fontSize || 1,
      fontDepth: fontDepth || 0.1,
      color: color
    });
  }

}
