/**
 * Manages UI updates and notifications
 */
export class UIManager {
  constructor(app) {
    this.app = app;
    this.notifications = [];
    this.lastNotification = null;
  }

  /**
   * Update authentication UI
   */
  updateAuthUI() {
    const authButton = document.getElementById('auth-button');
    const usernameSpan = document.getElementById('username');

    if (this.app.auth.isAuthenticated) {
      if (authButton) authButton.textContent = 'Sign Out';
      if (usernameSpan) usernameSpan.textContent = `Signed in as: ${this.app.auth.userEmail}`;
    } else {
      if (authButton) authButton.textContent = 'Sign In';
      if (usernameSpan) usernameSpan.textContent = 'Guest';
    }
  }

  /**
   * Update canvas info display
   */
  updateCanvasInfo() {
    const canvasIdElement = document.getElementById('canvas-id');
    if (canvasIdElement && this.app.currentCanvasId) {
      const shortId = this.app.currentCanvasId.substring(0, 8) + '...';
      canvasIdElement.textContent = `Canvas: ${shortId}`;
    }
  }

  /**
   * Update canvas URL
   */
  updateCanvasUrl() {
    if (!this.app.currentCanvasId) return;

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('canvas', this.app.currentCanvasId);
    window.history.replaceState({}, '', currentUrl.toString());

    console.log('🔗 Updated URL to:', currentUrl.toString());
  }

  /**
   * Update presence display
   */
  updatePresenceDisplay() {
    const onlineCountElement = document.getElementById('online-count');
    const presenceIndicator = document.querySelector('.presence-indicator');

    if (onlineCountElement) {
      const userCount = this.app.onlineUsers.size;
      const countText = userCount === 1 ? '1 user online' : `${userCount} users online`;
      onlineCountElement.textContent = countText;
    }

    if (presenceIndicator) {
      presenceIndicator.style.backgroundColor = this.app.socketManager.isConnected ? '#4caf50' : '#f44336';
    }
  }

  /**
   * Show notification
   */
  showNotification(message, type = 'info') {
    const now = Date.now();
    const duplicateKey = `${message}-${type}`;

    // Check if we recently showed this exact notification
    if (this.lastNotification && this.lastNotification.key === duplicateKey) {
      const timeDiff = now - this.lastNotification.timestamp;
      if (timeDiff < 2000) {
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

    this.notifications.unshift(notification);
    this.updateNotificationsDisplay();

    // Auto-remove after 5 seconds
    setTimeout(() => {
      this.removeNotification(notification.id);
    }, 5000);
  }

  /**
   * Remove notification
   */
  removeNotification(id) {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.updateNotificationsDisplay();
  }

  /**
   * Update notifications display
   */
  updateNotificationsDisplay() {
    const notificationsContainer = document.getElementById('notifications-container');
    if (!notificationsContainer) return;

    // Clear existing notifications
    notificationsContainer.innerHTML = '';

    // Add notifications in reverse order (newest first)
    this.notifications.slice().reverse().forEach((notification, index) => {
      const notificationElement = document.createElement('div');
      notificationElement.className = `notification notification-${notification.type}`;

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

  /**
   * Show share notification
   */
  showShareNotification(message) {
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

  /**
   * Update undo/redo button states
   */
  updateUndoRedoButtonStates() {
    const undoButton = document.getElementById('undo-button');
    const redoButton = document.getElementById('redo-button');

    if (undoButton && this.app.historyManager) {
      const canUndo = this.app.historyManager.canUndo();
      undoButton.disabled = !canUndo;
    }

    if (redoButton && this.app.historyManager) {
      const canRedo = this.app.historyManager.canRedo();
      redoButton.disabled = !canRedo;
    }
  }

  /**
   * Hide loading screen
   */
  hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
      setTimeout(() => {
        loading.classList.add('hidden');
      }, 300);
    }
  }

  /**
   * Share canvas
   */
  shareCanvas() {
    if (!this.app.currentCanvasId) return;

    this.updateCanvasUrl();

    const currentUrl = new URL(window.location.href);

    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentUrl.toString()).then(() => {
        this.showShareNotification('Canvas link copied to clipboard!');
      }).catch(() => {
        this.showShareNotification('Share this link: ' + currentUrl.toString());
      });
    } else {
      this.showShareNotification('Share this link: ' + currentUrl.toString());
    }
  }
}
