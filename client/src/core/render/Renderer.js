/**
 * Main render loop and FPS tracking
 * Manages the animation loop and performance monitoring
 */
export class Renderer {
  constructor(scene, controls) {
    this.scene = scene;
    this.controls = controls;
    this.isRunning = false;
    this.animationId = null;

    // FPS tracking
    this.fps = 0;
    this.frames = 0;
    this.lastTime = performance.now();
    this.fpsUpdateInterval = 500; // Update FPS display every 500ms

    // Callbacks
    this.onUpdate = null;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.animate();
  }

  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  animate() {
    if (!this.isRunning) return;

    this.animationId = requestAnimationFrame(() => this.animate());

    // Update controls
    this.controls.update();

    // Call custom update callback if provided
    if (this.onUpdate) {
      this.onUpdate();
    }

    // Render scene
    this.scene.render();

    // Update FPS counter
    this.updateFPS();
  }

  updateFPS() {
    this.frames++;
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastTime;

    if (deltaTime >= this.fpsUpdateInterval) {
      this.fps = Math.round((this.frames * 1000) / deltaTime);
      this.frames = 0;
      this.lastTime = currentTime;

      // Update FPS display in UI
      const fpsElement = document.getElementById('fps');
      if (fpsElement) {
        fpsElement.textContent = `FPS: ${this.fps}`;
      }
    }
  }

  getFPS() {
    return this.fps;
  }

  setUpdateCallback(callback) {
    this.onUpdate = callback;
  }
}
