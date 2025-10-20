/**
 * History manager for undo/redo functionality using delta-based actions
 * Tracks per-action changes and applies inverse operations for undo/redo
 */
export class HistoryManager {
  constructor() {
    this.actions = [];
    this.currentIndex = -1;
    this.maxHistorySize = 20;
    this.isRestoring = false; // Flag to prevent history tracking during restoration
    this.pendingUpdate = null; // For capturing before/after during drag operations
  }

  /**
   * Begin capturing state for an update operation (drag start)
   */
  beginUpdate(shapeManager, selectedShapeIds = []) {
    if (this.isRestoring || this.pendingUpdate) return;

    this.pendingUpdate = {
      type: 'update',
      timestamp: Date.now(),
      shapes: [],
      selectedShapes: [...selectedShapeIds]
    };

    // Capture before state for all selected shapes
    for (const id of selectedShapeIds) {
      const shape = shapeManager.shapes.get(id);
      if (shape) {
        this.pendingUpdate.shapes.push({
          id: shape.id,
          type: shape.type,
          before: {
            position: { ...shape.getPosition() },
            rotation: { ...shape.getRotation() },
            properties: { ...shape.properties }
          }
          // Note: scaleDelta is added later in handleDragEnd() before baking
        });
      }
    }
  }

  /**
   * Commit an update operation (drag end)
   */
  commitUpdate(shapeManager, selectedShapeIds = []) {
    if (this.isRestoring || !this.pendingUpdate) return;

    // Capture after state for all affected shapes
    for (const shapeData of this.pendingUpdate.shapes) {
      const shape = shapeManager.shapes.get(shapeData.id);
      if (shape) {
        shapeData.after = {
          position: { ...shape.getPosition() },
          rotation: { ...shape.getRotation() },
          properties: { ...shape.properties }
        };
      }
    }

    // Only add if there were actual changes
    const hasChanges = this.pendingUpdate.shapes.some(shape =>
      !this.positionsEqual(shape.before.position, shape.after.position) ||
      !this.rotationsEqual(shape.before.rotation, shape.after.rotation) ||
      !this.propertiesEqual(shape.before.properties, shape.after.properties) ||
      shape.scaleDelta // If scaleDelta exists, it means a resize happened
    );

    if (hasChanges) {
      this.pushAction(this.pendingUpdate);
    }

    this.pendingUpdate = null;
  }

  /**
   * Capture scale delta for resize operations (before baking)
   * Should be called before baking scale into geometry
   */
  captureScaleDelta(shapeId, scaleDelta) {
    if (this.isRestoring || !this.pendingUpdate) return;

    const shapeData = this.pendingUpdate.shapes.find(s => s.id === shapeId);
    if (shapeData) {
      shapeData.scaleDelta = scaleDelta;
    }
  }

  /**
   * Push a create action
   * Captures full geometry snapshot for exact restoration
   */
  pushCreate(shape, selectedShapeIds = []) {
    if (this.isRestoring) return;

    console.log(`Pushing create action for shape ${shape.id} of type ${shape.type}`);
    console.log(`Shape position:`, shape.getPosition());
    console.log(`Shape properties:`, shape.properties);

    const action = {
      type: 'create',
      timestamp: Date.now(),
      shapes: [{
        id: shape.id,
        type: shape.type,
        after: {
          position: { ...shape.getPosition() },
          rotation: { ...shape.getRotation() },
          properties: { ...shape.properties },
          geometry: shape.serializeGeometry() // Capture full geometry snapshot
        }
      }],
      selectedShapes: [...selectedShapeIds]
    };

    console.log(`Created action:`, action);
    this.pushAction(action);
  }

