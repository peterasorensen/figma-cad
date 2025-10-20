import * as THREE from 'three';
import { socketManager } from '../network/SocketManager.js';

/**
 * Handles user input events (keyboard, mouse, tool interactions)
 */
export class EventHandler {
  constructor(app) {
    this.app = app;
    this.isSelecting = false;
    this.selectionStart = null;
    this.selectionRect = null;
    this.setupEventListeners();
  }

  /**
   * Set up all event listeners
   */
  setupEventListeners() {
    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });

    // Mouse events for object selection
    const canvas = this.app.scene.getRenderer().domElement;

    // Track mouse down to distinguish clicks from drags
    canvas.addEventListener('mousedown', (e) => {
      this.app.mouseDownPosition = { x: e.clientX, y: e.clientY };
      this.app.mouseDownTime = Date.now();

      // Handle multi-select mode
      if (this.app.currentTool === 'multiselect') {
        this.startSelection(e);
      }
    });

    canvas.addEventListener('click', (e) => {
      this.handleCanvasClick(e);
    });

    canvas.addEventListener('mousemove', (e) => {
      this.handleCanvasMouseMove(e);
    });

    canvas.addEventListener('mouseup', (e) => {
      this.handleCanvasMouseUp(e);
    });

    // Toolbar buttons
    const toolButtons = document.querySelectorAll('.tool-button');
    toolButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        this.handleToolClick(e.target.dataset.tool);
      });
    });

    // Grid toggle button
    const gridToggle = document.getElementById('grid-toggle');
    if (gridToggle) {
      gridToggle.addEventListener('click', () => {
        this.toggleGrid();
      });
    }

    // Snap toggle button
    const snapToggle = document.getElementById('snap-toggle');
    if (snapToggle) {
      snapToggle.addEventListener('click', () => {
        this.toggleSnap();
      });
      // Initialize button state to match SnapManager's default
      snapToggle.classList.toggle('active', this.app.snapManager.isEnabled());
    }

    // Undo button
    const undoButton = document.getElementById('undo-button');
    if (undoButton) {
      undoButton.addEventListener('click', () => {
        this.app.undo();
      });
    }

    // Redo button
    const redoButton = document.getElementById('redo-button');
    if (redoButton) {
      redoButton.addEventListener('click', () => {
        this.app.redo();
      });
    }

    // Authentication button
    const authButton = document.getElementById('auth-button');
    if (authButton) {
      authButton.addEventListener('click', () => {
        if (this.app.auth.isAuthenticated) {
          this.app.auth.signOut();
        } else {
          this.app.authModal.open();
        }
      });
    }

    // New canvas button
    const newCanvasButton = document.getElementById('new-canvas');
    if (newCanvasButton) {
      newCanvasButton.addEventListener('click', () => {
        this.createNewCanvas();
      });
    }

    // Clear canvas button
    const clearCanvasButton = document.getElementById('clear-canvas');
    if (clearCanvasButton) {
      clearCanvasButton.addEventListener('click', () => {
        this.clearCanvas();
      });
    }

    // Share canvas button
    const shareButton = document.getElementById('share-canvas');
    if (shareButton) {
      shareButton.addEventListener('click', () => {
        this.app.uiManager.shareCanvas();
      });
    }

    // Object control actions
    document.addEventListener('objectControlAction', (e) => {
      const { action } = e.detail;
      this.handleObjectControlAction(action);
    });
  }

  /**
   * Handle keyboard shortcuts
   */
  handleKeyDown(e) {
    // Skip keyboard shortcuts if modal is open or user is typing in an input field
    if (this.app.modalIsOpen || this.isTypingInInput(e.target)) {
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'v':
        this.handleToolClick('select');
        break;
      case 'm':
        this.handleToolClick('multiselect');
        break;
      case 'b':
        this.handleToolClick('box');
        break;
      case 's':
        if (!e.ctrlKey && !e.metaKey) {
          this.handleToolClick('sphere');
        }
        break;
      case 'c':
        if (!e.ctrlKey && !e.metaKey) {
          this.handleToolClick('cylinder');
        }
        break;
      case 'r':
        this.handleToolClick('rectangle');
        break;
      case 'o':
        this.handleToolClick('circle');
        break;
      case 't':
        this.handleToolClick('text');
        break;
      case 'q':
        // Set translate mode
        if (this.app.objectControls) {
          this.app.objectControls.setMode('translate');
        }
        break;
      case 'w':
        // Set rotate mode
        if (this.app.objectControls) {
          this.app.objectControls.setMode('rotate');
        }
        break;
      case 'e':
        // Set resize mode
        if (this.app.objectControls) {
          this.app.objectControls.setMode('resize');
        }
        break;
      case 'g':
        if (e.shiftKey) {
          // Toggle snap with Shift+G
          this.toggleSnap();
        } else {
          // Toggle grid with G
          this.toggleGrid();
        }
        break;
      case 'z':
        if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
          // Ctrl+Shift+Z / Cmd+Shift+Z for redo
          e.preventDefault();
          this.app.redo();
        } else if (e.ctrlKey || e.metaKey) {
          // Ctrl+Z / Cmd+Z for undo
          e.preventDefault();
          this.app.undo();
        }
        break;
      case 'escape':
        // Deselect all
        if (this.app.shapeManager) {
          this.app.shapeManager.clearSelection();
        }
        if (this.app.transform) {
          this.app.transform.detach();
        }
        if (this.app.objectControls) {
          this.app.objectControls.hide();
        }
        break;
      case 'delete':
      case 'backspace':
        // Delete selected shapes
        this.handleDelete();
        e.preventDefault();
        break;
      case 'd':
        // Duplicate selected shapes (Ctrl/Cmd + D)
        if ((e.ctrlKey || e.metaKey) && this.app.shapeManager) {
          this.handleDuplicate();
          e.preventDefault();
        }
        break;
      case ' ':
        // Space to cycle through transform modes
        if (this.app.transform && this.app.transform.isAttached()) {
          const newMode = this.app.transform.cycleMode();
          console.log(`Transform mode: ${newMode}`);

          // Update ObjectControls button states to match
          if (this.app.objectControls) {
            this.app.objectControls.updateButtonStates(newMode);
          }

          e.preventDefault();
        }
        break;
    }
  }

  /**
   * Handle tool selection
   */
  handleToolClick(tool) {
    console.log(`Tool selected: ${tool}`);

    // Update active tool button
    const toolButtons = document.querySelectorAll('.tool-button');
    toolButtons.forEach(button => {
      button.classList.remove('active');
      if (button.dataset.tool === tool) {
        button.classList.add('active');
      }
    });

    // If switching away from multiselect mode, clean up selection state
    if (this.app.currentTool === 'multiselect' && tool !== 'multiselect') {
      this.cleanupSelectionState();
    }

    this.app.currentTool = tool;

    // If a shape tool is selected, create the shape at origin
    if (tool !== 'select' && tool !== 'multiselect') {
      const shape = this.app.shapeManager.createShape(tool, { x: 0, y: 1, z: 0 });
      if (shape) {
        // Auto-select the new shape
        this.app.shapeManager.clearSelection();
        this.app.shapeManager.selectShape(shape.id);
        this.app.transform.attach(shape.mesh);

        // Show object controls above the selected object
        if (this.app.objectControls) {
          this.app.objectControls.show(shape.mesh, shape);
          this.app.objectControls.updateButtonStates(this.app.transform.getMode());
        }

        // Track shape creation in history
        this.trackShapeCreation(shape);

        // Broadcast object creation to other users
        this.broadcastShapeCreation(shape);
      }
      // Switch back to select tool after creating
      setTimeout(() => this.handleToolClick('select'), 100);
    }
  }

  /**
   * Handle canvas click for object selection
   */
  handleCanvasClick(event) {
    // Only handle clicks in select mode (not multiselect mode)
    if (this.app.currentTool !== 'select') return;

    // Don't handle clicks if we're dragging transform controls
    if (this.app.transform && this.app.transform.isDraggingNow()) return;

    // Check if this was a drag or a click
    const threshold = 5;
    const timeThreshold = 300;
    if (this.app.mouseDownPosition) {
      const dx = Math.abs(event.clientX - this.app.mouseDownPosition.x);
      const dy = Math.abs(event.clientY - this.app.mouseDownPosition.y);
      const dt = Date.now() - this.app.mouseDownTime;

      if (dx > threshold || dy > threshold || dt > timeThreshold) {
        // This was a drag, not a click - don't change selection
        return;
      }
    }

    // Update mouse position for raycasting
    this.app.raycaster.updateMousePosition(event);

    // Get all shape meshes
    const shapeMeshes = this.app.shapeManager.getAllShapes().map(shape => shape.mesh);

    // Check for intersections
    const intersection = this.app.raycaster.getFirstIntersection(shapeMeshes, false);

    if (intersection) {
      // Find the shape that was clicked
      const shape = this.app.shapeManager.findShapeByMesh(intersection.object);

      if (shape) {
        // Shift+click for multi-select
        const addToSelection = event.shiftKey;
        this.app.shapeManager.selectShape(shape.id, addToSelection);

        // Determine current selection and attach appropriate controls
        const selectedShapes = this.app.shapeManager.getSelectedShapes();
        if (selectedShapes.length > 1) {
          // Attach group controls to multiple selections
          const allMeshes = selectedShapes.map(s => s.mesh);
          this.app.transform.attachMultiple(allMeshes);

          // Show object controls at centroid of selection
          if (this.app.objectControls) {
            this.app.objectControls.show(allMeshes, null);
            this.app.objectControls.updateButtonStates(this.app.transform.getMode());
          }
        } else {
          // Single selection - attach to the shape
          this.app.transform.attach(shape.mesh);

          // Show object controls above the selected object
          if (this.app.objectControls) {
            this.app.objectControls.show(shape.mesh, shape);
            this.app.objectControls.updateButtonStates(this.app.transform.getMode());
          }
        }
      }
    } else {
      // Clicked on empty space - clear selection
      if (!event.shiftKey) {
        this.app.shapeManager.clearSelection();
        this.app.transform.detach();

        // Hide object controls
        if (this.app.objectControls) {
          this.app.objectControls.hide();
        }
      }
    }
  }

  /**
   * Handle object control actions (like duplicate from UI)
   */
  handleObjectControlAction(action) {
    switch (action) {
      case 'duplicate':
        // Duplicate selected shapes (same as Ctrl+D)
        if (this.app.shapeManager) {
          this.handleDuplicate();
        }
        break;
    }
  }

  /**
   * Handle duplicate action
   */
  handleDuplicate() {
    const duplicatedShapes = this.app.shapeManager.duplicateSelected();
    if (duplicatedShapes.length > 0) {
      // Track duplicated shapes in history
      this.trackShapeCreation(duplicatedShapes);

      // Broadcast duplicated shapes to other users
      duplicatedShapes.forEach(shape => {
        this.broadcastShapeCreation(shape);
      });

      // Attach transform controls to the last duplicated shape
      const lastShape = duplicatedShapes[duplicatedShapes.length - 1];
      this.app.transform.attach(lastShape.mesh);

      // Show object controls above the selected object
      if (this.app.objectControls) {
        this.app.objectControls.show(lastShape.mesh, lastShape);
        this.app.objectControls.updateButtonStates(this.app.transform.getMode());
      }
    }
  }

  /**
   * Handle delete action
   */
  handleDelete() {
    if (this.app.shapeManager) {
      // Capture state before deletion for undo functionality
      if (this.app.historyManager) {
        const deletedIds = Array.from(this.app.shapeManager.selectedShapes);
        const selectedShapeIds = Array.from(this.app.shapeManager.selectedShapes);
        this.app.historyManager.pushDelete(deletedIds, this.app.shapeManager, selectedShapeIds);
        this.app.uiManager.updateUndoRedoButtonStates();
      }

      this.app.transform.detach();
      if (this.app.objectControls) {
        this.app.objectControls.hide();
      }
      const deletedIds = this.app.shapeManager.deleteSelected();

      // Broadcast deletion to other users
      if (socketManager.isConnected && this.app.currentCanvasId && deletedIds.length > 0) {
        deletedIds.forEach(id => {
          socketManager.deleteObject(id);
          console.log('📤 Broadcasted object deletion:', id);
        });
      }
    }
  }

  /**
   * Toggle grid visibility
   */
  toggleGrid() {
    if (this.app.grid) {
      this.app.grid.toggleGrid();
      const gridToggle = document.getElementById('grid-toggle');
      if (gridToggle) {
        gridToggle.classList.toggle('active');
      }
    }
  }

  /**
   * Toggle snap functionality
   */
  toggleSnap() {
    if (this.app.snapManager) {
      const newState = !this.app.snapManager.isEnabled();
      this.app.snapManager.setEnabled(newState);
      const snapToggle = document.getElementById('snap-toggle');
      if (snapToggle) {
        snapToggle.classList.toggle('active', newState);
      }
    }
  }

  /**
   * Track shape creation in history (consolidated method)
   */
  trackShapeCreation(shapes) {
    if (!this.app.historyManager) return;

    const selectedShapeIds = Array.from(this.app.shapeManager.selectedShapes);

    if (Array.isArray(shapes)) {
      // Multiple shapes (duplication)
      shapes.forEach(shape => {
        this.app.historyManager.pushCreate(shape, selectedShapeIds);
      });
    } else {
      // Single shape
      this.app.historyManager.pushCreate(shapes, selectedShapeIds);
    }

    this.app.uiManager.updateUndoRedoButtonStates();
  }

  /**
   * Broadcast shape creation to other users
   */
  broadcastShapeCreation(shape) {
    if (socketManager.isConnected && this.app.currentCanvasId) {
      const objectData = {
        id: shape.id,
        type: shape.type,
        position_x: shape.mesh.position.x,
        position_y: shape.mesh.position.y,
        position_z: shape.mesh.position.z,
        rotation_x: shape.mesh.rotation.x,
        rotation_y: shape.mesh.rotation.y,
        rotation_z: shape.mesh.rotation.z,
        color: shape.properties.color || '#ffffff',
        geometry: shape.serializeGeometry(),
        canvas_id: this.app.currentCanvasId,
        created_by: this.app.auth.userId
      };

      socketManager.createObject(objectData);
      console.log('📤 Broadcasted object creation with geometry:', objectData.id);
    }
  }

  /**
   * Check if user is typing in an input field
   */
  isTypingInInput(activeElement) {
    if (!activeElement) return false;

    const tagName = activeElement.tagName.toLowerCase();
    const inputTypes = ['input', 'textarea', 'select'];

    if (inputTypes.includes(tagName)) {
      // For input fields, also check if it's a text input
      if (tagName === 'input') {
        const inputType = activeElement.type.toLowerCase();
        const textInputTypes = ['text', 'email', 'password', 'search', 'tel', 'url'];
        return textInputTypes.includes(inputType) || !inputType; // Default input type is text
      }
      return true;
    }

    return false;
  }

  /**
   * Create a new canvas and navigate to it
   */
  async createNewCanvas() {
    try {
      console.log('🎯 Creating new canvas from button click');

      // Create a new canvas ID
      const newCanvasId = await this.app.createNewCanvas();

      // Create the new URL with the canvas ID
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('canvas', newCanvasId);

      // Navigate to the new canvas URL
      window.location.href = newUrl.toString();

    } catch (error) {
      console.error('Error creating new canvas:', error);
      // Show error notification
      this.app.uiManager.showNotification('Failed to create new canvas', 'error');
    }
  }

  /**
   * Clear the entire canvas with confirmation
   */
  clearCanvas() {
    // Show confirmation dialog
    if (confirm('Warning: This will clear the entire canvas and remove all shapes. This action cannot be undone. Are you sure?')) {
      this.app.clearCanvas();
    }
  }

  /**
   * Start selection rectangle for multi-select mode
   */
  startSelection(event) {
    this.isSelecting = true;
    this.selectionStart = { x: event.clientX, y: event.clientY };

    // Disable orbit controls during multi-select
    if (this.app.controls && this.app.controls.controls) {
      this.app.controls.controls.enabled = false;
    }

    this.createSelectionRectangle();
  }

  /**
   * Create visual selection rectangle
   */
  createSelectionRectangle() {
    if (this.selectionRect) {
      document.body.removeChild(this.selectionRect);
    }

    this.selectionRect = document.createElement('div');
    this.selectionRect.style.position = 'absolute';
    this.selectionRect.style.border = '2px dashed #5a8fd6';
    this.selectionRect.style.backgroundColor = 'rgba(90, 143, 214, 0.1)';
    this.selectionRect.style.pointerEvents = 'none';
    this.selectionRect.style.zIndex = '1000';
    document.body.appendChild(this.selectionRect);
  }

  /**
   * Handle canvas mouse move for selection rectangle
   */
  handleCanvasMouseMove(event) {
    // Don't handle multi-select mouse moves if we're dragging transform controls
    if (this.app.transform && this.app.transform.isDraggingNow()) return;

    if (!this.isSelecting || !this.selectionRect || this.app.currentTool !== 'multiselect') {
      return;
    }

    const currentX = event.clientX;
    const currentY = event.clientY;

    const left = Math.min(this.selectionStart.x, currentX);
    const top = Math.min(this.selectionStart.y, currentY);
    const width = Math.abs(currentX - this.selectionStart.x);
    const height = Math.abs(currentY - this.selectionStart.y);

    this.selectionRect.style.left = left + 'px';
    this.selectionRect.style.top = top + 'px';
    this.selectionRect.style.width = width + 'px';
    this.selectionRect.style.height = height + 'px';
  }

  /**
   * Handle canvas mouse up to complete selection
   */
  handleCanvasMouseUp(event) {
    if (!this.isSelecting || this.app.currentTool !== 'multiselect') {
      return;
    }

    this.isSelecting = false;

    const currentX = event.clientX;
    const currentY = event.clientY;

    // Calculate selection rectangle in screen coordinates
    const left = Math.min(this.selectionStart.x, currentX);
    const top = Math.min(this.selectionStart.y, currentY);
    const right = Math.max(this.selectionStart.x, currentX);
    const bottom = Math.max(this.selectionStart.y, currentY);

    // Only proceed if there's a meaningful selection area
    const minSelectionSize = 5;
    if (right - left > minSelectionSize && bottom - top > minSelectionSize) {
      this.selectShapesInRectangle(left, top, right, bottom);
    }

    // Clean up selection rectangle
    if (this.selectionRect) {
      document.body.removeChild(this.selectionRect);
      this.selectionRect = null;
    }

    // Re-enable orbit controls
    if (this.app.controls && this.app.controls.controls) {
      this.app.controls.controls.enabled = true;
    }
  }

  /**
   * Clean up selection state when switching away from multiselect
   */
  cleanupSelectionState() {
    this.isSelecting = false;

    // Clean up selection rectangle if it exists
    if (this.selectionRect) {
      document.body.removeChild(this.selectionRect);
      this.selectionRect = null;
    }

    // Re-enable orbit controls
    if (this.app.controls && this.app.controls.controls) {
      this.app.controls.controls.enabled = true;
    }
  }

  /**
   * Select shapes within the selection rectangle
   */
  selectShapesInRectangle(left, top, right, bottom) {
    const canvas = this.app.scene.getRenderer().domElement;
    const canvasRect = canvas.getBoundingClientRect();

    // Convert screen coordinates to canvas-relative coordinates (0 to canvas width/height)
    const canvasLeft = left - canvasRect.left;
    const canvasTop = top - canvasRect.top;
    const canvasRight = right - canvasRect.left;
    const canvasBottom = bottom - canvasRect.top;

    // Get all shapes and check which ones are within the selection rectangle
    const shapes = this.app.shapeManager.getAllShapes();
    const selectedShapes = [];


    shapes.forEach(shape => {
      const mesh = shape.mesh;

      // Get the world position of the mesh
      const worldPosition = new THREE.Vector3();
      mesh.getWorldPosition(worldPosition);

      // Project to screen coordinates
      const screenPos = worldPosition.clone();
      screenPos.project(this.app.scene.getCamera());

      // Convert NDC (-1 to 1) to canvas coordinates (0 to width/height)
      const canvasX = (screenPos.x + 1) * canvasRect.width / 2;
      const canvasY = (-screenPos.y + 1) * canvasRect.height / 2;

      // Check if the shape is within the selection rectangle
      // Note: canvasY is from top (0) to bottom (height), canvasTop is smaller Y, canvasBottom is larger Y
      if (canvasX >= canvasLeft && canvasX <= canvasRight &&
          canvasY >= canvasTop && canvasY <= canvasBottom) {
        selectedShapes.push(shape);
      }
    });

    // Clear current selection and select the shapes within the rectangle
    this.app.shapeManager.clearSelection();
    selectedShapes.forEach(shape => {
      this.app.shapeManager.selectShape(shape.id, true);
    });

    // Handle transform controls for multiple selections
    if (selectedShapes.length > 0) {
      if (selectedShapes.length === 1) {
        // Single selection - attach to the shape
        const shape = selectedShapes[0];
        this.app.transform.attach(shape.mesh);

        // Show object controls above the selected object
        if (this.app.objectControls) {
          this.app.objectControls.show(shape.mesh, shape);
          this.app.objectControls.updateButtonStates(this.app.transform.getMode());
        }
      } else {
        // Multiple selection - attach group transform controls
        const allMeshes = selectedShapes.map(shape => shape.mesh);
        this.app.transform.attachMultiple(allMeshes);

        // Show object controls at centroid of selection
        if (this.app.objectControls) {
          this.app.objectControls.show(allMeshes, null);
          this.app.objectControls.updateButtonStates(this.app.transform.getMode());
        }

        console.log(`Multi-selected ${selectedShapes.length} shapes with group controls`);
      }
    } else {
      // No shapes selected, detach transform controls
      this.app.transform.detach();
      if (this.app.objectControls) {
        this.app.objectControls.hide();
      }
    }

    console.log(`Selected ${selectedShapes.length} shapes with rectangle selection`);
  }
}
