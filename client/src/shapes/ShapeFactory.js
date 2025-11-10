import * as THREE from 'three';
import { Shape } from './Shape.js';
import { TextShape } from './Text.js';
import { Room } from './Room.js';

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

    // Ensure color is a valid THREE.Color input
    let colorValue = color;
    if (typeof colorValue === 'string' && colorValue.startsWith('#')) {
      colorValue = colorValue;
    } else if (typeof colorValue === 'number') {
      colorValue = colorValue;
    } else {
      colorValue = 0x5a8fd6; // default
    }

    const material = new THREE.MeshStandardMaterial({
      color: colorValue,
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
    // Aggressive reduction for boolean performance (was 32x32, now 8x8)
    const geometry = new THREE.SphereGeometry(radius, 16, 16);
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
    // Aggressive reduction for boolean performance (was 32, now 8)
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 16);
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
    // Aggressive reduction for boolean performance (was 32, now 12)
    const geometry = new THREE.CylinderGeometry(radius, radius, 0.1, 16);
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

  /**
   * Create a 3D torus (donut shape)
   */
  createTorus(x = 0, y = 1, z = 0, id = null, properties = {}) {
    const { radius, tube, color } = properties;
    // Aggressive reduction for boolean performance (was 16 radial/100 tubular, now 8/32)
    const geometry = new THREE.TorusGeometry(radius, tube, 8, 32);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.5,
      metalness: 0.3
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return new Shape('torus', mesh, {
      radius,
      tube,
      color: '#' + material.color.getHexString()
    }, id);
  }

  /**
   * Create a 3D torus knot
   */
  createTorusKnot(x = 0, y = 1, z = 0, id = null, properties = {}) {
    const { radius, tube, color } = properties;
    // Aggressive reduction for boolean performance (was 100 tubular/16 radial, now 32/8)
    const geometry = new THREE.TorusKnotGeometry(radius, tube, 32, 8);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.5,
      metalness: 0.3
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return new Shape('torusKnot', mesh, {
      radius,
      tube,
      color: '#' + material.color.getHexString()
    }, id);
  }

  /**
   * Create a 3D dodecahedron
   */
  createDodecahedron(x = 0, y = 1, z = 0, id = null, properties = {}) {
    const { radius, color } = properties;
    const geometry = new THREE.DodecahedronGeometry(radius);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.5,
      metalness: 0.3
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return new Shape('dodecahedron', mesh, {
      radius,
      color: '#' + material.color.getHexString()
    }, id);
  }

  /**
   * Create a 3D icosahedron
   */
  createIcosahedron(x = 0, y = 1, z = 0, id = null, properties = {}) {
    const { radius, color } = properties;
    const geometry = new THREE.IcosahedronGeometry(radius);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.5,
      metalness: 0.3
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return new Shape('icosahedron', mesh, {
      radius,
      color: '#' + material.color.getHexString()
    }, id);
  }

  /**
   * Create a 3D octahedron
   */
  createOctahedron(x = 0, y = 1, z = 0, id = null, properties = {}) {
    const { radius, color } = properties;
    const geometry = new THREE.OctahedronGeometry(radius);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.5,
      metalness: 0.3
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return new Shape('octahedron', mesh, {
      radius,
      color: '#' + material.color.getHexString()
    }, id);
  }

  /**
   * Create a 3D tetrahedron
   */
  createTetrahedron(x = 0, y = 1, z = 0, id = null, properties = {}) {
    const { radius, color } = properties;
    const geometry = new THREE.TetrahedronGeometry(radius);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.5,
      metalness: 0.3
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return new Shape('tetrahedron', mesh, {
      radius,
      color: '#' + material.color.getHexString()
    }, id);
  }

  /**
   * Create a 3D tube following a path
   */
  createTube(x = 0, y = 1, z = 0, id = null, properties = {}) {
    const { radius, tubularSegments, radialSegments, color } = properties;

    // Create a simple curved path for the tube
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 1, 0),
      new THREE.Vector3(4, 0, 0),
      new THREE.Vector3(6, -1, 0),
      new THREE.Vector3(8, 0, 0)
    ]);

    // Aggressive reduction for boolean performance (was 20 tubular/8 radial, now 12/6)
    const geometry = new THREE.TubeGeometry(path, tubularSegments || 12, radius, radialSegments || 6, false);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.5,
      metalness: 0.3
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return new Shape('tube', mesh, {
      radius,
      tubularSegments: tubularSegments || 20,
      radialSegments: radialSegments || 8,
      color: '#' + material.color.getHexString()
    }, id);
  }

  /**
   * Create a Room (detected from blueprint)
   * Similar to rectangle but with special Room class and properties
   */
  createRoom(x = 0, z = 0, id = null, properties = {}) {
    const {
      width,
      height,
      color,
      blueprintId,
      boundingBox,
      nameHint,
      confidence,
      verified
    } = properties;

    // Create thin box geometry (like rectangle but for rooms)
    const geometry = new THREE.BoxGeometry(width, 0.1, height);
    const material = new THREE.MeshStandardMaterial({
      color: color || 0x4f46e5,
      transparent: true,
      opacity: verified ? 0.6 : 0.4,
      roughness: 0.5,
      metalness: 0.3,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, 0.05, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Create Room instance with special properties
    return new Room(mesh, {
      width,
      height,
      color: color ? ('#' + new THREE.Color(color).getHexString()) : '#4f46e5',
      blueprintId,
      boundingBox,
      nameHint: nameHint || 'Unknown Room',
      confidence: confidence || 0.8,
      verified: verified || false
    }, id);
  }

}
