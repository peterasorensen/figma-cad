import { socketManager } from './SocketManager.js';

/**
 * Handles all socket events and manages remote object synchronization
 */
export class SocketEventHandler {
  constructor(app) {
    this.app = app;
    this.aiChatCallback = null; // Callback to notify AI chat of affected shapes
    this.setupSocketEventHandlers();
  }

  /**
   * Register AI chat component for tracking AI operations
   */
  registerAIChat(aiChat) {
    this.aiChatCallback = aiChat;
  }

  /**
   * Set up all socket event handlers
   */
  setupSocketEventHandlers() {
    socketManager.onCanvasState((data) => {
      this.handleCanvasState(data);
    });

    socketManager.onUserJoined((data) => {
      this.handleUserJoined(data);
    });

    socketManager.onUserLeft((data) => {
      this.handleUserLeft(data);
    });

    socketManager.onCursorUpdate((data) => {
      this.handleCursorUpdate(data);
    });

    socketManager.onObjectCreated((data) => {
      this.handleObjectCreated(data);
    });

    socketManager.onObjectUpdated((data) => {
      this.handleObjectUpdated(data);
    });

    socketManager.onObjectDeleted((data) => {
      this.handleObjectDeleted(data);
    });

    console.log('🔧 Setting up boolean operation callback...');
    socketManager.onBooleanOperation((data) => {
      console.log('🔧 SocketEventHandler callback triggered with data:', data);
      this.handleBooleanOperation(data);
    });
    console.log('🔧 Boolean operation callback set up');

    socketManager.onError((error) => {
      console.error('Socket error:', error);

      // Handle canvas not found error
      if (error.message === 'Canvas not found') {
        console.log('Canvas not found, showing error screen...');
        this.app.uiManager.showCanvasNotFoundError();
      }
    });

    // Handle object lock events
    socketManager.onObjectLockAcquired((data) => {
      this.handleObjectLockAcquired(data);
    });

    socketManager.onObjectLockReleased((data) => {
      this.handleObjectLockReleased(data);
    });
  }

  /**
   * Handle canvas state received from server
   */
  handleCanvasState(data) {
    console.log('🔄 Received canvas state:', {
      objectsCount: data.objects?.length || 0,
      sessionsCount: data.sessions?.length || 0,
      sessions: data.sessions?.map(s => ({ userId: s.user_id, lastSeen: s.last_seen }))
    });

    // Load objects and user sessions (existing sessions, not new joins)
    if (data.objects) {
      data.objects.forEach(obj => this.handleObjectCreated(obj));

      // Mark initial state as captured (no longer need snapshots with delta-based system)
      if (!this.app.initialStateCaptured) {
        this.app.initialStateCaptured = true;
        this.app.uiManager.updateUndoRedoButtonStates();
      }
    }

    // Handle existing user sessions (don't treat as new joins)
    if (data.sessions) {
      console.log('🔄 Processing existing sessions:', data.sessions.length);
      const currentUserId = this.app.auth.userId;

      data.sessions.forEach(session => {
        console.log('🔄 Adding user to online set:', session.user_id, '(current:', currentUserId + ')');
        this.app.onlineUsers.add(session.user_id);

        this.handleExistingSession(session);
      });

      // Update presence display after loading existing sessions
      this.app.uiManager.updatePresenceDisplay();
      console.log('🔄 Updated presence display, total users:', this.app.onlineUsers.size);

      // Force initial cursor position update for current user after a short delay
      setTimeout(() => {
        if (this.app.auth.userId && this.app.cursorManager && this.app.cursorManager.getCursor(this.app.auth.userId)) {
          console.log('🎯 Forcing initial cursor position update for current user');
          this.app.updateCursorPosition();
        }
      }, 100);
    }
  }

