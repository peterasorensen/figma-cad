/**
 * AI Canvas Agent Chat Interface
 * A prominent chat interface for natural language canvas manipulation
 */
export class AIChat {
  constructor(app) {
    this.app = app;
    this.isOpen = false;
    this.messages = [];
    this.isTyping = false;
    this.currentMessageId = null;
    this.pendingAIBulkAction = null; // Track AI bulk operations for undo

    this.createUI();
    this.bindEvents();

    // Register with socket event handler for AI operation tracking
    if (this.app.socketEventHandler) {
      this.app.socketEventHandler.registerAIChat(this);
    }
  }

  createUI() {
    // Create main chat container
    this.container = document.createElement('div');
    this.container.className = 'ai-chat-container';
    this.container.innerHTML = `
      <div class="ai-chat-bar">
        <div class="ai-chat-bar-content">
          <div class="ai-chat-icon">🤖</div>
          <div class="ai-chat-suggestions">
            <div class="ai-suggestion">"Create a red rectangle"</div>
            <div class="ai-suggestion">"Add a blue sphere"</div>
            <div class="ai-suggestion">"Make a login form"</div>
            <div class="ai-suggestion">"Create text"</div>
            <div class="ai-suggestion">"Grid of boxes"</div>
          </div>
          <div class="ai-chat-input-section">
            <input
              type="text"
              id="ai-chat-input"
              placeholder="Describe what you want to create..."
              autocomplete="off"
            >
            <button class="ai-chat-send" id="ai-chat-send">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22,2 15,22 11,13 2,9"></polygon>
              </svg>
            </button>
          </div>
        </div>
        <div class="ai-chat-typing" id="ai-chat-typing" style="display: none;">
          <div class="ai-chat-typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span>AI is thinking...</span>
        </div>
      </div>

      <div class="ai-chat-expanded" id="ai-chat-expanded">
        <div class="ai-chat-expanded-header">
          <div class="ai-chat-expanded-title">
            <span class="ai-chat-icon-small">🤖</span>
            <span>AI Canvas Agent</span>
          </div>
          <div class="ai-chat-message-count" id="ai-chat-message-count">0 messages</div>
        </div>
        <div class="ai-chat-messages" id="ai-chat-messages">
          <div class="ai-chat-welcome">
            <div class="ai-chat-welcome-icon">✨</div>
            <h4>Welcome to AI Canvas Agent!</h4>
            <p>Try commands like:</p>
            <div class="ai-chat-examples">
              <div class="ai-example">"Create a red rectangle in the center"</div>
              <div class="ai-example">"Add a blue sphere at position 5, 3, 5"</div>
              <div class="ai-example">"Make a login form with username and password"</div>
              <div class="ai-example">"Create a grid of 2x2 boxes"</div>
              <div class="ai-example">"Add a green torus at 0, 2, 0"</div>
              <div class="ai-example">"Move all red spheres to the center"</div>
              <div class="ai-example">"Create text that says 'Hello World'"</div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .ai-chat-container {
        position: fixed;
        bottom: 45px; /* Above the status bar */
        left: 20px; /* Positioned next to the toolbar */
        z-index: 999; /* Below status bar but above canvas */
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        pointer-events: none;
        max-width: calc(100vw - 140px); /* Leave space for toolbar and some margin */
      }

      .ai-chat-bar {
        position: relative;
        background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 25px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        pointer-events: all;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .ai-chat-bar-content {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px 24px;
        min-height: 60px;
      }

      .ai-chat-icon {
        font-size: 20px;
        background: rgba(0, 0, 0, 0.1);
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        backdrop-filter: blur(10px);
        color: #333333;
      }

      .ai-chat-suggestions {
        display: flex;
        gap: 8px;
        flex: 1;
        overflow: hidden;
        mask-image: linear-gradient(to right, black 85%, transparent 100%);
      }

      .ai-suggestion {
        background: rgba(0, 0, 0, 0.08);
        color: #555555;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 1px solid rgba(0, 0, 0, 0.1);
        backdrop-filter: blur(10px);
      }

      .ai-suggestion:hover {
        background: rgba(0, 0, 0, 0.15);
        color: #333333;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }

      .ai-chat-input-section {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
        background: rgba(0, 0, 0, 0.05);
        border-radius: 25px;
        padding: 2px;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(0, 0, 0, 0.08);
      }

      #ai-chat-input {
        background: transparent;
        border: none;
        outline: none;
        padding: 8px 16px;
        font-size: 14px;
        color: #333333;
        width: 250px;
        font-weight: 400;
      }

      #ai-chat-input::placeholder {
        color: #999999;
      }

      #ai-chat-input:focus {
        color: #222222;
      }

      .ai-chat-send {
        background: rgba(0, 0, 0, 0.1);
        border: none;
        color: #555555;
        width: 32px;
        height: 32px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
        backdrop-filter: blur(10px);
      }

      .ai-chat-send:hover {
        background: rgba(0, 0, 0, 0.2);
        color: #333333;
        transform: scale(1.05);
      }

      .ai-chat-send:disabled {
        background: rgba(0, 0, 0, 0.05);
        cursor: not-allowed;
        transform: none;
        color: #cccccc;
      }

      .ai-chat-typing {
        position: absolute;
        top: -40px;
        right: 24px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 8px 12px;
        border-radius: 20px;
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 6px;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(0, 0, 0, 0.1);
      }

      .ai-chat-typing-dots {
        display: flex;
        gap: 3px;
      }

      .ai-chat-typing-dots span {
        width: 4px;
        height: 4px;
        background: #667eea;
        border-radius: 50%;
        animation: typing 1.4s infinite ease-in-out;
      }

      .ai-chat-typing-dots span:nth-child(1) { animation-delay: -0.32s; }
      .ai-chat-typing-dots span:nth-child(2) { animation-delay: -0.16s; }

      .ai-chat-expanded {
        position: absolute;
        bottom: 100%;
        left: 0;
        right: 0;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(20px);
        border-radius: 20px;
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-bottom: none;
        box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.15);
        max-height: 400px;
        overflow: hidden;
        opacity: 0;
        transform: translateY(20px);
        pointer-events: none;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .ai-chat-container:hover .ai-chat-expanded {
        opacity: 1;
        transform: translateY(0);
        pointer-events: all;
      }

      .ai-chat-expanded-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 24px;
        background: linear-gradient(135deg, #f0f0f0 0%, #e3e3e3 100%);
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 20px 20px 0 0;
      }

      .ai-chat-expanded-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 600;
        color: #333333;
      }

      .ai-chat-icon-small {
        font-size: 16px;
      }

      .ai-chat-message-count {
        font-size: 12px;
        color: #777777;
        font-weight: 500;
      }

      .ai-chat-messages {
        max-height: 320px;
        overflow-y: auto;
        padding: 20px 24px;
        background: transparent;
      }

      .ai-chat-welcome {
        text-align: center;
        padding: 20px 0;
      }

      .ai-chat-welcome-icon {
        font-size: 28px;
        margin-bottom: 10px;
        color: #666666;
      }

      .ai-chat-welcome h4 {
        margin: 0 0 6px 0;
        color: #333333;
        font-size: 16px;
        font-weight: 600;
      }

      .ai-chat-welcome p {
        margin: 0 0 12px 0;
        color: #777777;
        font-size: 13px;
      }

      .ai-chat-examples {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .ai-example {
        background: rgba(0, 0, 0, 0.05);
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 12px;
        color: #666666;
        border: 1px solid rgba(0, 0, 0, 0.1);
        text-align: left;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      }

      .ai-example:hover {
        background: rgba(0, 0, 0, 0.08);
        border-color: rgba(0, 0, 0, 0.2);
        color: #333333;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        transform: translateY(-1px);
      }

      .ai-message {
        margin-bottom: 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .ai-message.user {
        align-items: flex-end;
      }

      .ai-message.ai {
        align-items: flex-start;
      }

      .ai-message-bubble {
        max-width: 80%;
        padding: 10px 14px;
        border-radius: 16px;
        font-size: 13px;
        line-height: 1.4;
        word-wrap: break-word;
      }

      .ai-message.user .ai-message-bubble {
        background: rgba(0, 0, 0, 0.1);
        color: #ffffff;
        border-bottom-right-radius: 4px;
        border: 1px solid rgba(0, 0, 0, 0.1);
      }

      .ai-message.ai .ai-message-bubble {
        background: rgba(0, 0, 0, 0.05);
        color: #333333;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      }

      .ai-message-timestamp {
        font-size: 10px;
        color: #999999;
        margin-top: 2px;
      }

      @keyframes typing {
        0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
        40% { transform: scale(1); opacity: 1; }
      }

      /* Mobile responsiveness */
      @media (max-width: 768px) {
        .ai-chat-bar-content {
          padding: 10px 16px;
          gap: 12px;
        }

        #ai-chat-input {
          width: 180px;
        }

        .ai-chat-suggestions {
          gap: 6px;
        }

        .ai-suggestion {
          padding: 4px 8px;
          font-size: 11px;
        }

        .ai-chat-expanded {
          max-height: 300px;
        }

        .ai-chat-messages {
          max-height: 240px;
          padding: 16px;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(this.container);

    // Get DOM elements
    this.messagesContainer = this.container.querySelector('#ai-chat-messages');
    this.input = this.container.querySelector('#ai-chat-input');
    this.sendButton = this.container.querySelector('#ai-chat-send');
    this.typingIndicator = this.container.querySelector('#ai-chat-typing');
    this.messageCount = this.container.querySelector('#ai-chat-message-count');
    this.suggestions = this.container.querySelectorAll('.ai-suggestion');
  }

  bindEvents() {
    // Safety checks for DOM elements
    if (!this.input || !this.sendButton || !this.container) {
      console.error('AI Chat: Required DOM elements not found');
      return;
    }

    // Send message on Enter key
    this.input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Send message on button click
    this.sendButton.addEventListener('click', () => {
      this.sendMessage();
    });

    // Handle suggestion clicks (only if suggestions exist)
    if (this.suggestions && this.suggestions.length > 0) {
      this.suggestions.forEach(suggestion => {
        suggestion.addEventListener('click', () => {
          const text = suggestion.textContent;
          this.input.value = text;
          this.sendMessage();
        });
      });
    }

    // Handle example clicks (in expanded view)
    this.container.addEventListener('click', (e) => {
      if (e.target.classList.contains('ai-example')) {
        const text = e.target.textContent;
        this.input.value = text;
        this.sendMessage();
      }
    });
  }


  async sendMessage() {
    const text = this.input.value.trim();
    if (!text || this.isTyping) return;

    // Add user message
    this.addMessage('user', text);
    this.input.value = '';

    // Show typing indicator
    this.setTyping(true);

    try {
      // Create a pending AI bulk action for undo functionality
      if (this.app.historyManager && this.app.shapeManager) {
        // Capture the current state of all shapes BEFORE AI operations
        const allShapes = this.app.shapeManager.getAllShapes();
        const beforeStates = {};

        for (const shape of allShapes) {
          beforeStates[shape.id] = {
            position: { ...shape.getPosition() },
            rotation: { ...shape.getRotation() },
            properties: { ...shape.properties },
            geometry: shape.serializeGeometry(),
            type: shape.type
          };
        }

        this.pendingAIBulkAction = {
          command: text,
          beforeStates: beforeStates,
          affectedShapes: new Set(),
          action: null
        };
      }

      // Send to AI API
      const response = await this.callAIAgent(text);

      // Hide typing indicator
      this.setTyping(false);

      // Add AI response
      this.addMessage('ai', response.message);

      // Execute any canvas actions
      if (response.actions && response.actions.length > 0) {
        await this.executeActions(response.actions);
      }

      // Commit the AI bulk action if we were tracking it
      if (this.pendingAIBulkAction && this.app.historyManager && this.app.shapeManager) {
        if (this.pendingAIBulkAction.affectedShapes.size > 0) {
          // Create the AI bulk action manually with proper before/after states
          const shapes = [];
          const affectedShapeIds = Array.from(this.pendingAIBulkAction.affectedShapes);
          const currentShapes = this.app.shapeManager.getAllShapes();
          const currentShapeIds = new Set(currentShapes.map(s => s.id));

          for (const shapeId of affectedShapeIds) {
            const beforeState = this.pendingAIBulkAction.beforeStates[shapeId];
            const currentShape = this.app.shapeManager.getShape(shapeId);

            if (beforeState && currentShape) {
              // Shape existed before and still exists - it was modified
              const afterState = {
                position: { ...currentShape.getPosition() },
                rotation: { ...currentShape.getRotation() },
                properties: { ...currentShape.properties },
                geometry: currentShape.serializeGeometry(),
                type: currentShape.type
              };

              shapes.push({
                id: shapeId,
                type: beforeState.type,
                before: beforeState,
                after: afterState
              });
            } else if (beforeState && !currentShape) {
              // Shape existed before but was deleted
              shapes.push({
                id: shapeId,
                type: beforeState.type,
                before: beforeState,
                after: null // Deleted
              });
            } else if (!beforeState && currentShape) {
              // Shape didn't exist before but was created
              const afterState = {
                position: { ...currentShape.getPosition() },
                rotation: { ...currentShape.getRotation() },
                properties: { ...currentShape.properties },
                geometry: currentShape.serializeGeometry(),
                type: currentShape.type
              };

              shapes.push({
                id: shapeId,
                type: currentShape.type,
                before: null, // Created
                after: afterState
              });
            }
          }

          if (shapes.length > 0) {
            // Create the action directly
            const action = {
              type: 'ai-bulk',
              timestamp: Date.now(),
              aiCommand: this.pendingAIBulkAction.command,
              shapes: shapes,
              selectedShapes: [] // No selection for AI operations
            };

            // Push it to history
            this.app.historyManager.pushAction(action);

            // Update undo/redo button states
            if (this.app.uiManager) {
              this.app.uiManager.updateUndoRedoButtonStates();
            }
          }
        }

        this.pendingAIBulkAction = null;
      }
    } catch (error) {
      console.error('AI Chat Error:', error);
      this.setTyping(false);
      this.pendingAIBulkAction = null;
      this.addMessage('ai', 'Sorry, I encountered an error. Please try again.');
    }
  }

  addMessage(type, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${type}`;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    messageDiv.innerHTML = `
      <div class="ai-message-bubble">${this.formatMessage(content)}</div>
      <div class="ai-message-timestamp">${timestamp}</div>
    `;

    this.messagesContainer.appendChild(messageDiv);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

    // Update message count (only if element exists)
    if (this.messagesContainer && this.messageCount) {
      const messageElements = this.messagesContainer.querySelectorAll('.ai-message');
      const messageCount = messageElements.length;
      this.messageCount.textContent = `${messageCount} message${messageCount !== 1 ? 's' : ''}`;
    }

    // Hide welcome message after first interaction
    const welcome = this.messagesContainer.querySelector('.ai-chat-welcome');
    if (welcome) {
      welcome.style.display = 'none';
    }
  }

