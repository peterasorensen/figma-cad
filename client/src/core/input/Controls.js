import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Camera controls manager
 * Handles pan, zoom, and rotation using OrbitControls
 */
export class Controls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.controls = null;

    this.init();
  }

  init() {
    this.controls = new OrbitControls(this.camera, this.domElement);

    // Configure controls - disable damping for snappier feel
    this.controls.enableDamping = false;
    // this.controls.dampingFactor = 0.05;

    // Set reasonable zoom limits
    this.controls.minDistance = 5;
    this.controls.maxDistance = 100;

    // Set pan limits (optional - comment out for unlimited pan)
    this.controls.maxPolarAngle = Math.PI; // Allow full rotation

    // Enable keyboard controls
    this.controls.listenToKeyEvents(window);
    this.controls.keys = {
      LEFT: 'ArrowLeft',
      UP: 'ArrowUp',
      RIGHT: 'ArrowRight',
      BOTTOM: 'ArrowDown'
    };

    // Set target to origin
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  update() {
    if (this.controls) {
      this.controls.update();
    }
  }

  enable() {
    if (this.controls) {
      this.controls.enabled = true;
    }
  }

  disable() {
    if (this.controls) {
      this.controls.enabled = false;
    }
  }

  getTarget() {
    return this.controls.target;
  }

  setTarget(x, y, z) {
    this.controls.target.set(x, y, z);
    this.controls.update();
  }

  dispose() {
    if (this.controls) {
      this.controls.dispose();
    }
  }
}