  /**
   * Handle existing session (for canvas state loading)
   */
  handleExistingSession(session) {
    console.log('🎯 Creating cursor for existing session:', session.user_id, 'at position:', session.cursor_x, session.cursor_y);

    // Create cursor for existing user session (skip if already exists)
    if (this.app.cursorManager) {
      // Check if cursor already exists to prevent duplicates
      if (this.app.cursorManager.getCursor(session.user_id)) {
        console.log('🎯 Cursor already exists for', session.user_id, '- updating position if needed');
      } else {
        const colorIndex = this.app.cursorManager.getUserColorIndex(session.user_id);

        // Use email from session if available, otherwise fall back to user ID
        let userName;
        if (session.user_email) {
          userName = session.user_id === this.app.auth.userId ? 'You' : session.user_email.split('@')[0];
        } else {
          userName = session.user_id === this.app.auth.userId ? 'You' : `User ${session.user_id.substring(0, 8)}`;
        }

        this.app.cursorManager.addUserCursor(session.user_id, userName, colorIndex);
        console.log('🎯 Created new cursor for', session.user_id);
      }

      // Update cursor position if available and not at default (0,0,0) for current user
      if (session.cursor_x !== undefined && session.cursor_y !== undefined) {
        // For current user, don't position at (0,0,0) - let normal cursor updates handle it
        if (session.user_id === this.app.auth.userId && session.cursor_x === 0 && session.cursor_y === 0 && (session.cursor_z === 0 || session.cursor_z === undefined)) {
          console.log('🎯 Current user cursor at default position - will be updated by mouse movement');
        } else {
          console.log('🎯 Positioning cursor for', session.user_id, 'at', session.cursor_x, session.cursor_y);
          this.app.cursorManager.updateCursorPosition(session.user_id, {
            x: session.cursor_x,
            y: session.cursor_y,
            z: session.cursor_z || 0
          }, Date.now());
        }
      } else {
        // If cursor exists but no position data, position at appropriate default
        if (this.app.cursorManager.getCursor(session.user_id)) {
          console.log('🎯 No position data for existing cursor', session.user_id, '- using default position');
          if (session.user_id === this.app.auth.userId) {
            console.log('🎯 Current user cursor will be positioned by normal update logic');
          } else {
            console.log('🎯 Positioning other user cursor at scene center');
            this.app.cursorManager.updateCursorPosition(session.user_id, {
              x: 0,
              y: 0,
              z: 0
            }, Date.now());
          }
        }
      }

      // If this is the current user and cursor exists, trigger initial position update
      if (session.user_id === this.app.auth.userId && this.app.cursorManager.getCursor(session.user_id)) {
        console.log('🎯 Triggering initial cursor position update for current user');
        setTimeout(() => {
          this.app.updateCursorPosition();
        }, 50);
      }
    }
  }

  /**
   * Handle user joined event
   */
  handleUserJoined(data) {
    console.log('🔵 User joined event received:', data);

    // Check if data exists and has required properties
    if (!data || !data.userId) {
      console.error('🔴 Invalid user joined data:', data);
      return;
    }

    // Skip if this is the current user (they should already have a cursor from canvas state)
    if (data.userId === this.app.auth.userId) {
      console.log('🔵 Skipping user joined for current user (cursor should exist from canvas state)');
      return;
    }

    // Add user to online users set
    this.app.onlineUsers.add(data.userId);

    // Update presence display
    this.app.uiManager.updatePresenceDisplay();

    // Show join notification for other users
    const displayName = data.userEmail ? data.userEmail.split('@')[0] : `User ${data.userId.substring(0, 8)}`;
    this.app.uiManager.showNotification(`${displayName} joined`, 'join');

    // Update cursor label if cursor exists, or create cursor if it doesn't
    if (this.app.cursorManager && this.app.cursorManager.getCursor(data.userId)) {
      console.log('🔵 Updating cursor label for existing user:', data.userId);
      const userName = data.userEmail ? data.userEmail.split('@')[0] : `User ${data.userId.substring(0, 8)}`;
      // Update the existing cursor's label
      const cursor = this.app.cursorManager.getCursor(data.userId);
      if (cursor) {
        cursor.userName = userName;
        this.app.cursorManager.updateCursorLabel(cursor);
      }
    } else {
      // Create cursor if it doesn't exist (shouldn't happen for existing canvas users)
      console.log('🔵 Creating cursor for joined user (unexpected):', data.userId);
      const colorIndex = this.app.cursorManager.getUserColorIndex(data.userId);
      const userName = data.userEmail ? data.userEmail.split('@')[0] : `User ${data.userId.substring(0, 8)}`;

      this.app.cursorManager.addUserCursor(data.userId, userName, colorIndex);
    }
  }

  /**
   * Handle user left event
   */
  handleUserLeft(data) {
    console.log('🔴 User left event received:', data);

    // Check if data exists and has required properties
    if (!data || !data.userId) {
      console.error('🔴 Invalid user left data:', data);
      return;
    }

    // Skip if this is the current user (they shouldn't remove their own cursor)
    if (data.userId === this.app.auth.userId) {
      console.log('🔵 Skipping user left for current user (should not remove own cursor)');
      return;
    }

    // Remove user from online users set
    this.app.onlineUsers.delete(data.userId);

    // Clean up any locks held by the disconnected user
    this.app.cleanupLocksForUser(data.userId);

    // Update presence display
    this.app.uiManager.updatePresenceDisplay();

    // Show leave notification
    const displayName = data.userEmail || `User ${data.userId.substring(0, 8)}`;
    this.app.uiManager.showNotification(`${displayName} left`, 'leave');

    // Remove user's visual cursor
    if (this.app.cursorManager) {
      console.log('🔴 Removing cursor for left user:', data.userId);
      this.app.cursorManager.removeUserCursor(data.userId);
    }
  }

