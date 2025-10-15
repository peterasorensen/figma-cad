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

    this.init();
  }

  async init() {
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
    this.transform = new Transform(
      this.scene.getCamera(),
      this.scene.getRenderer().domElement,
      this.controls.controls // Pass the actual OrbitControls instance
    );
    this.shapeManager = new ShapeManager(this.scene.getScene());
    this.cursorManager = new CursorManager(this.scene, this.scene.getCamera());

    // Set up transform controls callback for object updates
    this.transform.onObjectChange = (object) => {
      this.handleObjectTransform(object);
    };

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
    } else {
      // If not authenticated, wait for authentication before creating canvas
      console.log('Waiting for authentication before creating canvas...');
    }

    console.log('CollabCanvas initialized successfully');

    // Hide loading screen
    this.hideLoading();
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

      if (canvasIdFromUrl) {
        // Join the canvas from URL (assume it's already a valid UUID)
        this.currentCanvasId = canvasIdFromUrl;
        console.log(`🔄 Joining canvas from URL: ${canvasIdFromUrl}`);
      } else if (!this.currentCanvasId) {
        // Only create/find canvas if we don't already have one
        console.log('🎯 Creating/finding shared canvas (no existing canvas ID)');
        try {
          this.currentCanvasId = await this.getOrCreateSharedCanvas();
          console.log(`🎯 Got canvas ID: ${this.currentCanvasId}`);
        } catch (error) {
          console.error('🎯 Failed to get/create canvas, using fallback:', error);
          this.currentCanvasId = '550e8400-e29b-41d4-a716-446655440000';
        }
      } else {
        console.log('🎯 Using existing canvas ID:', this.currentCanvasId);
      }

      console.log('🎯 Final canvas ID before join:', this.currentCanvasId);
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

  async getOrCreateSharedCanvas() {
    try {
      console.log('🔄 getOrCreateSharedCanvas called, auth.userId:', auth.userId);
      console.log('🔄 Supabase available:', !!supabase);

      // First check if Supabase is properly configured
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }

      // Try to find an existing shared canvas
      console.log('🔄 Querying for existing canvas...');
      const { data: existingCanvases, error: findError } = await supabase
        .from('canvases')
        .select('id, name')
        .eq('name', 'Shared Default Canvas')
        .limit(1);

      console.log('🔄 Database query result:', { existingCanvases, findError });

      if (findError) {
        console.error('🔄 Database query failed:', findError);
        throw findError;
      }

      if (existingCanvases && existingCanvases.length > 0) {
        console.log('🔄 Found existing shared canvas:', existingCanvases[0]);
        return existingCanvases[0].id;
      }

      // Create a new shared canvas if none exists
      console.log('🔄 Creating new shared canvas...');
      const { data: newCanvas, error } = await supabase
        .from('canvases')
        .insert({
          name: 'Shared Default Canvas',
          created_by: auth.userId
        })
        .select('id, name')
        .single();

      console.log('🔄 Canvas creation result:', { newCanvas, error });

      if (error) throw error;

      console.log('🔄 Created new shared canvas:', newCanvas);
      return newCanvas.id;
    } catch (error) {
      console.error('Error getting/creating shared canvas:', error);
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

  shareCanvas() {
    if (!this.currentCanvasId) return;

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('canvas', this.currentCanvasId);

    // Update the current URL in the browser (optional, for consistency)
    window.history.replaceState({}, '', currentUrl.toString());

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
    const notification = {
      id: Date.now() + Math.random(),
      message,
      type,
      timestamp: Date.now()
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
    }

    // Handle existing user sessions (don't treat as new joins)
    if (data.sessions) {
      console.log('🔄 Processing existing sessions:', data.sessions.length);
      const currentUserId = auth.userId;

      data.sessions.forEach(session => {
        console.log('🔄 Adding user to online set:', session.user_id, '(current:', currentUserId + ')');
        this.onlineUsers.add(session.user_id); // Add all users to online users set (including ourselves)

        // Create cursor for all users (including current user for consistency)
        this.handleExistingSession(session);
      });

      // Update presence display after loading existing sessions
      this.updatePresenceDisplay();
      console.log('🔄 Updated presence display, total users:', this.onlineUsers.size);
    }
  }

  handleExistingSession(session) {
    console.log('🎯 Creating cursor for existing session:', session.user_id, 'at position:', session.cursor_x, session.cursor_y);

    // Create cursor for existing user session
    if (this.cursorManager) {
      const colorIndex = this.cursorManager.getUserColorIndex(session.user_id);
      // For existing sessions, we don't have email info, so use user ID
      const userName = `User ${session.user_id.substring(0, 8)}`;

      this.cursorManager.addUserCursor(session.user_id, userName, colorIndex);

      // Update cursor position if available
      if (session.cursor_x !== undefined && session.cursor_y !== undefined) {
        console.log('🎯 Positioning cursor for', session.user_id, 'at', session.cursor_x, session.cursor_y);
        this.cursorManager.updateCursorPosition(session.user_id, {
          x: session.cursor_x,
          y: session.cursor_y,
          z: session.cursor_z || 0
        }, Date.now());
      } else {
        console.log('🎯 No position data for', session.user_id, '- will use current mouse position');
        // For users without position data, position them at current mouse position
        if (this.cursorManager) {
          const worldPosition = this.cursorManager.get3DPositionFromMouse()
          console.log('🎯 Positioning cursor at current mouse position:', worldPosition.x, worldPosition.y, worldPosition.z);
          this.cursorManager.updateCursorPosition(session.user_id, {
            x: worldPosition.x,
            y: worldPosition.y,
            z: worldPosition.z
          }, Date.now());
        }
      }
    }
  }

  handleUserJoined(data) {
    console.log('🔵 User joined event received:', data.userId);

    // Add user to online users set
    this.onlineUsers.add(data.userId);

    // Update presence display
    this.updatePresenceDisplay();

    // Show join notification only for other users (not current user)
    if (data.userId !== auth.userId) {
      const displayName = data.userEmail || `User ${data.userId.substring(0, 8)}`;
      this.showNotification(`${displayName} joined`, 'join');
    }

    // Update cursor label for all users (including current user)
    if (this.cursorManager && this.cursorManager.getCursor(data.userId)) {
      console.log('🔵 Updating cursor label for user:', data.userId);
      const userName = data.userEmail || `User ${data.userId.substring(0, 8)}`;
      // Update the existing cursor's label
      const cursor = this.cursorManager.getCursor(data.userId);
      if (cursor) {
        cursor.userName = userName;
        // Update the label mesh text
        this.updateCursorLabel(cursor);
      }
    } else {
      // Create cursor if it doesn't exist
      console.log('🔵 Creating cursor for joined user:', data.userId);
      const colorIndex = this.cursorManager.getUserColorIndex(data.userId)
      const userName = data.userEmail || `User ${data.userId.substring(0, 8)}`

      this.cursorManager.addUserCursor(data.userId, userName, colorIndex)
    }
  }

  handleUserLeft(data) {
    console.log('🔴 User left event received:', data.userId);

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
    // Update remote cursor position visually
    if (this.cursorManager) {
      this.cursorManager.updateCursorPosition(data.userId, data, Date.now())
    }
  }

  handleObjectCreated(data) {
    console.log('🔵 Remote object created:', data);

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
    // Throttle object updates to reduce lag
    const now = Date.now();
    if (now - this.lastObjectUpdate < 100) { // Throttle to 10fps
      return;
    }
    this.lastObjectUpdate = now;

    // Find the shape that corresponds to this object
    if (this.shapeManager) {
      const shape = this.shapeManager.findShapeByMesh(object);
      if (shape) {
        // Broadcast the object update to other users
        if (socketManager.isConnected && this.currentCanvasId) {
          const objectData = {
            id: shape.id,
            position_x: object.position.x,
            position_y: object.position.y,
            position_z: object.position.z,
            rotation_x: object.rotation.x,
            rotation_y: object.rotation.y,
            rotation_z: object.rotation.z,
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
      }
    } else {
      // Clicked on empty space - clear selection
      if (!event.shiftKey) {
        this.shapeManager.clearSelection();
        this.transform.detach();
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
            scale_x: shape.mesh.scale.x,
            scale_y: shape.mesh.scale.y,
            scale_z: shape.mesh.scale.z,
            color: shape.color || '#ffffff',
            width: shape.width || 100,
            height: shape.height || 100,
            depth: shape.depth || 100,
            canvas_id: this.currentCanvasId,
            created_by: auth.userId
          };

          socketManager.createObject(objectData);
          console.log('📤 Broadcasted object creation:', objectData.id);
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
      case 'g':
        // Toggle grid
        this.toggleGrid();
        break;
      case 'escape':
        // Deselect all
        if (this.shapeManager) {
          this.shapeManager.clearSelection();
        }
        if (this.transform) {
          this.transform.detach();
        }
        break;
      case 'delete':
      case 'backspace':
        // Delete selected shapes
        if (this.shapeManager) {
          this.transform.detach();
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
          this.shapeManager.duplicateSelected();
          e.preventDefault();
        }
        break;
      case 'w':
        // Move/translate mode
        if (this.transform) {
          this.transform.setMode('translate');
          console.log('Transform mode: Move');
        }
        break;
      case 'e':
        // Rotate mode
        if (this.transform) {
          this.transform.setMode('rotate');
          console.log('Transform mode: Rotate');
        }
        break;
      case 't':
        // Scale mode
        if (this.transform) {
          this.transform.setMode('scale');
          console.log('Transform mode: Scale');
        }
        break;
      case ' ':
        // Space to cycle through transform modes
        if (this.transform && this.transform.isAttached()) {
          const newMode = this.transform.cycleMode();
          console.log(`Transform mode: ${newMode}`);
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
