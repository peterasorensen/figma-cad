import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

/**
 * Transform controls for manipulating objects
 * Handles move, rotate, and scale operations
 */
export class Transform {
  constructor(camera, domElement, orbitControls) {
    this.camera = camera;
    this.domElement = domElement;
    this.orbitControls = orbitControls;
    this.controls = null;
    this.currentMode = 'translate'; // translate, rotate, scale
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
    });

    // Listen for object changes
    this.controls.addEventListener('objectChange', () => {
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
    this.controls.setMode(mode);
  }

  /**
   * Get current mode
   */
  getMode() {
    return this.currentMode;
  }

  /**
   * Toggle between translate, rotate, scale
   */
  cycleMode() {
    const modes = ['translate', 'rotate', 'scale'];
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
   * Dispose controls
   */
  dispose() {
    if (this.controls) {
      this.controls.dispose();
    }
  }
}
