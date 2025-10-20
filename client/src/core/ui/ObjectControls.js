import * as THREE from 'three';
import { TextEditor } from './TextEditor.js';

/**
 * Floating controls that appear above selected objects
 * Provides UI for switching between translate, rotate, and resize modes
 */
export class ObjectControls {
  constructor(camera, transformControls) {
    this.camera = camera;
    this.transformControls = transformControls;
    this.container = null;
    this.buttons = new Map();
    this.isVisible = false;
    this.textEditor = new TextEditor();
    this.currentShape = null;

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
    const modes = ['translate', 'rotate', 'resize'];
    const actions = ['duplicate'];

    // Set up mode buttons
    modes.forEach(mode => {
      const button = this.container.querySelector(`[data-mode="${mode}"]`);
      if (button) {
        this.buttons.set(mode, button);
        button.addEventListener('click', () => this.setMode(mode));
      }
    });

    // Set up action buttons
    actions.forEach(action => {
      const button = this.container.querySelector(`[data-action="${action}"]`);
      if (button) {
        this.buttons.set(action, button);
        button.addEventListener('click', () => this.executeAction(action));
      }
    });

    // Set up modifiers button
    this.setupModifiers();
  }

  /**
   * Show controls above the selected object
   */
  show(object, shape = null) {
    if (!this.container || !object) return;

    this.isVisible = true;
    this.container.style.display = 'flex';

    // Store the shape for text editing (passed from App)
    this.currentShape = shape;

    // Position controls above the object or centroid of objects array
    this.positionAboveObject(object);

    // Update modifier states based on selected object
    this.updateModifierStates(object);
  }

  /**
   * Hide the controls
   */
  hide() {
    if (!this.container) return;

    this.isVisible = false;
    this.container.style.display = 'none';
    this.hideModifiersMenu();
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
   * Set up modifiers dropdown functionality
   */
  setupModifiers() {
    this.modifiersMenu = this.container.querySelector('.modifiers-menu');
    this.modifiersButton = this.container.querySelector('.modifiers-button');

    if (this.modifiersButton && this.modifiersMenu) {
      // Toggle menu on button click
      this.modifiersButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleModifiersMenu();
      });

      // Handle menu item clicks
      const menuItems = this.modifiersMenu.querySelectorAll('.modifiers-menu-item');
      menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
          const modifier = e.currentTarget.dataset.modifier;
          this.applyModifier(modifier);
          this.hideModifiersMenu();
        });
      });

      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!this.container.contains(e.target)) {
          this.hideModifiersMenu();
        }
      });
    }
  }

  /**
   * Toggle the modifiers menu visibility
   */
  toggleModifiersMenu() {
    if (this.modifiersMenu) {
      this.modifiersMenu.classList.toggle('show');
    }
  }

  /**
   * Hide the modifiers menu
   */
  hideModifiersMenu() {
    if (this.modifiersMenu) {
      this.modifiersMenu.classList.remove('show');
    }
  }

  /**
   * Apply a modifier to the selected object
   */
  applyModifier(modifier) {
    if (modifier === 'edit-text' && this.currentShape) {
      // Handle text editing directly
      this.textEditor.show(this.currentShape);
      return;
    }

    // Dispatch a custom event that the App can listen to
    const event = new CustomEvent('objectModifierAction', {
      detail: { modifier }
    });
    document.dispatchEvent(event);
  }

  /**
   * Update modifier menu states based on the selected object
   */
  updateModifierStates(object) {
    if (!this.modifiersMenu || !object) return;

    // Get the shape type from the object's userData
    const shapeType = object.userData.shapeType || 'mesh';

    // Show/hide text edit option based on shape type
    const textEditItem = this.modifiersMenu.querySelector('[data-modifier="edit-text"]');
    if (textEditItem) {
      textEditItem.style.display = shapeType === 'text' ? 'flex' : 'none';
    }

    // Check if the object has bevel enabled
    const hasBevel = object.userData.bevelEnabled || false;

    // Update bevel checkmark
    const bevelItem = this.modifiersMenu.querySelector('[data-modifier="bevel"] .checkmark');
    if (bevelItem) {
      bevelItem.style.visibility = hasBevel ? 'visible' : 'hidden';
    }
  }

  /**
   * Execute an action (like duplicate)
   */
  executeAction(action) {
    // Dispatch a custom event that the App can listen to
    const event = new CustomEvent('objectControlAction', {
      detail: { action }
    });
    document.dispatchEvent(event);
  }

  /**
   * Position controls above the 3D object in screen space
   */
  positionAboveObject(object) {
    if (!object || !this.camera) return;

    // If object is an array, compute centroid
    const worldPosition = new THREE.Vector3();
    if (Array.isArray(object) && object.length > 0) {
      worldPosition.set(0, 0, 0);
      object.forEach(obj => {
        obj.updateMatrixWorld();
        const tmp = new THREE.Vector3();
        tmp.setFromMatrixPosition(obj.matrixWorld);
        worldPosition.add(tmp);
      });
      worldPosition.divideScalar(object.length);
    } else {
      object.updateMatrixWorld();
      worldPosition.setFromMatrixPosition(object.matrixWorld);
    }

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
