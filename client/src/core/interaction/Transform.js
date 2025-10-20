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

    // For multiple selections
    this.multiSelectObjects = [];
    this.multiSelectInitialStates = [];

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
      this.multiSelectObjects = [];
      this.multiSelectInitialStates = [];
      this.controls.visible = true;
    }
  }

  /**
   * Attach controls to multiple objects for group transformation
   */
  attachMultiple(objects) {
    if (objects && objects.length > 0) {
      // Use the first object as the primary control object
      this.attachedObject = objects[0];
      this.multiSelectObjects = objects.slice(1); // All other objects

      // Store initial states for all objects
      this.multiSelectInitialStates = objects.map(obj => ({
        position: obj.position.clone(),
        rotation: obj.rotation.clone(),
        scale: obj.scale.clone()
      }));

      this.controls.attach(this.attachedObject);
      this.controls.visible = true;

      // Add visual helpers to all selected objects
      this.addVisualHelpers(objects);
    }
  }

  /**
   * Add visual helpers to show controls on all selected objects
   */
  addVisualHelpers(objects) {
    // Remove any existing helpers
    this.removeVisualHelpers();

    // Add transform indicators to all selected objects
    objects.forEach(obj => {
      const shapeId = obj.userData.shapeId;
      if (shapeId) {
        // Get the shape and add transform indicators
        const shape = this.getShapeById ? this.getShapeById(shapeId) :
                      // Fallback: try to find shape through the app
                      (this.app && this.app.shapeManager ? this.app.shapeManager.getShape(shapeId) : null);

        if (shape && shape.addTransformIndicators) {
          shape.addTransformIndicators(this.currentMode);
        }
      }
    });

    // Ensure the main controls are visible
    this.controls.visible = true;
  }

  /**
   * Remove visual helpers
   */
  removeVisualHelpers() {
    // Remove transform indicators from all shapes
    const allObjects = [this.attachedObject, ...this.multiSelectObjects].filter(obj => obj);
    allObjects.forEach(obj => {
      const shapeId = obj?.userData?.shapeId;
      if (shapeId) {
        const shape = this.app && this.app.shapeManager ? this.app.shapeManager.getShape(shapeId) : null;
        if (shape && shape.removeTransformIndicators) {
          shape.removeTransformIndicators();
        }
      }
    });
  }

  /**
   * Detach controls from current object
   */
  detach() {
    this.controls.detach();
    this.attachedObject = null;
    this.multiSelectObjects = [];
    this.multiSelectInitialStates = [];
    this.controls.visible = false;
    this.removeVisualHelpers();
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

    // Update visual indicators on all selected objects
    const allObjects = [this.attachedObject, ...this.multiSelectObjects].filter(obj => obj);
    if (allObjects.length > 0) {
      allObjects.forEach(obj => {
        const shapeId = obj?.userData?.shapeId;
        if (shapeId) {
          const shape = this.app && this.app.shapeManager ? this.app.shapeManager.getShape(shapeId) : null;
          if (shape && shape.addTransformIndicators) {
            shape.addTransformIndicators(mode);
          }
        }
      });
    }
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
    if (!this.attachedObject) {
      return;
    }

    const primaryShapeId = this.attachedObject.userData.shapeId;
    let needsUpdate = false;

    // Calculate the transformation delta from the initial state
    const initialState = this.multiSelectInitialStates[0];
    if (!initialState) return;

    const deltaPosition = {
      x: this.attachedObject.position.x - initialState.position.x,
      y: this.attachedObject.position.y - initialState.position.y,
      z: this.attachedObject.position.z - initialState.position.z
    };

    const deltaRotation = {
      x: this.attachedObject.rotation.x - initialState.rotation.x,
      y: this.attachedObject.rotation.y - initialState.rotation.y,
      z: this.attachedObject.rotation.z - initialState.rotation.z
    };

    const deltaScale = {
      x: this.attachedObject.scale.x / initialState.scale.x,
      y: this.attachedObject.scale.y / initialState.scale.y,
      z: this.attachedObject.scale.z / initialState.scale.z
    };

    switch (this.currentMode) {
      case 'translate':
        let finalPosition = {
          x: this.attachedObject.position.x,
          y: this.attachedObject.position.y,
          z: this.attachedObject.position.z
        };

        // Apply snapping if enabled
        if (this.snapManager && this.snapManager.isEnabled()) {
          finalPosition = this.snapManager.snapPosition(finalPosition, primaryShapeId);

          // Only update if the position actually changed (to avoid infinite loops)
          if (!this.snapManager.positionsEqual(this.attachedObject.position, finalPosition)) {
            this.attachedObject.position.set(finalPosition.x, finalPosition.y, finalPosition.z);
            this.controls.object.position.copy(this.attachedObject.position);
            needsUpdate = true;
          }
        }

        // Apply the same translation to all multi-selected objects
        this.multiSelectObjects.forEach((obj, index) => {
          const objInitialState = this.multiSelectInitialStates[index + 1];
          if (objInitialState) {
            const newPos = {
              x: objInitialState.position.x + deltaPosition.x,
              y: objInitialState.position.y + deltaPosition.y,
              z: objInitialState.position.z + deltaPosition.z
            };

            // Apply snapping to each object if enabled
            if (this.snapManager && this.snapManager.isEnabled()) {
              const objShapeId = obj.userData.shapeId;
              const snappedPos = this.snapManager.snapPosition(newPos, objShapeId);
              obj.position.set(snappedPos.x, snappedPos.y, snappedPos.z);
            } else {
              obj.position.set(newPos.x, newPos.y, newPos.z);
            }
          }
        });

        if (needsUpdate) {
          this.controls.update();
        }
        break;

      case 'rotate':
        let finalRotation = {
          x: this.attachedObject.rotation.x,
          y: this.attachedObject.rotation.y,
          z: this.attachedObject.rotation.z
        };

        // Apply snapping if enabled
        if (this.snapManager && this.snapManager.isEnabled()) {
          const snappedRotation = this.snapManager.snapRotation(finalRotation);

          // Only update if the rotation actually changed (to avoid infinite loops)
          if (!this.rotationsEqual(this.attachedObject.rotation, snappedRotation)) {
            this.attachedObject.rotation.set(snappedRotation.x, snappedRotation.y, snappedRotation.z);
            this.controls.object.rotation.copy(this.attachedObject.rotation);
            needsUpdate = true;
            finalRotation = snappedRotation;
          }
        }

        // Apply the same rotation to all multi-selected objects
        this.multiSelectObjects.forEach((obj, index) => {
          const objInitialState = this.multiSelectInitialStates[index + 1];
          if (objInitialState) {
            obj.rotation.set(finalRotation.x, finalRotation.y, finalRotation.z);
          }
        });

        if (needsUpdate) {
          this.controls.update();
        }
        break;

      case 'resize':
        // For resize mode, we use scale visually during dragging
        // The actual geometry will be rebuilt on drag end
        let finalScale = {
          x: this.attachedObject.scale.x,
          y: this.attachedObject.scale.y,
          z: this.attachedObject.scale.z
        };

        // Apply snapping if enabled
        if (this.snapManager && this.snapManager.isEnabled()) {
          const snappedScale = this.snapManager.snapScale(finalScale);

          // Only update if the scale actually changed (to avoid infinite loops)
          if (!this.scalesEqual(this.attachedObject.scale, snappedScale)) {
            this.attachedObject.scale.set(snappedScale.x, snappedScale.y, snappedScale.z);
            this.controls.object.scale.copy(this.attachedObject.scale);
            needsUpdate = true;
            finalScale = snappedScale;
          }
        }

        // Apply the same scale to all multi-selected objects
        this.multiSelectObjects.forEach((obj, index) => {
          const objInitialState = this.multiSelectInitialStates[index + 1];
          if (objInitialState) {
            obj.scale.set(finalScale.x, finalScale.y, finalScale.z);
          }
        });

        if (needsUpdate) {
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
