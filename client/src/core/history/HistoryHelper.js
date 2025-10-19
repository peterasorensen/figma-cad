/**
 * Helper class for managing history operations and reducing code duplication
 */
export class HistoryHelper {
  constructor(app) {
    this.app = app;
  }

  /**
   * Track shape creation in history
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
   * Track shape deletion in history
   */
  trackShapeDeletion(deletedIds) {
    if (!this.app.historyManager) return;

    const selectedShapeIds = Array.from(this.app.shapeManager.selectedShapes);
    this.app.historyManager.pushDelete(deletedIds, this.app.shapeManager, selectedShapeIds);
    this.app.uiManager.updateUndoRedoButtonStates();
  }

  /**
   * Begin capturing state for undo functionality during drag operations
   */
  beginDragCapture() {
    if (this.app.historyManager) {
      const selectedShapeIds = Array.from(this.app.shapeManager.selectedShapes);
      this.app.historyManager.beginUpdate(this.app.shapeManager, selectedShapeIds);
    }
  }

  /**
   * Commit drag operation to history
   */
  commitDragCapture() {
    if (this.app.historyManager) {
      const selectedShapeIds = Array.from(this.app.shapeManager.selectedShapes);
      this.app.historyManager.commitUpdate(this.app.shapeManager, selectedShapeIds);
      this.app.uiManager.updateUndoRedoButtonStates();
    }
  }

  /**
   * Handle undo operation
   */
  undo() {
    if (this.app.historyManager && this.app.historyManager.undo(this.app.shapeManager, this.app.socketManager)) {
      this.detachAndReattachControls();
      this.app.uiManager.updateUndoRedoButtonStates();

      // Reattach transform controls to selected object if any
      this.reattachControlsToSelection();
    }
  }

  /**
   * Handle redo operation
   */
  redo() {
    if (this.app.historyManager && this.app.historyManager.redo(this.app.shapeManager, this.app.socketManager)) {
      this.detachAndReattachControls();
      this.app.uiManager.updateUndoRedoButtonStates();

      // Reattach transform controls to selected object if any
      this.reattachControlsToSelection();
    }
  }

  /**
   * Detach transform controls during undo/redo operations
   */
  detachAndReattachControls() {
    // Detach transform controls during restoration
    this.app.transform.detach();

    // Hide object controls during restoration
    if (this.app.objectControls) {
      this.app.objectControls.hide();
    }
  }

  /**
   * Reattach transform controls to currently selected shapes
   */
  reattachControlsToSelection() {
    const selectedShapes = Array.from(this.app.shapeManager.selectedShapes);
    if (selectedShapes.length > 0) {
      const shapeId = selectedShapes[selectedShapes.length - 1]; // Get last selected
      const shape = this.app.shapeManager.shapes.get(shapeId);
      if (shape) {
        // Ensure the shape's mesh is properly in the scene
        if (!shape.mesh.parent) {
          this.app.shapeManager.scene.add(shape.mesh);
        }

        // Attach transform controls
        this.app.transform.attach(shape.mesh);

        // Show object controls
        if (this.app.objectControls) {
          this.app.objectControls.show(shape.mesh, shape);
          this.app.objectControls.updateButtonStates(this.app.transform.getMode());
        }
      }
    }
  }
}
