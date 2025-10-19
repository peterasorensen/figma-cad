import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

/**
 * Transform controls for manipulating objects
 * Handles move, rotate, and resize operations
 */
export class Transform {
  constructor(camera, domElement, orbitControls, snapManager = null) {
    this.camera = camera;
    this.domElement = domElement;
    this.orbitControls = orbitControls;
    this.snapManager = snapManager;
    this.controls = null;
    this.currentMode = 'translate'; // translate, rotate, resize
    this.attachedObject = null;
    this.isDragging = false;

    this.init();
  }

  init() {
    this.controls = new TransformControls(this.camera, this.domElement);
    this.controls.setMode(this.currentMode);

    // Disable orbit controls when dragging
    this.controls.addEventListener('dragging-changed', (event) => {
      this.isDragging = event.value;
      if (this.orbitControls) {
        // OrbitControls uses 'enabled' property, not enable()/disable() methods
        this.orbitControls.enabled = !event.value;
      }

      // Handle drag start - capture baseline state when drag begins
      if (event.value && this.attachedObject && this.onDragStart) {
        this.onDragStart(this.attachedObject);
      }

      // Handle drag end - capture history state when drag finishes
      if (!event.value && this.attachedObject && this.onDragEnd) {
        this.onDragEnd(this.attachedObject);
      }
    });

    // Listen for object changes (during dragging)
    this.controls.addEventListener('objectChange', () => {
      this.handleObjectChange();
      if (this.onObjectChange) {
        this.onObjectChange(this.attachedObject);
      }
    });
  }

  /**
   * Attach controls to an object
   */
  attach(object) {
    if (object) {
      this.controls.attach(object);
      this.attachedObject = object;
      this.controls.visible = true;
    }
  }

  /**
   * Detach controls from current object
   */
  detach() {
    this.controls.detach();
    this.attachedObject = null;
    this.controls.visible = false;
  }

  /**
   * Set transform mode
   */
  setMode(mode) {
    this.currentMode = mode;
    // For resize mode, use Three.js 'scale' mode visually
    // We'll convert scale changes to geometry updates on drag end
    const threeJsMode = mode === 'resize' ? 'scale' : mode;
    this.controls.setMode(threeJsMode);
  }

  /**
   * Get current mode
   */
  getMode() {
    return this.currentMode;
  }

  /**
   * Toggle between translate, rotate, and resize
   */
  cycleMode() {
    const modes = ['translate', 'rotate', 'resize'];
    const currentIndex = modes.indexOf(this.currentMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    this.setMode(modes[nextIndex]);
    return modes[nextIndex];
  }

  /**
   * Get the Three.js controls object
   */
  getControls() {
    return this.controls;
  }

  /**
   * Check if controls are attached
   */
  isAttached() {
    return this.attachedObject !== null;
  }

  /**
   * Check if currently dragging
   */
  isDraggingNow() {
    return this.isDragging;
  }

  /**
   * Set callback for object changes
   */
  setChangeCallback(callback) {
    this.onObjectChange = callback;
  }

  /**
   * Set callback for drag start events
   */
  setDragStartCallback(callback) {
    this.onDragStart = callback;
  }

  /**
   * Set callback for drag end events
   */
  setDragEndCallback(callback) {
    this.onDragEnd = callback;
  }

  /**
   * Handle object changes during transformation
   */
  handleObjectChange() {
    if (!this.snapManager || !this.snapManager.isEnabled() || !this.attachedObject) {
      return;
    }

    const shapeId = this.attachedObject.userData.shapeId;
    let needsUpdate = false;

    switch (this.currentMode) {
      case 'translate':
        const currentPosition = {
          x: this.attachedObject.position.x,
          y: this.attachedObject.position.y,
          z: this.attachedObject.position.z
        };

        // Apply snapping
        const snappedPosition = this.snapManager.snapPosition(currentPosition, shapeId);

        // Only update if the position actually changed (to avoid infinite loops)
        if (!this.snapManager.positionsEqual(currentPosition, snappedPosition)) {
          // Update the mesh position directly
          this.attachedObject.position.set(snappedPosition.x, snappedPosition.y, snappedPosition.z);

          // Update the transform controls to reflect the snapped position
          this.controls.object.position.copy(this.attachedObject.position);
          needsUpdate = true;

          // Force the controls to update their internal state
          this.controls.update();
        }
        break;

      case 'rotate':
        const currentRotation = {
          x: this.attachedObject.rotation.x,
          y: this.attachedObject.rotation.y,
          z: this.attachedObject.rotation.z
        };

        // Apply snapping
        const snappedRotation = this.snapManager.snapRotation(currentRotation);

        // Only update if the rotation actually changed (to avoid infinite loops)
        if (!this.rotationsEqual(currentRotation, snappedRotation)) {
          // Update the mesh rotation directly
          this.attachedObject.rotation.set(snappedRotation.x, snappedRotation.y, snappedRotation.z);

          // Update the transform controls to reflect the snapped rotation
          this.controls.object.rotation.copy(this.attachedObject.rotation);
          needsUpdate = true;

          // Force the controls to update their internal state
          this.controls.update();
        }
        break;

      case 'resize':
        // For resize mode, we use scale visually during dragging
        // The actual geometry will be rebuilt on drag end
        const currentScale = {
          x: this.attachedObject.scale.x,
          y: this.attachedObject.scale.y,
          z: this.attachedObject.scale.z
        };

        // Apply snapping to scale (snap to increments like 0.1)
        const snappedScale = this.snapManager.snapScale(currentScale);

        // Only update if the scale actually changed (to avoid infinite loops)
        if (!this.scalesEqual(currentScale, snappedScale)) {
          // Update the mesh scale directly for visual feedback
          this.attachedObject.scale.set(snappedScale.x, snappedScale.y, snappedScale.z);

          // Update the transform controls to reflect the snapped scale
          this.controls.object.scale.copy(this.attachedObject.scale);
          needsUpdate = true;

          // Force the controls to update their internal state
          this.controls.update();
        }
        break;

    }

    if (needsUpdate) {
      this.controls.update();
    }
  }

  /**
   * Check if two rotations are approximately equal
   */
  rotationsEqual(rot1, rot2, tolerance = 0.01) {
    return Math.abs(rot1.x - rot2.x) < tolerance &&
           Math.abs(rot1.y - rot2.y) < tolerance &&
           Math.abs(rot1.z - rot2.z) < tolerance;
  }

  /**
   * Check if two scales are approximately equal
   */
  scalesEqual(scale1, scale2, tolerance = 0.01) {
    return Math.abs(scale1.x - scale2.x) < tolerance &&
           Math.abs(scale1.y - scale2.y) < tolerance &&
           Math.abs(scale1.z - scale2.z) < tolerance;
  }

  /**
   * Set snap manager
   */
  setSnapManager(snapManager) {
    this.snapManager = snapManager;
  }

  /**
   * Dispose controls
   */
  dispose() {
    if (this.controls) {
      this.controls.dispose();
    }
  }
}