  /**
   * Handle cursor update event
   */
  handleCursorUpdate(data) {
    // Check if data exists and has required properties
    if (!data || !data.userId) {
      console.error('🔴 Invalid cursor update data:', data);
      return;
    }

    // Update remote cursor position visually
    if (this.app.cursorManager) {
      this.app.cursorManager.updateCursorPosition(data.userId, data, Date.now());
    }
  }

  /**
   * Handle remote object creation
   */
  handleObjectCreated(data) {
    console.log('🔵 Remote object created:', data);

    // Check if data exists and has required properties
    if (!data || !data.id) {
      console.error('🔴 Invalid object created data:', data);
      return;
    }

    // Check if object already exists (prevent duplicates from local creation echo)
    if (this.app.shapeManager && this.app.shapeManager.getShape(data.id)) {
      console.log('🔵 Object already exists, skipping creation:', data.id);
      this.app.remoteObjects.set(data.id, data);
      return;
    }

    // Create visual object in 3D scene
    if (this.app.shapeManager) {
      const shape = this.app.shapeManager.createShapeFromData(data);
      if (shape) {
        this.app.shapeManager.addShapeToScene(shape);
        console.log('🔵 Created visual object:', shape.id);
      }
    }

    // Track for synchronization
    this.app.remoteObjects.set(data.id, data);

    // Notify AI chat if tracking AI operations
    if (this.aiChatCallback && this.aiChatCallback.trackAffectedShape) {
      this.aiChatCallback.trackAffectedShape(data.id);
    }
  }

  /**
   * Handle remote object update
   */
  handleObjectUpdated(data) {
    // Update visual object in 3D scene
    if (this.app.shapeManager) {
      const existingShape = this.app.shapeManager.getShape(data.id);
      if (existingShape) {
        this.app.shapeManager.updateShapeFromData(existingShape, data);
      }
    }

    // Update tracking
    if (this.app.remoteObjects.has(data.id)) {
      this.app.remoteObjects.set(data.id, { ...this.app.remoteObjects.get(data.id), ...data });
    }

    // Notify AI chat if tracking AI operations
    if (this.aiChatCallback && this.aiChatCallback.trackAffectedShape) {
      this.aiChatCallback.trackAffectedShape(data.id);
    }
  }

  /**
   * Handle remote object deletion
   */
  handleObjectDeleted(data) {
    console.log('🔴 Remote object deleted:', data.id);

    // Remove visual object from 3D scene
    if (this.app.shapeManager) {
      this.app.shapeManager.removeShape(data.id);
      console.log('🔴 Removed visual object:', data.id);
    }

    // Ensure transform controls are detached if they were attached to the deleted object
    if (this.app.transform) {
      this.app.transform.detachIfInvalid();
    }

    // Remove from tracking
    this.app.remoteObjects.delete(data.id);

    // Notify AI chat if tracking AI operations
    if (this.aiChatCallback && this.aiChatCallback.trackAffectedShape) {
      this.aiChatCallback.trackAffectedShape(data.id);
    }
  }

