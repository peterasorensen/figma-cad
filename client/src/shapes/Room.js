import * as THREE from 'three';
import { Shape } from './Shape.js';

/**
 * Room class - Represents a detected room from a blueprint
 * Extends Shape with blueprint-specific properties
 */
export class Room extends Shape {
  /**
   * Create a Room shape
   * @param {THREE.Mesh} mesh - Three.js mesh
   * @param {Object} properties - Room properties
   * @param {string} id - Optional ID (generated if not provided)
   */
  constructor(mesh, properties = {}, id = null) {
    try {
      // Call parent constructor with type 'room'
      super('room', mesh, properties, id);

      // Room-specific properties
      this.blueprintId = properties.blueprintId || null;
      this.boundingBox = properties.boundingBox || [0, 0, 100, 100]; // [x_min, y_min, x_max, y_max]
      this.nameHint = properties.nameHint || 'Unknown Room';
      this.confidence = properties.confidence || 0.8;
      this.verified = properties.verified || false;

      // Visual properties for rooms
      this.isEditable = true;
      this.showBoundaries = true;

      // Store room data in mesh userData for easy access
      this.mesh.userData.roomData = {
        blueprintId: this.blueprintId,
        boundingBox: this.boundingBox,
        nameHint: this.nameHint,
        confidence: this.confidence,
        verified: this.verified
      };

      // Apply room-specific visual styling
      this.applyRoomStyling();

      // Add room label (name/number)
      this.addRoomLabel();

      // Don't add boundary indicators in constructor - only when selected
      // They will be added via setSelected() when the user selects the room
    } catch (error) {
      console.error('Error creating Room object:', error);
      throw error;
    }
  }

  /**
   * Apply visual styling specific to room objects
   * Makes rooms semi-transparent with distinct color based on confidence
   */
  applyRoomStyling() {
    if (!this.mesh || !this.mesh.material) return;

    // Set transparency
    this.mesh.material.transparent = true;
    this.mesh.material.opacity = this.verified ? 0.6 : 0.4;

    // Color based on confidence level
    let roomColor;
    if (this.confidence >= 0.8) {
      roomColor = 0x4f46e5; // High confidence - indigo
    } else if (this.confidence >= 0.6) {
      roomColor = 0xfbbf24; // Medium confidence - amber
    } else {
      roomColor = 0xef4444; // Low confidence - red
    }

    // Override color if explicitly set in properties
    if (this.properties.color) {
      this.mesh.material.color.set(this.properties.color);
    } else {
      this.mesh.material.color.set(roomColor);
      this.properties.color = '#' + roomColor.toString(16).padStart(6, '0');
    }

    // Add subtle emissive glow
    this.mesh.material.emissive = new THREE.Color(roomColor);
    this.mesh.material.emissiveIntensity = 0.2;
  }

