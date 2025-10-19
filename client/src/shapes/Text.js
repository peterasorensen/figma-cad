import * as THREE from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { Shape } from './Shape.js';

/**
 * Text shape class that extends the base Shape class
 * Handles 3D text rendering using Three.js TextGeometry
 */
export class TextShape extends Shape {
  constructor(text = 'Text', x = 0, y = 1, z = 0, id = null, properties = {}) {
    // Create a temporary mesh first, will be replaced with text geometry
    const tempGeometry = new THREE.BoxGeometry(1, 1, 1);
    const tempMaterial = new THREE.MeshStandardMaterial({ color: properties.color || 0x5a8fd6 });
    const tempMesh = new THREE.Mesh(tempGeometry, tempMaterial);

    // Call parent constructor
    super('text', tempMesh, properties, id);

    // Store text properties
    this.text = text;
    this.fontSize = properties.fontSize || 1;
    this.fontDepth = properties.fontDepth || 0.1;
    this.color = properties.color || 0x5a8fd6;

    // Load font and create text geometry
    this.loadFontAndCreateText(x, y, z);
  }

  /**
   * Load font and create text geometry
   */
  async loadFontAndCreateText(x, y, z) {
    try {
      // For now, we'll use a simple approach with built-in font
      // In a production app, you'd load a proper font file
      const fontLoader = new FontLoader();

      // Use a basic font URL - you might want to host this locally
      const font = await new Promise((resolve, reject) => {
        fontLoader.load(
          'https://threejs.org/examples/fonts/helvetiker_regular.typeface.json',
          resolve,
          undefined,
          reject
        );
      });

      // Dispose of temporary geometry
      if (this.mesh.geometry) {
        this.mesh.geometry.dispose();
      }

      // Create text geometry
      const textGeometry = new TextGeometry(this.text, {
        font: font,
        size: this.fontSize,
        depth: this.fontDepth,
        curveSegments: 12,
        bevelEnabled: false
      });

      // Center the text geometry
      textGeometry.computeBoundingBox();
      const centerOffsetX = -0.5 * (textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x);
      const centerOffsetY = -0.5 * (textGeometry.boundingBox.max.y - textGeometry.boundingBox.min.y);
      const centerOffsetZ = -0.5 * (textGeometry.boundingBox.max.z - textGeometry.boundingBox.min.z);

      textGeometry.translate(centerOffsetX, centerOffsetY, centerOffsetZ);

      // Create material
      const textMaterial = new THREE.MeshStandardMaterial({
        color: this.color,
        roughness: 0.5,
        metalness: 0.3
      });

      // Replace the mesh
      this.mesh.geometry = textGeometry;
      this.mesh.material = textMaterial;
      this.mesh.position.set(x, y, z);
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;

      // Update properties
      this.properties = {
        ...this.properties,
        text: this.text,
        fontSize: this.fontSize,
        fontDepth: this.fontDepth,
        color: '#' + textMaterial.color.getHexString()
      };

    } catch (error) {
      console.error('Failed to load font for text shape:', error);
      // Keep the temporary box geometry as fallback
      this.mesh.position.set(x, y, z);
      this.properties = {
        ...this.properties,
        text: this.text,
        fontSize: this.fontSize,
        fontDepth: this.fontDepth,
        color: '#' + this.mesh.material.color.getHexString()
      };
    }
  }

  /**
   * Update the text content
   */
  setText(newText) {
    if (this.text === newText) return;

    this.text = newText;
    this.properties.text = newText;

    // Reload font and recreate geometry
    this.loadFontAndCreateText(
      this.mesh.position.x,
      this.mesh.position.y,
      this.mesh.position.z
    );
  }

  /**
   * Update font size
   */
  setFontSize(newSize) {
    if (this.fontSize === newSize) return;

    this.fontSize = newSize;
    this.properties.fontSize = newSize;

    // Reload font and recreate geometry
    this.loadFontAndCreateText(
      this.mesh.position.x,
      this.mesh.position.y,
      this.mesh.position.z
    );
  }

  /**
   * Update font depth
   */
  setFontDepth(newDepth) {
    if (this.fontDepth === newDepth) return;

    this.fontDepth = newDepth;
    this.properties.fontDepth = newDepth;

    // Reload font and recreate geometry
    this.loadFontAndCreateText(
      this.mesh.position.x,
      this.mesh.position.y,
      this.mesh.position.z
    );
  }

  /**
   * Override clone to properly handle text geometry
   */
  clone() {
    const clonedProperties = {
      ...this.properties,
      text: this.text,
      fontSize: this.fontSize,
      fontDepth: this.fontDepth,
      color: this.color
    };

    const clonedShape = new TextShape(
      this.text,
      this.mesh.position.x,
      this.mesh.position.y,
      this.mesh.position.z,
      null,
      clonedProperties
    );

    return clonedShape;
  }

  /**
   * Override toJSON to include text-specific properties
   */
  toJSON() {
    return {
      ...super.toJSON(),
      text: this.text,
      fontSize: this.fontSize,
      fontDepth: this.fontDepth
    };
  }
}