  /**
   * Push a delete action
   * Captures full geometry snapshot (tombstone) for exact restoration
   */
  pushDelete(shapeIds, shapeManager, selectedShapeIds = []) {
    if (this.isRestoring) return;

    const shapes = [];
    for (const id of shapeIds) {
      const shape = shapeManager.shapes.get(id);
      if (shape) {
        shapes.push({
          id: shape.id,
          type: shape.type,
          before: {
            position: { ...shape.getPosition() },
            rotation: { ...shape.getRotation() },
            properties: { ...shape.properties },
            geometry: shape.serializeGeometry() // Capture full geometry snapshot
          }
        });
      }
    }

    const action = {
      type: 'delete',
      timestamp: Date.now(),
      shapes: shapes,
      selectedShapes: [...selectedShapeIds]
    };

    this.pushAction(action);
  }

  /**
   * Push an AI bulk action (for undoable AI operations)
   * Captures before/after states for all shapes affected by an AI command
   */
  pushAIBulkAction(shapeIds, shapeManager, aiCommand = '', selectedShapeIds = []) {
    if (this.isRestoring) return;

    const shapes = [];
    for (const id of shapeIds) {
      const shape = shapeManager.shapes.get(id);
      if (shape) {
        shapes.push({
          id: shape.id,
          type: shape.type,
          before: {
            position: { ...shape.getPosition() },
            rotation: { ...shape.getRotation() },
            properties: { ...shape.properties },
            geometry: shape.serializeGeometry() // Capture full geometry snapshot
          }
          // after state will be captured when action is committed
        });
      }
    }

    const action = {
      type: 'ai-bulk',
      timestamp: Date.now(),
      aiCommand: aiCommand,
      shapes: shapes,
      selectedShapes: [...selectedShapeIds]
    };

    this.pushAction(action);
    return action; // Return action so we can commit it later
  }

  /**
   * Commit an AI bulk action by capturing after states
   */
  commitAIBulkAction(pendingAction, shapeManager) {
    if (this.isRestoring || !pendingAction) return;

    // Capture after state for all affected shapes
    for (const shapeData of pendingAction.shapes) {
      const shape = shapeManager.shapes.get(shapeData.id);
      if (shape) {
        shapeData.after = {
          position: { ...shape.getPosition() },
          rotation: { ...shape.getRotation() },
          properties: { ...shape.properties },
          geometry: shape.serializeGeometry()
        };
      }
    }

    // Mark action as committed (no need to push again, it's already in history)
    pendingAction.committed = true;
  }

  /**
   * Push an action to history
   */
  pushAction(action) {
    // Remove any actions after current index (when new action is performed)
    if (this.currentIndex < this.actions.length - 1) {
      this.actions = this.actions.slice(0, this.currentIndex + 1);
    }

    // Add new action
    this.actions.push(action);
    this.currentIndex++;

    // Limit history size
    if (this.actions.length > this.maxHistorySize) {
      this.actions.shift();
      this.currentIndex--;
    }
  }

