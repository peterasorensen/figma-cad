import { Scene } from './core/render/Scene.js';
import { Controls } from './core/input/Controls.js';
import { Grid } from './core/render/Grid.js';
import { Renderer } from './core/render/Renderer.js';
import { Raycaster } from './core/interaction/Raycaster.js';
import { Transform } from './core/interaction/Transform.js';
import { ShapeManager } from './shapes/ShapeManager.js';
import { AuthModal } from './components/AuthModal.js';
import { auth, supabase } from './core/auth/Auth.js';
import { socketManager } from './core/network/SocketManager.js';
import { CursorManager } from './core/render/CursorManager.js';
import { UIManager } from './core/ui/UIManager.js';
import { SocketEventHandler } from './core/network/SocketEventHandler.js';
import { EventHandler } from './core/input/EventHandler.js';
import { HistoryHelper } from './core/history/HistoryHelper.js';

/**
 * Main application class
 * Orchestrates all components and manages application lifecycle
 */
export class App {
  constructor() {
    // Make auth available as an instance property for helper classes
    this.auth = auth;
    this.socketManager = socketManager;

    this.scene = null;
    this.controls = null;
    this.grid = null;
    this.renderer = null;
    this.raycaster = null;
    this.transform = null;
    this.shapeManager = null;
    this.authModal = null;
    this.cursorManager = null;
    this.uiManager = null;
    this.socketEventHandler = null;
    this.eventHandler = null;
    this.historyHelper = null;
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

    // Initialize helper classes early (needed for auth callbacks)
    this.uiManager = new UIManager(this);
    this.historyHelper = new HistoryHelper(this);

    // Import SnapManager, ObjectControls, and HistoryManager
    const { SnapManager } = await import('./core/interaction/SnapManager.js');
    const { ObjectControls } = await import('./core/ui/ObjectControls.js');
    const { HistoryManager } = await import('./core/history/HistoryManager.js');
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

    // Initialize remaining helper classes
    this.socketEventHandler = new SocketEventHandler(this);
    this.eventHandler = new EventHandler(this);

    // Set up transform controls callbacks
    this.transform.setChangeCallback((object) => {
      this.handleObjectTransform(object);
    });

    this.transform.setDragStartCallback((object) => {
      this.historyHelper.beginDragCapture();
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

    // Initialize undo/redo button states (both disabled initially)
    this.uiManager.updateUndoRedoButtonStates();

    // Initialize socket connection if authenticated (after helper classes are ready)
    if (auth.isAuthenticated) {
      this.initSocket();
      // Create or join canvas since user is already authenticated
      this.createOrJoinDefaultCanvas();
    }

    console.log('CollabCanvas initialized successfully');

    // Hide loading screen
    this.uiManager.hideLoading();
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
      this.uiManager.updateCanvasUrl();

      socketManager.joinCanvas(this.currentCanvasId);
      this.uiManager.updateCanvasInfo();

      // Add current user to online users set immediately (they'll be in canvas state too)
      if (auth.userId) {
        this.onlineUsers.add(auth.userId);
        this.uiManager.updatePresenceDisplay();
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
    this.uiManager.updateAuthUI();

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
      this.uiManager.updatePresenceDisplay();
    }

    // Show auth modal
    if (this.authModal) {
      this.authModal.open();
    }

    // Update UI
    this.uiManager.updateAuthUI();
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
      this.uiManager.updateUndoRedoButtonStates();
    }
  }



  undo() {
    this.historyHelper.undo();
  }

  redo() {
    this.historyHelper.redo();
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
