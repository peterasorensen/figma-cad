import { Scene } from './core/Scene.js';
import { Controls } from './core/Controls.js';
import { Grid } from './core/Grid.js';
import { Renderer } from './core/Renderer.js';
import { Raycaster } from './core/Raycaster.js';
import { Transform } from './core/Transform.js';
import { ShapeManager } from './shapes/ShapeManager.js';
import { AuthModal } from './components/AuthModal.js';
import { auth, supabase } from './core/Auth.js';
import { socketManager } from './core/SocketManager.js';
import { CursorManager } from './core/CursorManager.js';

/**
 * Main application class
 * Orchestrates all components and manages application lifecycle
 */
export class App {
  constructor() {
    this.scene = null;
    this.controls = null;
    this.grid = null;
    this.renderer = null;
    this.raycaster = null;
    this.transform = null;
    this.shapeManager = null;
    this.authModal = null;
    this.cursorManager = null;
    this.currentCanvasId = null;
    this.currentTool = 'select';
    this.mouseDownPosition = null;
    this.mouseDownTime = 0;
    this.remoteObjects = new Map(); // Track remote objects for sync
    this.remoteCursors = new Map(); // Track remote cursors
    this.lastCursorUpdate = Date.now(); // For throttling cursor updates
    this.lastObjectUpdate = Date.now(); // For throttling object updates
    this.wasAuthenticated = false; // Track previous auth state
    this.onlineUsers = new Set(); // Track online users for presence display
    this.notifications = []; // Track active notifications
    this.lastNotification = null; // For throttling duplicate notifications
    this.initialStateCaptured = false; // Flag to ensure initial state is only captured once

    this.init();
  }

  async init() {
    try {
      console.log('Initializing CollabCanvas...');

      // Initialize authentication first
      await this.initAuth();

    // Get canvas element
    const canvas = document.getElementById('canvas');
    if (!canvas) {
      console.error('Canvas element not found');
      return;
    }

    // Initialize core components
    this.scene = new Scene(canvas);
    this.controls = new Controls(
      this.scene.getCamera(),
      this.scene.getRenderer().domElement
    );
    this.grid = new Grid(this.scene.getScene());
    this.raycaster = new Raycaster(this.scene.getCamera(), canvas);
    this.shapeManager = new ShapeManager(this.scene.getScene());
    // Import SnapManager, ObjectControls, and HistoryManager
    const { SnapManager } = await import('./core/SnapManager.js');
    const { ObjectControls } = await import('./core/ObjectControls.js');
    const { HistoryManager } = await import('./core/HistoryManager.js');
    this.snapManager = new SnapManager(this.shapeManager);
    this.transform = new Transform(
      this.scene.getCamera(),
      this.scene.getRenderer().domElement,
      this.controls.controls, // Pass the actual OrbitControls instance
      this.snapManager
    );
    this.objectControls = new ObjectControls(this.scene.getCamera(), this.transform);
    this.historyManager = new HistoryManager();
    this.cursorManager = new CursorManager(this.scene, this.scene.getCamera());

    // Set up transform controls callbacks
    this.transform.setChangeCallback((object) => {
      this.handleObjectTransform(object);
    });

    this.transform.setDragStartCallback((object) => {
      this.handleDragStart(object);
    });

    this.transform.setDragEndCallback((object) => {
      this.handleDragEnd(object);
    });

    // Add transform controls gizmo/helper to scene
    const gizmo = this.transform.getControls().getHelper();
    this.scene.getScene().add(gizmo);

    // Initialize renderer and start animation loop
    this.renderer = new Renderer(this.scene, this.controls);

    // Set up update callback for any per-frame updates
    this.renderer.setUpdateCallback(() => {
      this.update();
    });

    // Start rendering
    this.renderer.start();

    // Set up event listeners
    this.setupEventListeners();

    // Initialize socket connection if authenticated
    if (auth.isAuthenticated) {
      this.initSocket();
      // Create or join canvas since user is already authenticated
      this.createOrJoinDefaultCanvas();
    }

    // Initialize undo/redo button states (both disabled initially)
    this.updateUndoRedoButtonStates();

    console.log('CollabCanvas initialized successfully');

    // Hide loading screen
    this.hideLoading();
    } catch (error) {
      console.error('❌ Failed to initialize CollabCanvas:', error);

      // Show error message to user
      const loadingScreen = document.getElementById('loading');
      if (loadingScreen) {
        loadingScreen.innerHTML = `
          <div style="color: #ff6b6b; text-align: center;">
            <h2>Failed to load CollabCanvas</h2>
            <p>${error.message}</p>
            <button onclick="location.reload()">Retry</button>
          </div>
        `;
      }
    }
  }

  async initAuth() {
    // Initialize auth modal
    this.authModal = new AuthModal();

    // Listen for auth state changes
    auth.onAuthStateChange((user) => {
      if (user) {
        console.log('User authenticated:', user.email);
        this.onUserAuthenticated();
      } else {
        console.log('User signed out');
        this.onUserSignedOut();
      }
    });

    // Show auth modal if not authenticated
    if (!auth.isAuthenticated) {
      // If we're waiting for email confirmation, show the confirmation message
      if (this.authModal.awaitingConfirmation) {
        this.authModal.showEmailConfirmationMessage()
      } else {
        this.authModal.open();
      }
    }
  }

