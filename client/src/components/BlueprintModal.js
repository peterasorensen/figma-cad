/**
 * BlueprintModal Component
 * Handles blueprint upload, AI room detection, and room import
 */

export class BlueprintModal {
  constructor(app) {
    this.app = app;
    this.modalElement = null;
    this.blueprintId = null;
    this.detectedRooms = [];
    this.blueprintImageUrl = null;
    this.isProcessing = false;

    this.createModal();
    this.attachEventListeners();
  }

  /**
   * Create modal HTML structure
   */
  createModal() {
    const modalHTML = `
      <div id="blueprint-modal" class="blueprint-modal" style="display: none;">
        <div class="blueprint-modal-overlay"></div>
        <div class="blueprint-modal-content">
          <div class="blueprint-modal-header">
            <h2>Import Blueprint & Detect Rooms</h2>
            <button class="blueprint-modal-close" id="blueprint-modal-close">&times;</button>
          </div>

          <div class="blueprint-modal-body">
            <!-- Step 1: Upload -->
            <div class="blueprint-step" id="blueprint-step-upload">
              <div class="blueprint-upload-area" id="blueprint-upload-area">
                <input type="file" id="blueprint-file-input" accept=".png,.jpg,.jpeg,.pdf" style="display: none;" />
                <div class="blueprint-upload-icon">📐</div>
                <h3>Upload Blueprint</h3>
                <p>Drag & drop or click to upload</p>
                <p class="blueprint-file-hint">Supports: PNG, JPG, PDF (max 10MB)</p>
                <button class="blueprint-btn blueprint-btn-primary" id="blueprint-select-btn">
                  Select Blueprint File
                </button>
              </div>
            </div>

            <!-- Step 2: Processing -->
            <div class="blueprint-step" id="blueprint-step-processing" style="display: none;">
              <div class="blueprint-processing">
                <div class="blueprint-spinner"></div>
                <h3>Detecting Rooms...</h3>
                <p id="blueprint-progress-text">Initializing AI analysis...</p>
                <div class="blueprint-progress-bar">
                  <div class="blueprint-progress-fill" id="blueprint-progress-fill"></div>
                </div>
                <p class="blueprint-progress-percent" id="blueprint-progress-percent">0%</p>
              </div>
            </div>

            <!-- Step 3: Results -->
            <div class="blueprint-step" id="blueprint-step-results" style="display: none;">
              <div class="blueprint-results">
                <h3>Detection Complete!</h3>
                <p id="blueprint-results-summary">Found <strong id="blueprint-room-count">0</strong> rooms</p>

                <div class="blueprint-preview-container">
                  <canvas id="blueprint-preview-canvas"></canvas>
                </div>

                <div class="blueprint-room-list" id="blueprint-room-list">
                  <!-- Room items will be added here dynamically -->
                </div>

                <div class="blueprint-actions">
                  <button class="blueprint-btn blueprint-btn-secondary" id="blueprint-retry-btn">
                    Try Another Blueprint
                  </button>
                  <button class="blueprint-btn blueprint-btn-primary" id="blueprint-import-btn">
                    Import Rooms to Canvas
                  </button>
                </div>
              </div>
            </div>

            <!-- Error State -->
            <div class="blueprint-step" id="blueprint-step-error" style="display: none;">
              <div class="blueprint-error">
                <div class="blueprint-error-icon">⚠️</div>
                <h3>Detection Failed</h3>
                <p id="blueprint-error-message">An error occurred during room detection.</p>
                <button class="blueprint-btn blueprint-btn-primary" id="blueprint-error-retry-btn">
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Append modal to body
    const div = document.createElement('div');
    div.innerHTML = modalHTML;
    document.body.appendChild(div.firstElementChild);

    this.modalElement = document.getElementById('blueprint-modal');
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Close modal
    const closeBtn = document.getElementById('blueprint-modal-close');
    const overlay = this.modalElement.querySelector('.blueprint-modal-overlay');

    closeBtn.addEventListener('click', () => this.close());
    overlay.addEventListener('click', () => this.close());

    // Select file button
    const selectBtn = document.getElementById('blueprint-select-btn');
    const fileInput = document.getElementById('blueprint-file-input');

    selectBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

    // Drag and drop
    const uploadArea = document.getElementById('blueprint-upload-area');

    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('blueprint-drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('blueprint-drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('blueprint-drag-over');

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFile(files[0]);
      }
    });

    // Import and retry buttons
    document.getElementById('blueprint-import-btn').addEventListener('click', () => this.importRooms());
    document.getElementById('blueprint-retry-btn').addEventListener('click', () => this.reset());
    document.getElementById('blueprint-error-retry-btn').addEventListener('click', () => this.reset());
  }

  /**
   * Open modal
   */
  open() {
    this.modalElement.style.display = 'flex';
    this.reset();
  }

  /**
   * Close modal
   */
  close() {
    this.modalElement.style.display = 'none';
  }

  /**
   * Reset to initial state
   */
  reset() {
    this.showStep('upload');
    this.blueprintId = null;
    this.detectedRooms = [];
    this.blueprintImageUrl = null;
    this.isProcessing = false;

    // Clear file input
    document.getElementById('blueprint-file-input').value = '';
  }

  /**
   * Show specific step
   */
  showStep(step) {
    const steps = ['upload', 'processing', 'results', 'error'];
    steps.forEach(s => {
      const el = document.getElementById(`blueprint-step-${s}`);
      el.style.display = s === step ? 'block' : 'none';
    });
  }

  /**
   * Handle file selection
   */
  handleFileSelect(event) {
    const files = event.target.files;
    if (files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  /**
   * Handle file upload and processing
   */
  async handleFile(file) {
    // Validate file
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      alert('Invalid file type. Please upload a PNG, JPG, or PDF file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      alert('File too large. Please upload a file smaller than 10MB.');
      return;
    }

    // Show processing step
    this.showStep('processing');
    this.isProcessing = true;

    try {
      // Upload blueprint
      const formData = new FormData();
      formData.append('blueprint', file);
      formData.append('canvasId', this.app.currentCanvasId || 'default');

      const uploadResponse = await fetch('http://localhost:3001/api/blueprints/upload', {
        method: 'POST',
        body: formData
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload blueprint');
      }

      const uploadData = await uploadResponse.json();
      this.blueprintId = uploadData.blueprintId;
      this.blueprintImageUrl = uploadData.url;

      console.log('Blueprint uploaded:', uploadData);

      // Start room detection
      await this.detectRooms();

    } catch (error) {
      console.error('Blueprint processing error:', error);
      this.showError(error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Detect rooms from uploaded blueprint
   */
  async detectRooms() {
    try {
      // Listen for Socket.io progress updates
      this.app.socketManager.socket.on('room-detection-progress', (data) => {
        this.updateProgress(data);
      });

      // Trigger detection
      const response = await fetch('http://localhost:3001/api/blueprints/detect-rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          blueprintId: this.blueprintId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to detect rooms');
      }

      const data = await response.json();
      this.detectedRooms = data.rooms;

      console.log('Detected rooms:', this.detectedRooms);

      // Show results
      this.showResults();

    } catch (error) {
      console.error('Room detection error:', error);
      this.showError(error.message);
    } finally {
      // Remove progress listener
      this.app.socketManager.socket.off('room-detection-progress');
    }
  }

  /**
   * Update progress UI
   */
  updateProgress(data) {
    const { progress, message } = data;

    document.getElementById('blueprint-progress-text').textContent = message;
    document.getElementById('blueprint-progress-fill').style.width = `${progress}%`;
    document.getElementById('blueprint-progress-percent').textContent = `${progress}%`;
  }

  /**
   * Show results with detected rooms
   */
  showResults() {
    this.showStep('results');

    // Update room count
    document.getElementById('blueprint-room-count').textContent = this.detectedRooms.length;

    // Render room list
    const roomList = document.getElementById('blueprint-room-list');
    roomList.innerHTML = '';

    this.detectedRooms.forEach((room, index) => {
      const roomItem = document.createElement('div');
      roomItem.className = 'blueprint-room-item';
      roomItem.innerHTML = `
        <div class="blueprint-room-info">
          <strong>${room.name_hint || `Room ${index + 1}`}</strong>
          <span class="blueprint-room-confidence">Confidence: ${Math.round(room.confidence * 100)}%</span>
        </div>
        <div class="blueprint-room-coords">
          [${room.bounding_box.join(', ')}]
        </div>
      `;
      roomList.appendChild(roomItem);
    });

    // Render preview (if image URL available)
    if (this.blueprintImageUrl) {
      this.renderPreview();
    }
  }

  /**
   * Render blueprint preview with room overlays
   */
  renderPreview() {
    const canvas = document.getElementById('blueprint-preview-canvas');
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Set canvas size
      const maxWidth = 600;
      const scale = Math.min(maxWidth / img.width, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      // Draw blueprint
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw room overlays
      this.detectedRooms.forEach((room) => {
        const [x_min, y_min, x_max, y_max] = room.bounding_box;

        // Convert normalized coordinates (0-1000) to canvas coordinates
        const scaleX = canvas.width / 1000;
        const scaleY = canvas.height / 1000;

        const x = x_min * scaleX;
        const y = y_min * scaleY;
        const w = (x_max - x_min) * scaleX;
        const h = (y_max - y_min) * scaleY;

        // Draw room rectangle
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        // Draw room label
        ctx.fillStyle = '#4f46e5';
        ctx.font = '12px sans-serif';
        ctx.fillText(room.name_hint || 'Room', x + 5, y + 15);
      });
    };

    img.src = this.blueprintImageUrl;
  }

  /**
   * Import detected rooms to canvas
   */
  async importRooms() {
    if (this.detectedRooms.length === 0) {
      alert('No rooms to import');
      return;
    }

    try {
      // Optionally display blueprint as reference plane
      if (this.blueprintImageUrl) {
        this.app.displayBlueprintPlane(this.blueprintImageUrl);
      }

      // Import rooms via the app
      await this.app.importDetectedRooms(this.blueprintId, this.detectedRooms);

      // Show success message
      alert(`Successfully imported ${this.detectedRooms.length} rooms to canvas!`);

      // Close modal
      this.close();

    } catch (error) {
      console.error('Room import error:', error);
      alert('Failed to import rooms: ' + error.message);
    }
  }

  /**
   * Show error state
   */
  showError(message) {
    this.showStep('error');
    document.getElementById('blueprint-error-message').textContent = message;
  }
}