  /**
   * Handle boolean operation event
   */
  handleBooleanOperation(data) {
    console.log('🔧 AI BOOLEAN OPERATION EVENT RECEIVED:', data);
    console.log('🔧 Operation type:', data?.operation);
    console.log('🔧 Cutting shape ID:', data?.cuttingShapeId);
    console.log('🔧 Target shape ID:', data?.targetShapeId);
    console.log('🔧 Timestamp:', data?.timestamp);

    if (!data || !data.operation) {
      console.error('🔴 INVALID BOOLEAN OPERATION DATA - MISSING OPERATION:', data);
      return;
    }

    const { operation, cuttingShapeId, targetShapeId } = data;

    console.log('🔧 Processing operation:', operation);

    // Get the shapes from the shape manager
    if (!this.app.shapeManager) {
      console.error('🔴 SHAPE MANAGER NOT AVAILABLE FOR BOOLEAN OPERATION');
      return;
    }

    console.log('🔧 Shape manager available, looking up shapes...');
    const cuttingShape = this.app.shapeManager.getShape(cuttingShapeId);
    const targetShape = this.app.shapeManager.getShape(targetShapeId);

    console.log('🔧 Cutting shape lookup result:', !!cuttingShape, 'for ID:', cuttingShapeId);
    console.log('🔧 Target shape lookup result:', !!targetShape, 'for ID:', targetShapeId);

    if (cuttingShape) {
      console.log('🔧 Cutting shape details:', {
        id: cuttingShape.id,
        type: cuttingShape.type,
        position: cuttingShape.getPosition(),
        visible: cuttingShape.mesh?.visible
      });
    } else {
      console.log('🔧 Available shapes in manager:', this.app.shapeManager.getAllShapes().map(s => ({id: s.id, type: s.type})));
    }

    if (targetShape) {
      console.log('🔧 Target shape details:', {
        id: targetShape.id,
        type: targetShape.type,
        position: targetShape.getPosition(),
        visible: targetShape.mesh?.visible
      });
    }

    if (!cuttingShape) {
      console.error('🔴 Cutting shape not found:', cuttingShapeId);
      console.log('🔧 Available shapes:', this.app.shapeManager.getAllShapes().map(s => ({id: s.id, type: s.type})));
      return;
    }

    if (!targetShape) {
      console.error('🔴 TARGET SHAPE NOT FOUND:', targetShapeId);
      console.log('🔧 Available shapes:', this.app.shapeManager.getAllShapes().map(s => ({id: s.id, type: s.type})));
      return;
    }

    console.log('🔧 STARTING BOOLEAN OPERATION:', operation, 'cutting:', cuttingShape.type, 'from:', targetShape.type);
    console.log('🔧 Cutting shape position:', cuttingShape.getPosition());
    console.log('🔧 Target shape position:', targetShape.getPosition());

    // Perform the boolean operation using the client's BooleanManager
    console.log('🔧 Checking if BooleanManager is available...');
    if (this.app.booleanManager) {
      console.log('🔧 BooleanManager found, checking if active:', this.app.booleanManager.isActive());
      let success = false;

      switch (operation) {
        case 'subtract':
          console.log('🔧 PROCESSING SUBTRACT OPERATION');
          console.log('🔧 Setting cutting object temporarily...');
          // Temporarily set the cutting object for the boolean operation
          const originalCuttingObject = this.app.booleanManager.cuttingObject;
          console.log('🔧 Original cutting object:', originalCuttingObject?.id || 'none');
          this.app.booleanManager.cuttingObject = cuttingShape;
          console.log('🔧 Set cutting object to:', cuttingShape.id);


          console.log('🔧 CALLING applySubtract...');
          success = this.app.booleanManager.applySubtract(targetShape);
          console.log('🔧 applySubtract returned:', success);

          // Restore original cutting object (should be null)
          this.app.booleanManager.cuttingObject = originalCuttingObject;
          console.log('🔧 Restored original cutting object:', originalCuttingObject?.id || 'none');

          if (success) {
            console.log('✅ BOOLEAN SUBTRACT OPERATION SUCCEEDED!');
            console.log('✅ Target shape after operation:', targetShape.getPosition());

            // Broadcast the geometry change to persist it
            if (this.app.socketManager && this.app.socketManager.isConnected) {
              const geometryData = targetShape.serializeGeometry();
              if (geometryData) {
                const updateData = {
                  id: targetShape.id,
                  geometry: geometryData
                };
                this.app.socketManager.sendObjectUpdate(targetShape.id, updateData);
                console.log('🔧 Geometry update sent to server');
              }
            }
          } else {
            console.error('🔴 BOOLEAN SUBTRACT OPERATION FAILED!');
            console.error('🔴 applySubtract returned false for target:', targetShape.id, 'cutting:', cuttingShape.id);
          }
          break;
        case 'union':
          console.log('🔧 Boolean union requested - union operation not yet implemented, keeping both shapes');
          success = true; // Don't fail, just keep both shapes
          console.log('✅ Union operation completed (no-op)');
          break;
        case 'intersect':
          // TODO: Implement intersect if needed
          console.log('🔧 Boolean intersect not yet implemented on client side');
          success = false;
          break;
        default:
          console.error('🔴 UNKNOWN BOOLEAN OPERATION:', operation);
          success = false;
          break;
      }

      console.log('🔧 Boolean operation processing complete. Success:', success);
      if (success) {
        console.log('✅ AI BOOLEAN OPERATION COMPLETED SUCCESSFULLY');
      } else {
        console.error('🔴 AI BOOLEAN OPERATION FAILED - check BooleanManager.applySubtract');
      }
    } else {
      console.error('🔴 BooleanManager not available');
    }

    // Notify AI chat if tracking AI operations
    if (this.aiChatCallback && this.aiChatCallback.trackAffectedShape) {
      this.aiChatCallback.trackAffectedShape(targetShapeId);
      this.aiChatCallback.trackAffectedShape(cuttingShapeId);
    }
  }

  /**
   * Handle remote object lock acquisition
   */
  handleObjectLockAcquired(data) {
    console.log('🔒 Remote object lock acquired:', data);
    if (this.app.handleRemoteLockAcquired) {
      this.app.handleRemoteLockAcquired(data);
    }
  }

  /**
   * Handle remote object lock release
   */
  handleObjectLockReleased(data) {
    console.log('🔓 Remote object lock released:', data);
    if (this.app.handleRemoteLockReleased) {
      this.app.handleRemoteLockReleased(data);
    }
  }
}
