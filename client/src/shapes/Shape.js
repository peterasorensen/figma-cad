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

    // Store ID and type on mesh for reverse lookup
    this.mesh.userData.shapeId = this.id;
    this.mesh.userData.shapeType = this.type;
  }

  /**
   * Mark shape as selected
   */
  setSelected(selected) {
    this.selected = selected;

    // Visual feedback for selection
    if (selected) {
      // Add yellow wireframe outline
      this.addSelectionOutline();
      this.mesh.material.emissive = new THREE.Color(0x444444);
      this.mesh.material.emissiveIntensity = 0.3;
    } else {
      // Remove selection outline
      this.removeSelectionOutline();
      this.mesh.material.emissive = new THREE.Color(0x000000);
      this.mesh.material.emissiveIntensity = 0;
      // Remove any transform indicators
      this.removeTransformIndicators();
    }
  }

  /**
   * Add visual transform indicators (arrows) to show this object is transformable
   */
  addTransformIndicators(mode = 'translate') {
    this.removeTransformIndicators();

    // Create simple arrow indicators based on mode
    const indicatorSize = 0.5;
    const indicatorColor = 0x5a8fd6; // Same color as transform controls

    if (mode === 'translate') {
      // Add translation arrows (X, Y, Z axes)
      this.createAxisArrow('x', indicatorSize, indicatorColor);
      this.createAxisArrow('y', indicatorSize, indicatorColor);
      this.createAxisArrow('z', indicatorSize, indicatorColor);
    } else if (mode === 'rotate') {
      // Add rotation rings
      this.createRotationRing('x', indicatorSize, indicatorColor);
      this.createRotationRing('y', indicatorSize, indicatorColor);
      this.createRotationRing('z', indicatorSize, indicatorColor);
    } else if (mode === 'resize') {
      // Add scale handles
      this.createScaleHandle('x', indicatorSize, indicatorColor);
      this.createScaleHandle('y', indicatorSize, indicatorColor);
      this.createScaleHandle('z', indicatorSize, indicatorColor);
    }
  }

  /**
   * Create a simple arrow for translation mode
   */
  createAxisArrow(axis, size, color) {
    const geometry = new THREE.ConeGeometry(0.05, 0.2, 8);
    const material = new THREE.MeshBasicMaterial({ color: color });
    const arrow = new THREE.Mesh(geometry, material);

    // Position based on axis
    const offset = size * 0.8;
    switch (axis) {
      case 'x':
        arrow.position.set(offset, 0, 0);
        arrow.rotation.z = -Math.PI / 2;
        break;
      case 'y':
        arrow.position.set(0, offset, 0);
        break;
      case 'z':
        arrow.position.set(0, 0, offset);
        arrow.rotation.x = Math.PI / 2;
        break;
    }

    // Disable raycasting on indicators
    arrow.raycast = () => {};

    this.mesh.add(arrow);
    this.transformIndicators = this.transformIndicators || [];
    this.transformIndicators.push(arrow);
  }

  /**
   * Create a rotation ring indicator
   */
  createRotationRing(axis, size, color) {
    const geometry = new THREE.RingGeometry(size * 0.8, size, 16);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7
    });
    const ring = new THREE.Mesh(geometry, material);

    // Orient based on axis
    switch (axis) {
      case 'x':
        ring.rotation.y = Math.PI / 2;
        break;
      case 'y':
        ring.rotation.x = Math.PI / 2;
        break;
      case 'z':
        // Default orientation
        break;
    }

    // Disable raycasting on indicators
    ring.raycast = () => {};

    this.mesh.add(ring);
    this.transformIndicators = this.transformIndicators || [];
    this.transformIndicators.push(ring);
  }

  /**
   * Create a scale handle indicator
   */
  createScaleHandle(axis, size, color) {
    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const material = new THREE.MeshBasicMaterial({ color: color });
    const handle = new THREE.Mesh(geometry, material);

    // Position based on axis
    const offset = size * 0.8;
    switch (axis) {
      case 'x':
        handle.position.set(offset, 0, 0);
        break;
      case 'y':
        handle.position.set(0, offset, 0);
        break;
      case 'z':
        handle.position.set(0, 0, offset);
        break;
    }

    // Disable raycasting on indicators
    handle.raycast = () => {};

    this.mesh.add(handle);
    this.transformIndicators = this.transformIndicators || [];
    this.transformIndicators.push(handle);
  }

  /**
   * Remove transform indicators
   */
  removeTransformIndicators() {
    if (this.transformIndicators) {
      this.transformIndicators.forEach(indicator => {
        if (indicator.parent) {
          indicator.parent.remove(indicator);
        }
      });
      this.transformIndicators = [];
    }
  }

  /**
   * Add yellow wireframe outline for selection
   */
  addSelectionOutline() {
    // Remove existing outline if any
    this.removeSelectionOutline();

    // Create wireframe geometry from the shape's geometry
    const wireframeGeometry = new THREE.WireframeGeometry(this.mesh.geometry);

    // Create yellow wireframe material - make it more visible
    const wireframeMaterial = new THREE.LineBasicMaterial({
      color: 0xffff00, // Yellow color
      linewidth: 3, // Thicker lines
      transparent: true,
      opacity: 0.9 // More opaque
    });

    // Create the wireframe mesh
    this.selectionOutline = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);

    // Disable raycasting on the outline so it doesn't interfere with selection
    this.selectionOutline.raycast = () => {};

    // Add to the mesh so it follows transforms automatically
    this.mesh.add(this.selectionOutline);
  }

  /**
   * Remove selection outline
   */
  removeSelectionOutline() {
    if (this.selectionOutline) {
      if (this.selectionOutline.parent) {
        this.selectionOutline.parent.remove(this.selectionOutline);
      }
      if (this.selectionOutline.geometry) {
        this.selectionOutline.geometry.dispose();
      }
      if (this.selectionOutline.material) {
        this.selectionOutline.material.dispose();
      }
      this.selectionOutline = null;
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
    // Handle both individual parameters and object format
    if (typeof x === 'object' && x !== null) {
      this.mesh.position.set(x.x, x.y, x.z);
    } else {
      this.mesh.position.set(x, y, z);
    }
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
    // Handle both individual parameters and object format
    if (typeof x === 'object' && x !== null) {
      this.mesh.rotation.set(x.x, x.y, x.z);
    } else {
      this.mesh.rotation.set(x, y, z);
    }
  }

  /**
   * Update shape color
   */
  setColor(color) {
    this.mesh.material.color.set(color);
    this.properties.color = color;
  }

  /**
   * Serialize BufferGeometry to JSON
   * Stores vertex positions and normals for reconstruction
   */
  serializeGeometry() {
    if (!this.mesh || !this.mesh.geometry) return null;

    // Don't serialize geometry for text objects - they use dynamic text geometry
    if (this.type === 'text') return null;

    const geometry = this.mesh.geometry;
    const serialized = {
      type: geometry.type, // 'BufferGeometry'
      attributes: {}
    };

    // Serialize position attribute (required)
    if (geometry.attributes.position) {
      serialized.attributes.position = {
        array: Array.from(geometry.attributes.position.array),
        itemSize: geometry.attributes.position.itemSize,
        normalized: geometry.attributes.position.normalized
      };
    }

    // Serialize normal attribute (required for lighting)
    if (geometry.attributes.normal) {
      serialized.attributes.normal = {
        array: Array.from(geometry.attributes.normal.array),
        itemSize: geometry.attributes.normal.itemSize,
        normalized: geometry.attributes.normal.normalized
      };
    }

    // Serialize UV attribute (for textures, if present)
    if (geometry.attributes.uv) {
      serialized.attributes.uv = {
        array: Array.from(geometry.attributes.uv.array),
        itemSize: geometry.attributes.uv.itemSize,
        normalized: geometry.attributes.uv.normalized
      };
    }

    // Serialize index (if present)
    if (geometry.index) {
      serialized.index = {
        array: Array.from(geometry.index.array),
        itemSize: 1
      };
    }

    return serialized;
  }

  /**
   * Static method to deserialize geometry from JSON
   * Returns a THREE.BufferGeometry ready to use
   */
  static deserializeGeometry(serializedGeometry) {
    if (!serializedGeometry) return null;

    // Create new BufferGeometry
    const geometry = new THREE.BufferGeometry();

    // Restore position attribute
    if (serializedGeometry.attributes.position) {
      const posData = serializedGeometry.attributes.position;
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(
          new Float32Array(posData.array),
          posData.itemSize,
          posData.normalized
        )
      );
    }

    // Restore normal attribute
    if (serializedGeometry.attributes.normal) {
      const normalData = serializedGeometry.attributes.normal;
      geometry.setAttribute(
        'normal',
        new THREE.BufferAttribute(
          new Float32Array(normalData.array),
          normalData.itemSize,
          normalData.normalized
        )
      );
    }

    // Restore UV attribute (if present)
    if (serializedGeometry.attributes.uv) {
      const uvData = serializedGeometry.attributes.uv;
      geometry.setAttribute(
        'uv',
        new THREE.BufferAttribute(
          new Float32Array(uvData.array),
          uvData.itemSize,
          uvData.normalized
        )
      );
    }

    // Restore index (if present)
    if (serializedGeometry.index) {
      const indexData = serializedGeometry.index;
      geometry.setIndex(
        new THREE.BufferAttribute(
          new Uint16Array(indexData.array),
          indexData.itemSize
        )
      );
    }

    return geometry;
  }

  /**
   * Instance method to apply serialized geometry
   * Replaces the mesh's geometry with reconstructed BufferGeometry
   */
  applySerializedGeometry(serializedGeometry) {
    if (!serializedGeometry || !this.mesh) return;

    // Skip geometry application for text objects - they use dynamic text geometry
    if (this.type === 'text') {
      console.log(`Skipped geometry application for text shape ${this.id} - using dynamic text geometry`);
      return;
    }

    // Dispose old geometry
    if (this.mesh.geometry) {
      this.mesh.geometry.dispose();
    }

    // Deserialize using static method
    const geometry = Shape.deserializeGeometry(serializedGeometry);
    if (!geometry) return;

    // Apply the new geometry to the mesh
    this.mesh.geometry = geometry;

    console.log(`Applied serialized geometry to shape ${this.id}`);
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
      properties: this.properties
    };
  }

  /**
   * Clone the shape
   */
  clone() {
    const clonedMesh = this.mesh.clone();
    // Deep clone geometry to avoid sharing geometry between original and duplicate
    clonedMesh.geometry = this.mesh.geometry.clone();
    // Deep clone material to avoid sharing material instances
    clonedMesh.material = this.mesh.material.clone();
    const clonedShape = new Shape(this.type, clonedMesh, { ...this.properties });
    return clonedShape;
  }

  /**
   * Dispose shape and free resources
   */
  dispose() {
    // Clean up selection outline
    this.removeSelectionOutline();

    // Clean up transform indicators
    this.removeTransformIndicators();

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
