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
   * Deserialize and apply geometry from JSON
   * Replaces the mesh's geometry with reconstructed BufferGeometry
   */
  applySerializedGeometry(serializedGeometry) {
    if (!serializedGeometry || !this.mesh) return;

    // Dispose old geometry
    if (this.mesh.geometry) {
      this.mesh.geometry.dispose();
    }

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