  initSocket() {
    // Connect to socket server
    socketManager.connect();

    // Set up socket event handlers
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
    });

    // Create or join default canvas
    this.createOrJoinDefaultCanvas();
  }

  async createOrJoinDefaultCanvas() {
    try {
      console.log('🎯 createOrJoinDefaultCanvas called, currentCanvasId:', this.currentCanvasId);

      // Check if there's a canvas ID in the URL
      const urlParams = new URLSearchParams(window.location.search);
      const canvasIdFromUrl = urlParams.get('canvas');

      console.log('🎯 URL params:', { canvasIdFromUrl });
      console.log('🎯 URL path:', window.location.pathname);

      if (canvasIdFromUrl) {
        // Join the canvas from URL (assume it's already a valid UUID)
        this.currentCanvasId = canvasIdFromUrl;
        console.log(`🔄 Joining canvas from URL: ${canvasIdFromUrl}`);
      } else if (window.location.pathname === '/default') {
        // Use the default canvas UUID for /default route
        // This is a persistent canvas that users can share and return to
        this.currentCanvasId = '550e8400-e29b-41d4-a716-446655440000';
        console.log(`🔄 Using default canvas: ${this.currentCanvasId}`);
      } else if (!this.currentCanvasId) {
        // For base URL or any other path, always create a new canvas
        console.log('🎯 Creating new canvas for base URL');
        try {
          this.currentCanvasId = await this.createNewCanvas();
          console.log(`🎯 Created new canvas ID: ${this.currentCanvasId}`);
        } catch (error) {
          console.error('🎯 Failed to create new canvas, using fallback:', error);
          this.currentCanvasId = '550e8400-e29b-41d4-a716-446655440000';
        }
      } else {
        console.log('🎯 Using existing canvas ID:', this.currentCanvasId);
      }

        console.log('🎯 Final canvas ID before join:', this.currentCanvasId);

        // Reset initial state flag when joining a new canvas
        this.initialStateCaptured = false;

        // Update URL to reflect the current canvas (for sharing and refreshing)
      this.updateCanvasUrl();

      socketManager.joinCanvas(this.currentCanvasId);
      this.updateCanvasInfo();

      // Add current user to online users set immediately (they'll be in canvas state too)
      if (auth.userId) {
        this.onlineUsers.add(auth.userId);
        this.updatePresenceDisplay();
      }
    } catch (error) {
      console.error('Error creating/joining canvas:', error);
    }
  }

  async createNewCanvas() {
    try {
      console.log('🔄 createNewCanvas called, auth.userId:', auth.userId);
      console.log('🔄 Supabase available:', !!supabase);

      // First check if Supabase is properly configured
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }

      // Generate a unique name for the canvas
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const canvasName = `Canvas ${timestamp}-${randomSuffix}`;

      // Create a new canvas
      console.log('🔄 Creating new canvas:', canvasName);
      const { data: newCanvas, error } = await supabase
        .from('canvases')
        .insert({
          name: canvasName,
          created_by: auth.userId
        })
        .select('id, name')
        .single();

      console.log('🔄 Canvas creation result:', { newCanvas, error });

      if (error) throw error;

      console.log('🔄 Created new canvas:', newCanvas);
      return newCanvas.id;
    } catch (error) {
      console.error('Error creating new canvas:', error);
      // Fallback to a hardcoded UUID if database operations fail
      console.log('🔄 Using fallback UUID due to error:', error.message);
      return '550e8400-e29b-41d4-a716-446655440000';
    }
  }

  onUserAuthenticated() {
    const isNowAuthenticated = auth.isAuthenticated;

    // Only run authentication logic if user just became authenticated
    if (isNowAuthenticated && !this.wasAuthenticated) {
      console.log('User just became authenticated, initializing connection...');

      // Close auth modal
      if (this.authModal) {
        this.authModal.close();
      }

      // Initialize socket connection if not connected
      if (!socketManager.isConnected) {
        this.initSocket();
      }

      // Create or join the default canvas now that user is authenticated
      this.createOrJoinDefaultCanvas();
    }

    // Update UI to show authenticated state
    this.updateAuthUI();

    // Update the flag for next time
    this.wasAuthenticated = isNowAuthenticated;
  }

  onUserSignedOut() {
    // Disconnect socket
    socketManager.disconnect();

    // Clear remote state
    this.remoteObjects.clear();
    this.remoteCursors.clear();

    // Clear all visual cursors
    if (this.cursorManager) {
      this.cursorManager.clearAllCursors();
    }

    // Reset confirmation state
    if (this.authModal) {
      this.authModal.awaitingConfirmation = false;
      this.authModal.pendingEmail = null;
    }

    // Reset authentication flag
    this.wasAuthenticated = false;

    // Remove current user from online users
    if (auth.userId) {
      this.onlineUsers.delete(auth.userId);
      this.updatePresenceDisplay();
    }

    // Show auth modal
    if (this.authModal) {
      this.authModal.open();
    }

    // Update UI
    this.updateAuthUI();
  }

  updateAuthUI() {
    const authButton = document.getElementById('auth-button');
    const usernameSpan = document.getElementById('username');

    if (auth.isAuthenticated) {
      if (authButton) authButton.textContent = 'Sign Out';
      if (usernameSpan) usernameSpan.textContent = `Signed in as: ${auth.userEmail}`;
    } else {
      if (authButton) authButton.textContent = 'Sign In';
      if (usernameSpan) usernameSpan.textContent = 'Guest';
    }
  }

  updateCanvasInfo() {
    const canvasIdElement = document.getElementById('canvas-id');
    if (canvasIdElement && this.currentCanvasId) {
      // Show a shortened version of the UUID for readability
      const shortId = this.currentCanvasId.substring(0, 8) + '...';
      canvasIdElement.textContent = `Canvas: ${shortId}`;
    }
  }

  updateCanvasUrl() {
    if (!this.currentCanvasId) return;

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('canvas', this.currentCanvasId);

    // Update the current URL in the browser (for sharing and refreshing)
    window.history.replaceState({}, '', currentUrl.toString());

    console.log('🔗 Updated URL to:', currentUrl.toString());
  }

  shareCanvas() {
    if (!this.currentCanvasId) return;

    // Update URL to include canvas ID
    this.updateCanvasUrl();

    // Get the updated URL
    const currentUrl = new URL(window.location.href);

    // Copy to clipboard
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentUrl.toString()).then(() => {
        this.showShareNotification('Canvas link copied to clipboard!');
      }).catch(() => {
        // Fallback for browsers that don't support clipboard API
        this.showShareNotification('Share this link: ' + currentUrl.toString());
      });
    } else {
      // Fallback for older browsers
      this.showShareNotification('Share this link: ' + currentUrl.toString());
    }
  }

  showShareNotification(message) {
    // Create a temporary notification
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4caf50;
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      opacity: 0;
      transform: translateY(-20px);
      transition: all 0.3s ease;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateY(0)';
    }, 10);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(-20px)';
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  }

  updatePresenceDisplay() {
    const onlineCountElement = document.getElementById('online-count');
    const presenceIndicator = document.querySelector('.presence-indicator');

    if (onlineCountElement) {
      const userCount = this.onlineUsers.size;
      const countText = userCount === 1 ? '1 user online' : `${userCount} users online`;
      onlineCountElement.textContent = countText;
    }

    if (presenceIndicator) {
      // Update presence indicator color based on connection status
      presenceIndicator.style.backgroundColor = socketManager.isConnected ? '#4caf50' : '#f44336';
    }
  }

  showNotification(message, type = 'info') {
    // Simple throttling: prevent duplicate notifications within 2 seconds
    const now = Date.now();
    const duplicateKey = `${message}-${type}`;

    // Check if we recently showed this exact notification
    if (this.lastNotification && this.lastNotification.key === duplicateKey) {
      const timeDiff = now - this.lastNotification.timestamp;
      if (timeDiff < 2000) { // 2 second throttle
        console.log('🔵 Throttling duplicate notification:', message);
        return;
      }
    }

    // Store this notification for throttling check
    this.lastNotification = {
      key: duplicateKey,
      timestamp: now
    };

    const notification = {
      id: Date.now() + Math.random(),
      message,
      type,
      timestamp: now
    };

    this.notifications.unshift(notification); // Add to beginning for stacking
    this.updateNotificationsDisplay();

    // Auto-remove after 5 seconds
    setTimeout(() => {
      this.removeNotification(notification.id);
    }, 5000);
  }

  removeNotification(id) {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.updateNotificationsDisplay();
  }

  updateNotificationsDisplay() {
    const notificationsContainer = document.getElementById('notifications-container');
    if (!notificationsContainer) return;

    // Clear existing notifications
    notificationsContainer.innerHTML = '';

    // Add notifications in reverse order (newest first)
    this.notifications.slice().reverse().forEach((notification, index) => {
      const notificationElement = document.createElement('div');
      notificationElement.className = `notification notification-${notification.type}`;

      // Transparent styling like a game UI - allow text to extend beyond parent
      notificationElement.style.cssText = `
        position: absolute;
        top: ${index * 20}px;
        left: 0;
        right: 0;
        background: transparent;
        color: #aaaaaa;
        padding: 4px 8px;
        font-size: 11px;
        opacity: 1;
        transform: translateY(0);
        transition: all 0.3s ease;
        z-index: 1000;
        pointer-events: none;
        font-family: monospace;
        white-space: nowrap;
        min-width: max-content;
      `;

      notificationElement.textContent = notification.message;
      notificationsContainer.appendChild(notificationElement);
    });

    // Update container height
    const height = this.notifications.length * 20;
    notificationsContainer.style.height = `${height}px`;
  }

  update() {
    // Per-frame updates go here
    // This is called every frame by the renderer

    // Update camera coordinates display
    const camera = this.scene.getCamera();
    const coordsElement = document.getElementById('coordinates');
    if (coordsElement) {
      coordsElement.textContent = `X: ${camera.position.x.toFixed(1)}, Y: ${camera.position.y.toFixed(1)}, Z: ${camera.position.z.toFixed(1)}`;
    }

    // Update cursor manager
    if (this.cursorManager) {
      this.cursorManager.update()
    }

    // Update object controls position if visible
    if (this.objectControls && this.transform && this.transform.isAttached()) {
      this.objectControls.update(this.transform.attachedObject);
    }

    // Update cursor position for remote users (throttled)
    if (socketManager.isConnected && this.currentCanvasId) {
      const now = Date.now()
      if (!this.lastCursorUpdate || now - this.lastCursorUpdate > 50) { // Throttle to 20fps
        this.updateCursorPosition();
        this.lastCursorUpdate = now
      }
    }
  }

  updateCursorPosition() {
    if (!socketManager.isConnected || !this.cursorManager) return

    // Get 3D position from mouse coordinates
    const worldPosition = this.cursorManager.get3DPositionFromMouse()
    // console.log('🖱️ Updating cursor position:', worldPosition.x, worldPosition.y, worldPosition.z)

    // Update local cursor position for current user
    if (auth.userId && this.cursorManager.getCursor(auth.userId)) {
      this.cursorManager.updateCursorPosition(auth.userId, {
        x: worldPosition.x,
        y: worldPosition.y,
        z: worldPosition.z
      }, Date.now())
    }

    // Send cursor update with actual 3D coordinates
    socketManager.updateCursor({
      x: worldPosition.x,
      y: worldPosition.y,
      z: worldPosition.z
    })
  }

  // Socket event handlers
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
      if (!this.initialStateCaptured) {
        this.initialStateCaptured = true;
        this.updateUndoRedoButtonStates();
      }
    }

    // Handle existing user sessions (don't treat as new joins)
    if (data.sessions) {
      console.log('🔄 Processing existing sessions:', data.sessions.length);
      const currentUserId = auth.userId;

      data.sessions.forEach(session => {
        console.log('🔄 Adding user to online set:', session.user_id, '(current:', currentUserId + ')');
        this.onlineUsers.add(session.user_id); // Add all users to online users set (including ourselves)

        // Create cursor for all users (including current user for consistency)
        // Note: handleExistingSession will skip current user if cursor already exists
        this.handleExistingSession(session);
      });

      // Update presence display after loading existing sessions
      this.updatePresenceDisplay();
      console.log('🔄 Updated presence display, total users:', this.onlineUsers.size);

      // Force initial cursor position update for current user after a short delay
      // This ensures the cursor is positioned correctly even if mouse hasn't moved yet
      setTimeout(() => {
        if (auth.userId && this.cursorManager && this.cursorManager.getCursor(auth.userId)) {
          console.log('🎯 Forcing initial cursor position update for current user');
          this.updateCursorPosition();
        }
      }, 100);
    }
  }

  handleExistingSession(session) {
    console.log('🎯 Creating cursor for existing session:', session.user_id, 'at position:', session.cursor_x, session.cursor_y);

    // Create cursor for existing user session (skip if already exists)
    if (this.cursorManager) {
      // Check if cursor already exists to prevent duplicates
      if (this.cursorManager.getCursor(session.user_id)) {
        console.log('🎯 Cursor already exists for', session.user_id, '- updating position if needed');
      } else {
        const colorIndex = this.cursorManager.getUserColorIndex(session.user_id);

        // Use email from session if available, otherwise fall back to user ID
        let userName;
        if (session.user_email) {
          userName = session.user_id === auth.userId ? 'You' : session.user_email.split('@')[0];
        } else {
          userName = session.user_id === auth.userId ? 'You' : `User ${session.user_id.substring(0, 8)}`;
        }

        this.cursorManager.addUserCursor(session.user_id, userName, colorIndex);
        console.log('🎯 Created new cursor for', session.user_id);
      }

      // Update cursor position if available and not at default (0,0,0) for current user
      if (session.cursor_x !== undefined && session.cursor_y !== undefined) {
        // For current user, don't position at (0,0,0) - let normal cursor updates handle it
        if (session.user_id === auth.userId && session.cursor_x === 0 && session.cursor_y === 0 && (session.cursor_z === 0 || session.cursor_z === undefined)) {
          console.log('🎯 Current user cursor at default position - will be updated by mouse movement');
        } else {
          console.log('🎯 Positioning cursor for', session.user_id, 'at', session.cursor_x, session.cursor_y);
          this.cursorManager.updateCursorPosition(session.user_id, {
            x: session.cursor_x,
            y: session.cursor_y,
            z: session.cursor_z || 0
          }, Date.now());
        }
      } else {
        // If cursor exists but no position data, position at appropriate default
        if (this.cursorManager.getCursor(session.user_id)) {
          console.log('🎯 No position data for existing cursor', session.user_id, '- using default position');
          if (session.user_id === auth.userId) {
            console.log('🎯 Current user cursor will be positioned by normal update logic');
          } else {
            console.log('🎯 Positioning other user cursor at scene center');
            this.cursorManager.updateCursorPosition(session.user_id, {
              x: 0,
              y: 0,
              z: 0
            }, Date.now());
          }
        }
      }

      // If this is the current user and cursor exists, trigger initial position update
      if (session.user_id === auth.userId && this.cursorManager.getCursor(session.user_id)) {
        console.log('🎯 Triggering initial cursor position update for current user');
        setTimeout(() => {
          this.updateCursorPosition();
        }, 50);
      }
    }
  }

  handleUserJoined(data) {
    console.log('🔵 User joined event received:', data);

    // Check if data exists and has required properties
    if (!data || !data.userId) {
      console.error('🔴 Invalid user joined data:', data);
      return;
    }

    // Skip if this is the current user (they should already have a cursor from canvas state)
    if (data.userId === auth.userId) {
      console.log('🔵 Skipping user joined for current user (cursor should exist from canvas state)');
      return;
    }

    // Add user to online users set
    this.onlineUsers.add(data.userId);

    // Update presence display
    this.updatePresenceDisplay();

    // Show join notification for other users
    const displayName = data.userEmail ? data.userEmail.split('@')[0] : `User ${data.userId.substring(0, 8)}`;
    this.showNotification(`${displayName} joined`, 'join');

    // Update cursor label if cursor exists, or create cursor if it doesn't
    if (this.cursorManager && this.cursorManager.getCursor(data.userId)) {
      console.log('🔵 Updating cursor label for existing user:', data.userId);
      const userName = data.userEmail ? data.userEmail.split('@')[0] : `User ${data.userId.substring(0, 8)}`;
      // Update the existing cursor's label
      const cursor = this.cursorManager.getCursor(data.userId);
      if (cursor) {
        cursor.userName = userName;
        // Update the label mesh text
        this.cursorManager.updateCursorLabel(cursor);
      }
    } else {
      // Create cursor if it doesn't exist (shouldn't happen for existing canvas users)
      console.log('🔵 Creating cursor for joined user (unexpected):', data.userId);
      const colorIndex = this.cursorManager.getUserColorIndex(data.userId)
      const userName = data.userEmail ? data.userEmail.split('@')[0] : `User ${data.userId.substring(0, 8)}`

      this.cursorManager.addUserCursor(data.userId, userName, colorIndex)
    }
  }

  handleUserLeft(data) {
    console.log('🔴 User left event received:', data);

    // Check if data exists and has required properties
    if (!data || !data.userId) {
      console.error('🔴 Invalid user left data:', data);
      return;
    }

    // Skip if this is the current user (they shouldn't remove their own cursor)
    if (data.userId === auth.userId) {
      console.log('🔵 Skipping user left for current user (should not remove own cursor)');
      return;
    }

    // Remove user from online users set
    this.onlineUsers.delete(data.userId);

    // Update presence display
    this.updatePresenceDisplay();

    // Show leave notification
    const displayName = data.userEmail || `User ${data.userId.substring(0, 8)}`;
    this.showNotification(`${displayName} left`, 'leave');

    // Remove user's visual cursor
    if (this.cursorManager) {
      console.log('🔴 Removing cursor for left user:', data.userId);
      this.cursorManager.removeUserCursor(data.userId)
    }
  }

  handleCursorUpdate(data) {
    // Check if data exists and has required properties
    if (!data || !data.userId) {
      console.error('🔴 Invalid cursor update data:', data);
      return;
    }

    // Update remote cursor position visually
    if (this.cursorManager) {
      this.cursorManager.updateCursorPosition(data.userId, data, Date.now())
    }
  }

  handleObjectCreated(data) {
    console.log('🔵 Remote object created:', data);

    // Check if data exists and has required properties
    if (!data || !data.id) {
      console.error('🔴 Invalid object created data:', data);
      return;
    }

    // Check if object already exists (prevent duplicates from local creation echo)
    if (this.shapeManager && this.shapeManager.getShape(data.id)) {
      console.log('🔵 Object already exists, skipping creation:', data.id);
      // Just update tracking
      this.remoteObjects.set(data.id, data);
      return;
    }

    // Create visual object in 3D scene
    if (this.shapeManager) {
      const shape = this.shapeManager.createShapeFromData(data);
      if (shape) {
        // Add to scene and select if needed
        this.shapeManager.addShapeToScene(shape);
        console.log('🔵 Created visual object:', shape.id);
      }
    }

    // Track for synchronization
    this.remoteObjects.set(data.id, data);
  }

  handleObjectUpdated(data) {
    console.log('🔵 Remote object updated:', data);

    // Update visual object in 3D scene
    if (this.shapeManager) {
      const existingShape = this.shapeManager.getShape(data.id);
      if (existingShape) {
        // Update the shape's properties
        this.shapeManager.updateShapeFromData(existingShape, data);
        console.log('🔵 Updated visual object:', data.id);
      }
    }

    // Update tracking
    if (this.remoteObjects.has(data.id)) {
      this.remoteObjects.set(data.id, { ...this.remoteObjects.get(data.id), ...data });
    }
  }

  handleObjectDeleted(data) {
    console.log('🔴 Remote object deleted:', data.id);

    // Remove visual object from 3D scene
    if (this.shapeManager) {
      this.shapeManager.removeShape(data.id);
      console.log('🔴 Removed visual object:', data.id);
    }

    // Remove from tracking
    this.remoteObjects.delete(data.id);
  }

  handleObjectTransform(object) {
    // Throttle object updates for smooth dragging (60fps)
    const now = Date.now();
    if (now - this.lastObjectUpdate < 16) { // Throttle to 60fps for smooth dragging
      return;
    }
    this.lastObjectUpdate = now;

    // Find the shape that corresponds to this object
    if (this.shapeManager) {
      const shape = this.shapeManager.findShapeByMesh(object);
      if (shape) {
        // Broadcast the object update to other users (during dragging)
        if (socketManager.isConnected && this.currentCanvasId) {
          const objectData = {
            id: shape.id,
            position_x: object.position.x,
            position_y: object.position.y,
            position_z: object.position.z,
            rotation_x: object.rotation.x,
            rotation_y: object.rotation.y,
            rotation_z: object.rotation.z,
            // Include scale for resize mode (visual feedback during drag)
            scale_x: object.scale.x,
            scale_y: object.scale.y,
            scale_z: object.scale.z
          };

          socketManager.updateObject(shape.id, objectData);
          console.log('📤 Broadcasted object update:', shape.id);
        }
      }
    }
  }

  handleDragStart(object) {
    // Begin capturing state for undo functionality
    if (this.historyManager) {
      const selectedShapeIds = Array.from(this.shapeManager.selectedShapes);
      this.historyManager.beginUpdate(this.shapeManager, selectedShapeIds);
    }
  }

  handleDragEnd(object) {
    // If we were in resize mode, bake the scale into geometry
    if (this.transform && this.transform.getMode() === 'resize') {
      const shape = this.shapeManager.findShapeByMesh(object);
      if (shape) {
        // Capture the scale delta BEFORE baking (for undo/redo)
        const scaleDelta = {
          x: object.scale.x,
          y: object.scale.y,
          z: object.scale.z
        };

        // Pass scale delta to history manager before baking
        if (this.historyManager) {
          this.historyManager.captureScaleDelta(shape.id, scaleDelta);
        }

        // Bake the scale transform into the geometry
        this.shapeManager.bakeShapeScale(shape.id);

        // Broadcast the updated geometry to other users (after baking)
        if (socketManager.isConnected && this.currentCanvasId) {
          const objectData = {
            id: shape.id,
            position_x: object.position.x,
            position_y: object.position.y,
            position_z: object.position.z,
            rotation_x: object.rotation.x,
            rotation_y: object.rotation.y,
            rotation_z: object.rotation.z,
            scale_x: 1,
            scale_y: 1,
            scale_z: 1,
            color: shape.properties.color || '#ffffff',
            geometry: shape.serializeGeometry() // Geometry is single source of truth
          };

          socketManager.updateObject(shape.id, objectData);
          console.log('📤 Broadcasted resize with baked geometry:', shape.id);
        }
      }
    }

    // Commit the update operation for undo functionality
    if (this.historyManager) {
      const selectedShapeIds = Array.from(this.shapeManager.selectedShapes);
      this.historyManager.commitUpdate(this.shapeManager, selectedShapeIds);
      this.updateUndoRedoButtonStates();
    }
  }

  setupEventListeners() {
    // Toolbar buttons
    const toolButtons = document.querySelectorAll('.tool-button');
    toolButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        this.handleToolClick(e.target.dataset.tool);
      });
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });

    // Mouse events for object selection
    const canvas = this.scene.getRenderer().domElement;

    // Track mouse down to distinguish clicks from drags
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDownPosition = { x: e.clientX, y: e.clientY };
      this.mouseDownTime = Date.now();
    });

    canvas.addEventListener('click', (e) => {
      this.handleCanvasClick(e);
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
    }

    // Undo button
    const undoButton = document.getElementById('undo-button');
    if (undoButton) {
      undoButton.addEventListener('click', () => {
        this.undo();
      });
    }

    // Redo button
    const redoButton = document.getElementById('redo-button');
    if (redoButton) {
      redoButton.addEventListener('click', () => {
        this.redo();
      });
    }

    // Authentication button
    const authButton = document.getElementById('auth-button');
    if (authButton) {
      authButton.addEventListener('click', () => {
        if (auth.isAuthenticated) {
          auth.signOut();
        } else {
          this.authModal.open();
        }
      });
    }

    // Share canvas button
    const shareButton = document.getElementById('share-canvas');
    if (shareButton) {
      shareButton.addEventListener('click', () => {
        this.shareCanvas();
      });
    }

    // Object control actions
    document.addEventListener('objectControlAction', (e) => {
      const { action } = e.detail;
      this.handleObjectControlAction(action);
    });

    // Update canvas info display
    this.updateCanvasInfo();

    // Initialize presence display
    this.updatePresenceDisplay();
  }

  toggleGrid() {
    if (this.grid) {
      this.grid.toggleGrid();
      const gridToggle = document.getElementById('grid-toggle');
      if (gridToggle) {
        gridToggle.classList.toggle('active');
      }
    }
  }

  toggleSnap() {
    if (this.snapManager) {
      const newState = !this.snapManager.isEnabled();
      this.snapManager.setEnabled(newState);
      const snapToggle = document.getElementById('snap-toggle');
      if (snapToggle) {
        snapToggle.classList.toggle('active', newState);
      }
    }
  }

  undo() {
    if (this.historyManager && this.historyManager.undo(this.shapeManager, socketManager)) {
      // Detach transform controls during restoration
      this.transform.detach();

      // Hide object controls during restoration
      if (this.objectControls) {
        this.objectControls.hide();
      }

      // Update UI after undo
      this.updateUndoRedoButtonStates();

      // Reattach transform controls to selected object if any
      const selectedShapes = Array.from(this.shapeManager.selectedShapes);
      if (selectedShapes.length > 0) {
        const shapeId = selectedShapes[selectedShapes.length - 1]; // Get last selected
        const shape = this.shapeManager.shapes.get(shapeId);
        if (shape) {
          // Ensure the shape's mesh is properly in the scene
          if (!shape.mesh.parent) {
            this.shapeManager.scene.add(shape.mesh);
          }

          // Attach transform controls
          this.transform.attach(shape.mesh);

          // Show object controls
          if (this.objectControls) {
            this.objectControls.show(shape.mesh);
            this.objectControls.updateButtonStates(this.transform.getMode());
          }
        }
      }
    }
  }

  redo() {
    if (this.historyManager && this.historyManager.redo(this.shapeManager, socketManager)) {
      // Detach transform controls during restoration
      this.transform.detach();

      // Hide object controls during restoration
      if (this.objectControls) {
        this.objectControls.hide();
      }

      // Update UI after redo
      this.updateUndoRedoButtonStates();

      // Reattach transform controls to selected object if any
      const selectedShapes = Array.from(this.shapeManager.selectedShapes);
      if (selectedShapes.length > 0) {
        const shapeId = selectedShapes[selectedShapes.length - 1]; // Get last selected
        const shape = this.shapeManager.shapes.get(shapeId);
        if (shape) {
          // Ensure the shape's mesh is properly in the scene
          if (!shape.mesh.parent) {
            this.shapeManager.scene.add(shape.mesh);
          }

          // Attach transform controls
          this.transform.attach(shape.mesh);

          // Show object controls
          if (this.objectControls) {
            this.objectControls.show(shape.mesh);
            this.objectControls.updateButtonStates(this.transform.getMode());
          }
        }
      }
    }
  }

  updateUndoRedoButtonStates() {
    const undoButton = document.getElementById('undo-button');
    const redoButton = document.getElementById('redo-button');

    if (undoButton && this.historyManager) {
      const canUndo = this.historyManager.canUndo();
      undoButton.disabled = !canUndo;
    }

    if (redoButton && this.historyManager) {
      const canRedo = this.historyManager.canRedo();
      redoButton.disabled = !canRedo;
    }
  }

  handleObjectControlAction(action) {
    switch (action) {
      case 'duplicate':
        // Duplicate selected shapes (same as Ctrl+D)
        if (this.shapeManager) {
          const duplicatedShapes = this.shapeManager.duplicateSelected();
          if (duplicatedShapes.length > 0) {
            // Track duplicated shapes in history
            if (this.historyManager) {
              const selectedShapeIds = Array.from(this.shapeManager.selectedShapes);
              duplicatedShapes.forEach(shape => {
                this.historyManager.pushCreate(shape, selectedShapeIds);
              });
              this.updateUndoRedoButtonStates();
            }

            // Attach transform controls to the last duplicated shape
            const lastShape = duplicatedShapes[duplicatedShapes.length - 1];
            this.transform.attach(lastShape.mesh);

            // Show object controls above the selected object
            if (this.objectControls) {
              this.objectControls.show(lastShape.mesh);
              this.objectControls.updateButtonStates(this.transform.getMode());
            }
          }
        }
        break;
    }
  }

  handleCanvasClick(event) {
    // Only handle clicks in select mode
    if (this.currentTool !== 'select') return;

    // Don't handle clicks if we're dragging transform controls
    if (this.transform && this.transform.isDraggingNow()) return;

    // Check if this was a drag or a click
    // If mouse moved more than 5 pixels or took longer than 300ms, consider it a drag
    const threshold = 5;
    const timeThreshold = 300;
    if (this.mouseDownPosition) {
      const dx = Math.abs(event.clientX - this.mouseDownPosition.x);
      const dy = Math.abs(event.clientY - this.mouseDownPosition.y);
      const dt = Date.now() - this.mouseDownTime;

      if (dx > threshold || dy > threshold || dt > timeThreshold) {
        // This was a drag, not a click - don't change selection
        return;
      }
    }

    // Update mouse position for raycasting
    this.raycaster.updateMousePosition(event);

    // Get all shape meshes
    const shapeMeshes = this.shapeManager.getAllShapes().map(shape => shape.mesh);

    // Check for intersections
    const intersection = this.raycaster.getFirstIntersection(shapeMeshes, false);

    if (intersection) {
      // Find the shape that was clicked
      const shape = this.shapeManager.findShapeByMesh(intersection.object);

      if (shape) {
        // Shift+click for multi-select
        const addToSelection = event.shiftKey;
        this.shapeManager.selectShape(shape.id, addToSelection);

        // Attach transform controls to the selected shape (last selected)
        this.transform.attach(shape.mesh);

        // Show object controls above the selected object
        if (this.objectControls) {
          this.objectControls.show(shape.mesh);
          this.objectControls.updateButtonStates(this.transform.getMode());
        }
      }
    } else {
      // Clicked on empty space - clear selection
      if (!event.shiftKey) {
        this.shapeManager.clearSelection();
        this.transform.detach();

        // Hide object controls
        if (this.objectControls) {
          this.objectControls.hide();
        }
      }
    }
  }

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

    this.currentTool = tool;

    // If a shape tool is selected, create the shape at origin
    if (tool !== 'select') {
      const shape = this.shapeManager.createShape(tool, { x: 0, y: 1, z: 0 });
      if (shape) {
        // Auto-select the new shape
        this.shapeManager.clearSelection();
        this.shapeManager.selectShape(shape.id);
        this.transform.attach(shape.mesh);

        // Show object controls above the selected object
        if (this.objectControls) {
          this.objectControls.show(shape.mesh);
          this.objectControls.updateButtonStates(this.transform.getMode());
        }

        // Capture state for undo functionality
        if (this.historyManager) {
          const selectedShapeIds = Array.from(this.shapeManager.selectedShapes);
          this.historyManager.pushCreate(shape, selectedShapeIds);
          this.updateUndoRedoButtonStates();
        }

        // Broadcast object creation to other users
        if (socketManager.isConnected && this.currentCanvasId) {
          const objectData = {
            id: shape.id,
            type: tool,
            position_x: shape.mesh.position.x,
            position_y: shape.mesh.position.y,
            position_z: shape.mesh.position.z,
            rotation_x: shape.mesh.rotation.x,
            rotation_y: shape.mesh.rotation.y,
            rotation_z: shape.mesh.rotation.z,
            color: shape.properties.color || '#ffffff',
            geometry: shape.serializeGeometry(), // Geometry is single source of truth
            canvas_id: this.currentCanvasId,
            created_by: auth.userId
          };

          socketManager.createObject(objectData);
          console.log('📤 Broadcasted object creation with geometry:', objectData.id);
        }
      }
      // Switch back to select tool after creating
      setTimeout(() => this.handleToolClick('select'), 100);
    }
  }

  handleKeyDown(e) {
    // Skip keyboard shortcuts if modal is open or user is typing in an input field
    if (this.modalIsOpen || this.isTypingInInput(e.target)) {
      return;
    }

    // Keyboard shortcuts (to be expanded)
    switch (e.key.toLowerCase()) {
      case 'v':
        this.handleToolClick('select');
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
      case 'q':
        // Set translate mode
        if (this.objectControls) {
          this.objectControls.setMode('translate');
        }
        break;
      case 'w':
        // Set rotate mode
        if (this.objectControls) {
          this.objectControls.setMode('rotate');
        }
        break;
      case 'e':
        // Set resize mode
        if (this.objectControls) {
          this.objectControls.setMode('resize');
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
          this.redo();
        } else if (e.ctrlKey || e.metaKey) {
          // Ctrl+Z / Cmd+Z for undo
          e.preventDefault();
          this.undo();
        }
        break;
      case 'escape':
        // Deselect all
        if (this.shapeManager) {
          this.shapeManager.clearSelection();
        }
        if (this.transform) {
          this.transform.detach();
        }
        if (this.objectControls) {
          this.objectControls.hide();
        }
        break;
      case 'delete':
      case 'backspace':
        // Delete selected shapes
        if (this.shapeManager) {
          // Capture state before deletion for undo functionality
          if (this.historyManager) {
            const deletedIds = Array.from(this.shapeManager.selectedShapes);
            const selectedShapeIds = Array.from(this.shapeManager.selectedShapes);
            this.historyManager.pushDelete(deletedIds, this.shapeManager, selectedShapeIds);
            this.updateUndoRedoButtonStates();
          }

          this.transform.detach();
          if (this.objectControls) {
            this.objectControls.hide();
          }
          const deletedIds = this.shapeManager.deleteSelected();

          // Broadcast deletion to other users
          if (socketManager.isConnected && this.currentCanvasId && deletedIds.length > 0) {
            deletedIds.forEach(id => {
              socketManager.deleteObject(id);
              console.log('📤 Broadcasted object deletion:', id);
            });
          }
        }
        e.preventDefault();
        break;
      case 'd':
        // Duplicate selected shapes (Ctrl/Cmd + D)
        if ((e.ctrlKey || e.metaKey) && this.shapeManager) {
          const duplicatedShapes = this.shapeManager.duplicateSelected();
          if (duplicatedShapes.length > 0) {
            // Track duplicated shapes in history
            if (this.historyManager) {
              const selectedShapeIds = Array.from(this.shapeManager.selectedShapes);
              duplicatedShapes.forEach(shape => {
                this.historyManager.pushCreate(shape, selectedShapeIds);
              });
              this.updateUndoRedoButtonStates();
            }

            // Attach transform controls to the last duplicated shape
            const lastShape = duplicatedShapes[duplicatedShapes.length - 1];
            this.transform.attach(lastShape.mesh);

            // Show object controls above the selected object
            if (this.objectControls) {
              this.objectControls.show(lastShape.mesh);
              this.objectControls.updateButtonStates(this.transform.getMode());
            }
          }
          e.preventDefault();
        }
        break;
      case ' ':
        // Space to cycle through transform modes
        if (this.transform && this.transform.isAttached()) {
          const newMode = this.transform.cycleMode();
          console.log(`Transform mode: ${newMode}`);

          // Update ObjectControls button states to match
          if (this.objectControls) {
            this.objectControls.updateButtonStates(newMode);
          }

          e.preventDefault();
        }
        break;
    }
  }

  isTypingInInput(activeElement) {
    // Check if the user is typing in an input field
    if (!activeElement) return false;

    const tagName = activeElement.tagName.toLowerCase();
    const inputTypes = ['input', 'textarea', 'select'];

    if (inputTypes.includes(tagName)) {
      // For input fields, also check if it's a text input (not checkbox, radio, etc.)
      if (tagName === 'input') {
        const inputType = activeElement.type.toLowerCase();
        const textInputTypes = ['text', 'email', 'password', 'search', 'tel', 'url'];
        return textInputTypes.includes(inputType) || !inputType; // Default input type is text
      }
      return true;
    }

    return false;
  }

  hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
      setTimeout(() => {
        loading.classList.add('hidden');
      }, 300);
    }
  }

  dispose() {
    if (this.renderer) {
      this.renderer.stop();
    }
    if (this.grid) {
      this.grid.dispose();
    }
    if (this.controls) {
      this.controls.dispose();
    }
    if (this.scene) {
      this.scene.dispose();
    }
    if (this.authModal) {
      this.authModal.dispose();
    }
    if (socketManager) {
      socketManager.disconnect();
    }
  }
}