  /**
   * Add a text label showing the room name/number
   */
  addRoomLabel() {
    if (this.roomLabel) {
      this.removeRoomLabel();
    }

    // Create canvas for text
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    // Set canvas size
    canvas.width = 512;
    canvas.height = 128;

    // Configure text style
    context.fillStyle = '#ffffff';
    context.font = 'bold 48px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // Add semi-transparent background
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    const text = this.nameHint || 'Room';
    const metrics = context.measureText(text);
    const padding = 20;
    const bgWidth = metrics.width + padding * 2;
    const bgHeight = 64;
    const bgX = (canvas.width - bgWidth) / 2;
    const bgY = (canvas.height - bgHeight) / 2;

    context.beginPath();
    context.roundRect(bgX, bgY, bgWidth, bgHeight, 10);
    context.fill();

    // Draw text
    context.fillStyle = '#ffffff';
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    // Add confidence indicator
    if (this.confidence) {
      context.font = '24px Arial';
      context.fillStyle = this.confidence >= 0.8 ? '#4ade80' : this.confidence >= 0.6 ? '#fbbf24' : '#ef4444';
      context.fillText(`${Math.round(this.confidence * 100)}%`, canvas.width / 2, canvas.height / 2 + 40);
    }

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    // Create sprite material
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });

    // Create sprite
    this.roomLabel = new THREE.Sprite(spriteMaterial);

    // Scale sprite to appropriate size
    const scale = Math.max(this.getDimensions().width, this.getDimensions().height) * 0.3;
    this.roomLabel.scale.set(scale * 4, scale, 1);

    // Position above the room
    this.roomLabel.position.set(0, 0.5, 0);

    // Disable raycasting on label
    this.roomLabel.raycast = () => {};

    // Add to mesh
    this.mesh.add(this.roomLabel);
  }

  /**
   * Remove room label
   */
  removeRoomLabel() {
    if (this.roomLabel) {
      if (this.roomLabel.parent) {
        this.roomLabel.parent.remove(this.roomLabel);
      }
      if (this.roomLabel.material) {
        if (this.roomLabel.material.map) {
          this.roomLabel.material.map.dispose();
        }
        this.roomLabel.material.dispose();
      }
      this.roomLabel = null;
    }
  }

  /**
   * Add boundary indicators (corner handles) for editing
   */
  addBoundaryIndicators() {
    // Remove existing indicators
    this.removeBoundaryIndicators();

    const geometry = this.mesh.geometry;
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }

    const bbox = geometry.boundingBox;
    const handleSize = 0.3;
    const handleColor = 0x10b981; // Green for edit handles

    this.boundaryHandles = [];

    // Create corner handles (4 corners for a rectangle room)
    const corners = [
      { x: bbox.min.x, y: bbox.min.y, z: bbox.max.z }, // Front-left
      { x: bbox.max.x, y: bbox.min.y, z: bbox.max.z }, // Front-right
      { x: bbox.max.x, y: bbox.min.y, z: bbox.min.z }, // Back-right
      { x: bbox.min.x, y: bbox.min.y, z: bbox.min.z }  // Back-left
    ];

    corners.forEach((corner, index) => {
      const handleGeometry = new THREE.SphereGeometry(handleSize, 8, 8);
      const handleMaterial = new THREE.MeshBasicMaterial({
        color: handleColor,
        transparent: true,
        opacity: 0.7
      });
      const handle = new THREE.Mesh(handleGeometry, handleMaterial);

      handle.position.set(corner.x, corner.y + 0.1, corner.z);

      // Store handle data
      handle.userData.isRoomHandle = true;
      handle.userData.roomId = this.id;
      handle.userData.handleIndex = index;

      this.mesh.add(handle);
      this.boundaryHandles.push(handle);
    });
  }

  /**
   * Remove boundary indicators
   */
  removeBoundaryIndicators() {
    if (this.boundaryHandles) {
      this.boundaryHandles.forEach(handle => {
        if (handle.parent) {
          handle.parent.remove(handle);
        }
        if (handle.geometry) handle.geometry.dispose();
        if (handle.material) handle.material.dispose();
      });
      this.boundaryHandles = [];
    }
  }

  /**
   * Override setSelected to show/hide boundary handles
   */
  setSelected(selected) {
    super.setSelected(selected);

    // Show/hide boundary handles based on selection
    if (selected && this.isEditable && this.showBoundaries) {
      this.addBoundaryIndicators();
    } else if (!selected) {
      this.removeBoundaryIndicators();
    }
  }

  /**
   * Update room name hint
   */
  setNameHint(nameHint) {
    this.nameHint = nameHint;
    this.mesh.userData.roomData.nameHint = nameHint;
    this.properties.nameHint = nameHint;

    // Refresh the label with new name
    this.addRoomLabel();
  }

  /**
   * Mark room as verified by user
   */
  setVerified(verified) {
    this.verified = verified;
    this.mesh.userData.roomData.verified = verified;

    // Update visual styling
    this.applyRoomStyling();
  }

  /**
   * Update bounding box
   */
  setBoundingBox(boundingBox) {
    this.boundingBox = boundingBox;
    this.mesh.userData.roomData.boundingBox = boundingBox;
    this.properties.boundingBox = boundingBox;
  }

  /**
   * Get room dimensions from bounding box
   */
  getDimensions() {
    const [x_min, y_min, x_max, y_max] = this.boundingBox;
    return {
      width: x_max - x_min,
      height: y_max - y_min,
      centerX: (x_min + x_max) / 2,
      centerY: (y_min + y_max) / 2
    };
  }

  /**
   * Convert to normalized coordinates (0-1000 scale)
   * Useful for sending back to server or AI
   */
  toNormalizedCoordinates() {
    const position = this.getPosition();
    const { width, height } = this.getDimensions();

    // Assuming world units map to normalized coordinates
    // This may need adjustment based on your coordinate system
    return {
      x_min: position.x - width / 2,
      y_min: position.z - height / 2,
      x_max: position.x + width / 2,
      y_max: position.z + height / 2
    };
  }

  /**
   * Serialize room to JSON (override parent method)
   * Includes room-specific properties
   */
  toJSON() {
    const baseJSON = super.toJSON();

    return {
      ...baseJSON,
      blueprintId: this.blueprintId,
      boundingBox: this.boundingBox,
      nameHint: this.nameHint,
      confidence: this.confidence,
      verified: this.verified,
      showBoundaries: this.showBoundaries
    };
  }

  /**
   * Clone the room (override parent method)
   */
  clone() {
    const clonedMesh = this.mesh.clone();
    clonedMesh.geometry = this.mesh.geometry.clone();
    clonedMesh.material = this.mesh.material.clone();

    const roomProperties = {
      ...this.properties,
      blueprintId: this.blueprintId,
      boundingBox: [...this.boundingBox],
      nameHint: this.nameHint,
      confidence: this.confidence,
      verified: false // Clones are unverified by default
    };

    const clonedRoom = new Room(clonedMesh, roomProperties);
    return clonedRoom;
  }

  /**
   * Dispose room and free resources (override parent method)
   */
  dispose() {
    // Remove room label
    this.removeRoomLabel();

    // Remove boundary indicators
    this.removeBoundaryIndicators();

    // Call parent dispose
    super.dispose();
  }

  /**
   * Static method to create a Room from detected room data
   * @param {Object} detectedRoom - Room data from AI detection
   * @param {number} blueprintId - Blueprint ID
   * @returns {Room} - Room instance
   */
  static fromDetectedRoom(detectedRoom, blueprintId) {
    const { bounding_box, name_hint, confidence, id } = detectedRoom;

    // Calculate dimensions from bounding box
    const [x_min, y_min, x_max, y_max] = bounding_box;
    const width = x_max - x_min;
    const height = y_max - y_min;
    const centerX = (x_min + x_max) / 2;
    const centerY = (y_min + y_max) / 2;

    // Create geometry - thin box at y=0 (ground level)
    const geometry = new THREE.BoxGeometry(width, 0.1, height);
    const material = new THREE.MeshStandardMaterial({
      color: 0x4f46e5,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);

    // Position at the center of the bounding box, at ground level
    mesh.position.set(centerX, 0.05, centerY);

    // Create Room instance with properties
    const properties = {
      blueprintId,
      boundingBox: bounding_box,
      nameHint: name_hint || 'Unknown Room',
      confidence: confidence || 0.8,
      verified: false,
      color: null // Will use confidence-based color
    };

    return new Room(mesh, properties, id);
  }
}
