import * as THREE from 'three';

/**
 * Floating controls that appear above selected objects
 * Provides UI for switching between translate, rotate, and scale modes
 */
export class ObjectControls {
  constructor(camera, transformControls) {
    this.camera = camera;
    this.transformControls = transformControls;
    this.container = null;
    this.buttons = new Map();
    this.isVisible = false;

    this.init();
  }

  init() {
    this.container = document.getElementById('object-controls');
    if (!this.container) {
      console.warn('Object controls container not found');
      return;
    }

    // Set up button event listeners
    this.setupButtons();

    // Initially hide controls
    this.hide();
  }

  setupButtons() {
    const modes = ['translate', 'rotate', 'scale'];

    modes.forEach(mode => {
      const button = this.container.querySelector(`[data-mode="${mode}"]`);
      if (button) {
        this.buttons.set(mode, button);
        button.addEventListener('click', () => this.setMode(mode));
      }
    });
  }

  /**
   * Show controls above the selected object
   */
  show(object) {
    if (!this.container || !object) return;

    this.isVisible = true;
    this.container.style.display = 'flex';

    // Position controls above the object
    this.positionAboveObject(object);
  }

  /**
   * Hide the controls
   */
  hide() {
    if (!this.container) return;

    this.isVisible = false;
    this.container.style.display = 'none';
  }

  /**
   * Set the transform mode and update button states
   */
  setMode(mode) {
    if (this.transformControls) {
      this.transformControls.setMode(mode);
    }

    // Update button active states
    this.updateButtonStates(mode);
  }

  /**
   * Update which button is active
   */
  updateButtonStates(activeMode) {
    this.buttons.forEach((button, mode) => {
      button.classList.toggle('active', mode === activeMode);
    });
  }

  /**
   * Position controls above the 3D object in screen space
   */
  positionAboveObject(object) {
    if (!object || !this.camera) return;

    // Get the object's world position
    const worldPosition = new THREE.Vector3();
    object.updateMatrixWorld();
    worldPosition.setFromMatrixPosition(object.matrixWorld);

    // Project to screen coordinates
    const screenPosition = worldPosition.project(this.camera);

    // Convert to screen coordinates (NDC to screen)
    const rect = this.container.getBoundingClientRect();
    const canvasRect = document.getElementById('canvas').getBoundingClientRect();

    const x = (screenPosition.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left;
    const y = (-screenPosition.y * 0.5 + 0.5) * canvasRect.height + canvasRect.top;

    // Position above the object (with some offset)
    const offsetY = 240; // Distance above the object
    this.container.style.left = `${x - rect.width / 2}px`;
    this.container.style.top = `${y - offsetY}px`;
  }

  /**
   * Update controls position (call this on each frame or when object moves)
   */
  update(object) {
    if (this.isVisible && object) {
      this.positionAboveObject(object);
    }
  }

  /**
   * Clean up event listeners
   */
  dispose() {
    this.buttons.forEach(button => {
      button.removeEventListener('click', this.setMode);
    });
    this.buttons.clear();
  }
}
