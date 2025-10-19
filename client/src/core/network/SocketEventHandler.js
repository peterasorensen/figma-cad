import { socketManager } from './SocketManager.js';

/**
 * Handles all socket events and manages remote object synchronization
 */
export class SocketEventHandler {
  constructor(app) {
    this.app = app;
    this.setupSocketEventHandlers();
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

    socketManager.onError((error) => {
      console.error('Socket error:', error);

      // Handle canvas not found error
      if (error.message === 'Canvas not found') {
        console.log('Canvas not found, showing error screen...');
        this.app.uiManager.showCanvasNotFoundError();
      }
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
  }

  /**
   * Handle remote object update
   */
  handleObjectUpdated(data) {
    console.log('🔵 Remote object updated:', data);

    // Update visual object in 3D scene
    if (this.app.shapeManager) {
      const existingShape = this.app.shapeManager.getShape(data.id);
      if (existingShape) {
        this.app.shapeManager.updateShapeFromData(existingShape, data);
        console.log('🔵 Updated visual object:', data.id);
      }
    }

    // Update tracking
    if (this.app.remoteObjects.has(data.id)) {
      this.app.remoteObjects.set(data.id, { ...this.app.remoteObjects.get(data.id), ...data });
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

    // Remove from tracking
    this.app.remoteObjects.delete(data.id);
  }
}