  formatMessage(text) {
    // Convert URLs to links, **bold** to bold, etc.
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
  }

  setTyping(typing) {
    this.isTyping = typing;
    this.typingIndicator.style.display = typing ? 'flex' : 'none';
    this.sendButton.disabled = typing;
  }

  async callAIAgent(message) {
    // Get the server URL from environment or default to localhost:3001
    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

    const response = await fetch(`${serverUrl}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        canvasId: this.app.currentCanvasId,
        userId: this.app.auth.userId
      })
    });

    if (!response.ok) {
      throw new Error('AI API request failed');
    }

    return await response.json();
  }

  async executeActions(actions) {
    // This will execute the canvas manipulation functions
    for (const action of actions) {
      try {
        await this.executeAction(action);
      } catch (error) {
        console.error('Failed to execute action:', action, error);
        this.addMessage('ai', `❌ Failed to execute: ${action.description || 'Unknown action'}`);
      }
    }
  }

  async executeAction(action) {
    console.log('Executing action:', action);

    // Show success message for the action
    if (action.successMessage) {
      this.addMessage('ai', `✅ ${action.successMessage}`);
    }

    // The actual canvas manipulation is handled server-side and synced via real-time updates
    // The client will receive the updates through the existing socket events
    // No additional client-side action needed here
  }

  /**
   * Track shapes affected by AI operations for undo functionality
   */
  trackAffectedShape(shapeId) {
    if (this.pendingAIBulkAction) {
      this.pendingAIBulkAction.affectedShapes.add(shapeId);
    }
  }

  dispose() {
    if (this.container) {
      document.body.removeChild(this.container);
    }
  }
}