  /**
   * Check if two states are equal
   */
  statesEqual(state1, state2) {
    if (!state1 || !state2) return false;

    // Compare selected shapes
    if (state1.selectedShapes.length !== state2.selectedShapes.length) {
      return false;
    }

    for (let i = 0; i < state1.selectedShapes.length; i++) {
      if (state1.selectedShapes[i] !== state2.selectedShapes[i]) {
        return false;
      }
    }

    // Compare shape counts
    if (Object.keys(state1.shapes).length !== Object.keys(state2.shapes).length) {
      return false;
    }

    // Compare each shape
    for (const id in state1.shapes) {
      if (!state2.shapes[id]) return false;

      const shape1 = state1.shapes[id];
      const shape2 = state2.shapes[id];

      if (shape1.type !== shape2.type ||
          !this.positionsEqual(shape1.position, shape2.position) ||
          !this.rotationsEqual(shape1.rotation, shape2.rotation)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if two positions are approximately equal
   */
  positionsEqual(pos1, pos2, tolerance = 0.01) {
    return Math.abs(pos1.x - pos2.x) < tolerance &&
           Math.abs(pos1.y - pos2.y) < tolerance &&
           Math.abs(pos1.z - pos2.z) < tolerance;
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
   * Check if two property objects are approximately equal
   */
  propertiesEqual(props1, props2, tolerance = 0.01) {
    if (!props1 || !props2) return false;

    // Check all numeric properties (width, height, depth, radius)
    const numericKeys = ['width', 'height', 'depth', 'radius'];
    for (const key of numericKeys) {
      const val1 = props1[key];
      const val2 = props2[key];

      // If both undefined, continue
      if (val1 === undefined && val2 === undefined) continue;

      // If one is defined and other isn't, they're different
      if (val1 === undefined || val2 === undefined) return false;

      // Compare numeric values with tolerance
      if (Math.abs(val1 - val2) >= tolerance) return false;
    }

    // Check non-numeric properties (like color)
    if (props1.color !== props2.color) return false;

    return true;
  }

  /**
   * Undo to previous action
   */
  undo(shapeManager, socketManager) {
    if (!this.canUndo()) {
      console.log(`Cannot undo: currentIndex=${this.currentIndex}, actions.length=${this.actions.length}`);
      return false;
    }

    console.log(`Starting undo: currentIndex=${this.currentIndex}, actionType=${this.actions[this.currentIndex]?.type}`);
    this.isRestoring = true;

    try {
      const action = this.actions[this.currentIndex];

      // Apply inverse operation
      this.applyInverse(shapeManager, action, socketManager);

      this.currentIndex--;
      console.log(`Undo completed: new currentIndex=${this.currentIndex}`);
      return true;
    } finally {
      this.isRestoring = false;
    }
  }

  /**
   * Check if undo is possible
   */
  canUndo() {
    return this.currentIndex >= 0;
  }

  /**
   * Check if redo is possible
   */
  canRedo() {
    return this.currentIndex < this.actions.length - 1;
  }

  /**
   * Redo to next action
   */
  redo(shapeManager, socketManager) {
    if (!this.canRedo()) {
      console.log(`Cannot redo: currentIndex=${this.currentIndex}, actions.length=${this.actions.length}`);
      return false;
    }

    console.log(`Starting redo: currentIndex=${this.currentIndex}, actionType=${this.actions[this.currentIndex + 1]?.type}`);
    this.isRestoring = true;

    try {
      const action = this.actions[this.currentIndex + 1];

      // Apply forward operation
      this.applyForward(shapeManager, action, socketManager);

      this.currentIndex++;
      console.log(`Redo completed: new currentIndex=${this.currentIndex}`);
      return true;
    } finally {
      this.isRestoring = false;
    }
  }

  /**
   * Apply inverse operation for undo
   */
  applyInverse(shapeManager, action, socketManager) {
    switch (action.type) {
      case 'boolean':
        // For boolean operations, undo by:
        // 1. Restoring the target shape to its before geometry
        // 2. Recreating the cutting shape
        console.log(`Undoing boolean operation on target shape ${action.targetShape.id}`);

        // Restore target shape geometry
        const targetShape = shapeManager.shapes.get(action.targetShape.id);
        if (targetShape) {
          targetShape.applySerializedGeometry(action.targetShape.beforeGeometry);

          // Broadcast the geometry restoration
          if (socketManager && socketManager.isConnected) {
            const updateData = {
              id: action.targetShape.id,
              geometry: action.targetShape.beforeGeometry
            };
            socketManager.updateObject(action.targetShape.id, updateData);
          }
        }

        // Recreate the cutting shape
        const cuttingRestoreData = {
          id: action.cuttingShape.id,
          type: action.cuttingShape.type,
          position_x: action.cuttingShape.position.x,
          position_y: action.cuttingShape.position.y,
          position_z: action.cuttingShape.position.z,
          rotation_x: action.cuttingShape.rotation.x,
          rotation_y: action.cuttingShape.rotation.y,
          rotation_z: action.cuttingShape.rotation.z,
          color: action.cuttingShape.properties.color,
          geometry: action.cuttingShape.beforeGeometry
        };

        const cuttingShape = shapeManager.createShapeFromData(cuttingRestoreData);
        if (cuttingShape) {
          shapeManager.addShapeToScene(cuttingShape);

          // Broadcast the cutting shape recreation
          if (socketManager && socketManager.isConnected) {
            socketManager.createObject(cuttingRestoreData);
          }
        }
        break;

      case 'update':
        // For update actions, set shapes to their before state
        for (const shapeData of action.shapes) {
          const shape = shapeManager.shapes.get(shapeData.id);
          if (shape) {
            shape.setPosition(shapeData.before.position);
            shape.setRotation(shapeData.before.rotation);

            // Apply inverse scale if this was a resize operation
            if (shapeData.scaleDelta) {
              const inverseScale = {
                x: 1 / shapeData.scaleDelta.x,
                y: 1 / shapeData.scaleDelta.y,
                z: 1 / shapeData.scaleDelta.z
              };
              shape.mesh.scale.set(inverseScale.x, inverseScale.y, inverseScale.z);
              // Bake the inverse scale into geometry
              shapeManager.bakeShapeScale(shape.id);
            }

            shape.properties = { ...shapeData.before.properties };

            // Broadcast the inverse update to other users
            if (socketManager && socketManager.isConnected) {
              const updateData = {
                position_x: shapeData.before.position.x,
                position_y: shapeData.before.position.y,
                position_z: shapeData.before.position.z,
                rotation_x: shapeData.before.rotation.x,
                rotation_y: shapeData.before.rotation.y,
                rotation_z: shapeData.before.rotation.z,
                // Reset scale to 1,1,1 (baked into geometry)
                scale_x: 1,
                scale_y: 1,
                scale_z: 1,
                // Broadcast final dimensions
                width: shapeData.before.properties.width || shapeData.before.properties.radius || 2,
                height: shapeData.before.properties.height || 2,
                depth: shapeData.before.properties.depth || 2,
                // Include serialized geometry if resize occurred
                geometry: shapeData.scaleDelta ? shape.serializeGeometry() : undefined
              };
              socketManager.updateObject(shapeData.id, updateData);
            }
          }
        }
        break;

      case 'create':
        // For create actions, delete the shapes (inverse of create)
        for (const shapeData of action.shapes) {
          console.log(`Undoing create for shape ${shapeData.id}`);
          const shape = shapeManager.shapes.get(shapeData.id);
          if (shape) {
            console.log(`Found shape ${shapeData.id} in shapes map, removing from scene`);
            if (shape.mesh.parent) {
              shapeManager.scene.remove(shape.mesh);
            }
            shape.dispose();
            shapeManager.shapes.delete(shapeData.id);
            console.log(`Deleted shape ${shapeData.id} from shapes map`);

            // Ensure transform controls are detached if they were attached to the deleted shape
            if (shapeManager.app && shapeManager.app.transform) {
              shapeManager.app.transform.detachIfInvalid();
            }

            // Broadcast the inverse (delete) to other users
            if (socketManager && socketManager.isConnected) {
              console.log(`Broadcasting delete for shape ${shapeData.id}`);
              socketManager.deleteObject(shapeData.id);
            } else {
              console.log(`Not connected to socket, skipping delete broadcast`);
            }
          } else {
            console.warn(`Shape ${shapeData.id} not found in shapes map during undo`);
          }
        }
        break;

      case 'delete':
        // For delete actions, recreate the shapes from geometry snapshot (inverse of delete)
        for (const shapeData of action.shapes) {
          // Use createShapeFromData which handles geometry restoration
          const restoreData = {
            id: shapeData.id,
            type: shapeData.type,
            position_x: shapeData.before.position.x,
            position_y: shapeData.before.position.y,
            position_z: shapeData.before.position.z,
            rotation_x: shapeData.before.rotation.x,
            rotation_y: shapeData.before.rotation.y,
            rotation_z: shapeData.before.rotation.z,
            color: shapeData.before.properties.color,
            width: shapeData.before.properties.width || shapeData.before.properties.radius,
            height: shapeData.before.properties.height,
            depth: shapeData.before.properties.depth,
            geometry: shapeData.before.geometry // Restore from tombstone
          };

          const shape = shapeManager.createShapeFromData(restoreData);
          if (shape) {
            // Ensure shape is added to scene
            shapeManager.addShapeToScene(shape);

            // Broadcast the inverse (create) to other users
            if (socketManager && socketManager.isConnected) {
              socketManager.createObject(restoreData);
            }
          }
        }
        break;
    }

    // Restore selection state
    shapeManager.clearSelection();
    for (const shapeId of action.selectedShapes) {
      const shape = shapeManager.shapes.get(shapeId);
      if (shape) {
        shape.setSelected(true);
      }
    }
    shapeManager.selectedShapes = new Set(action.selectedShapes);
  }

  /**
   * Apply forward operation for redo
   */
  applyForward(shapeManager, action, socketManager) {
    switch (action.type) {
      case 'boolean':
        // For boolean operations, redo by:
        // 1. Applying the after geometry to the target shape
        // 2. Deleting the cutting shape
        console.log(`Redoing boolean operation on target shape ${action.targetShape.id}`);

        // Apply after geometry to target shape
        const targetShape = shapeManager.shapes.get(action.targetShape.id);
        if (targetShape) {
          targetShape.applySerializedGeometry(action.targetShape.afterGeometry);

          // Broadcast the geometry update
          if (socketManager && socketManager.isConnected) {
            const updateData = {
              id: action.targetShape.id,
              geometry: action.targetShape.afterGeometry
            };
            socketManager.updateObject(action.targetShape.id, updateData);
          }
        }

        // Delete the cutting shape (if it exists)
        const cuttingShape = shapeManager.shapes.get(action.cuttingShape.id);
        if (cuttingShape) {
          shapeManager.scene.remove(cuttingShape.mesh);
          cuttingShape.dispose();
          shapeManager.shapes.delete(action.cuttingShape.id);

          // Ensure transform controls are detached if they were attached to the deleted cutting shape
          if (shapeManager.app && shapeManager.app.transform) {
            shapeManager.app.transform.detachIfInvalid();
          }

          // Broadcast the deletion
          if (socketManager && socketManager.isConnected) {
            socketManager.deleteObject(action.cuttingShape.id);
          }
        }
        break;

      case 'update':
        // For update actions, set shapes to their after state
        for (const shapeData of action.shapes) {
          const shape = shapeManager.shapes.get(shapeData.id);
          if (shape) {
            shape.setPosition(shapeData.after.position);
            shape.setRotation(shapeData.after.rotation);

            // Apply forward scale if this was a resize operation
            if (shapeData.scaleDelta) {
              shape.mesh.scale.set(shapeData.scaleDelta.x, shapeData.scaleDelta.y, shapeData.scaleDelta.z);
              // Bake the forward scale into geometry
              shapeManager.bakeShapeScale(shape.id);
            }

            shape.properties = { ...shapeData.after.properties };

            // Broadcast the forward update to other users
            if (socketManager && socketManager.isConnected) {
              const updateData = {
                position_x: shapeData.after.position.x,
                position_y: shapeData.after.position.y,
                position_z: shapeData.after.position.z,
                rotation_x: shapeData.after.rotation.x,
                rotation_y: shapeData.after.rotation.y,
                rotation_z: shapeData.after.rotation.z,
                // Reset scale to 1,1,1 (baked into geometry)
                scale_x: 1,
                scale_y: 1,
                scale_z: 1,
                // Broadcast final dimensions
                width: shapeData.after.properties.width || shapeData.after.properties.radius || 2,
                height: shapeData.after.properties.height || 2,
                depth: shapeData.after.properties.depth || 2,
                // Include serialized geometry if resize occurred
                geometry: shapeData.scaleDelta ? shape.serializeGeometry() : undefined
              };
              socketManager.updateObject(shapeData.id, updateData);
            }
          }
        }
        break;

      case 'create':
        // For create actions, recreate the shapes from geometry snapshot (forward of create)
        for (const shapeData of action.shapes) {
          // Remove any existing shape with the same ID first (cleanup)
          if (shapeManager.shapes.has(shapeData.id)) {
            const existingShape = shapeManager.shapes.get(shapeData.id);
            if (existingShape.mesh.parent) {
              shapeManager.scene.remove(existingShape.mesh);
            }
            existingShape.dispose();
            shapeManager.shapes.delete(shapeData.id);
            console.warn(`Removed existing shape ${shapeData.id} before recreating`);

            // Ensure transform controls are detached if they were attached to the removed shape
            if (shapeManager.app && shapeManager.app.transform) {
              shapeManager.app.transform.detachIfInvalid();
            }
          }

          console.log(`Recreating shape ${shapeData.id} of type ${shapeData.type} at position`, shapeData.after.position);

          // Use createShapeFromData which handles geometry restoration
          const restoreData = {
            id: shapeData.id,
            type: shapeData.type,
            position_x: shapeData.after.position.x,
            position_y: shapeData.after.position.y,
            position_z: shapeData.after.position.z,
            rotation_x: shapeData.after.rotation.x,
            rotation_y: shapeData.after.rotation.y,
            rotation_z: shapeData.after.rotation.z,
            color: shapeData.after.properties.color,
            width: shapeData.after.properties.width || shapeData.after.properties.radius,
            height: shapeData.after.properties.height,
            depth: shapeData.after.properties.depth,
            geometry: shapeData.after.geometry // Restore from snapshot
          };

          const shape = shapeManager.createShapeFromData(restoreData);
          if (shape) {
            // Ensure shape is added to scene
            shapeManager.addShapeToScene(shape);
            console.log(`Successfully created shape ${shape.id}`);

            // Broadcast the forward (create) to other users
            if (socketManager && socketManager.isConnected) {
              console.log(`Broadcasting create for shape ${shapeData.id}`);
              socketManager.createObject(restoreData);
            } else {
              console.log(`Not connected to socket, skipping broadcast`);
            }
          } else {
            console.error(`Failed to create shape ${shapeData.id}`);
          }
        }
        break;

      case 'delete':
        // For delete actions, delete the shapes (forward of delete)
        for (const shapeData of action.shapes) {
          const shape = shapeManager.shapes.get(shapeData.id);
          if (shape) {
            shapeManager.scene.remove(shape.mesh);
            shape.dispose();
            shapeManager.shapes.delete(shapeData.id);

            // Ensure transform controls are detached if they were attached to the deleted shape
            if (shapeManager.app && shapeManager.app.transform) {
              shapeManager.app.transform.detachIfInvalid();
            }

            // Broadcast the forward (delete) to other users
            if (socketManager && socketManager.isConnected) {
              socketManager.deleteObject(shapeData.id);
            }
          }
        }
        break;
    }

    // Restore selection state
    shapeManager.clearSelection();
    for (const shapeId of action.selectedShapes) {
      const shape = shapeManager.shapes.get(shapeId);
      if (shape) {
        shape.setSelected(true);
      }
    }
    shapeManager.selectedShapes = new Set(action.selectedShapes);
  }

  /**
   * Clear all history
   */
  clear() {
    this.actions = [];
    this.currentIndex = -1;
    this.pendingUpdate = null;
  }

  /**
   * Get current history size
   */
  getHistorySize() {
    return this.actions.length;
  }

  /**
   * Get current history index
   */
  getCurrentIndex() {
    return this.currentIndex;
  }
}