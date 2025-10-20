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

    this.createUI();
    this.bindEvents();
  }

  createUI() {
    // Create main chat container
    this.container = document.createElement('div');
    this.container.className = 'ai-chat-container';
    this.container.innerHTML = `
      <div class="ai-chat-header">
        <div class="ai-chat-header-content">
          <div class="ai-chat-icon">🤖</div>
          <div class="ai-chat-title">
            <h3>AI Canvas Agent</h3>
            <span class="ai-chat-subtitle">Describe what you want to create</span>
          </div>
        </div>
        <button class="ai-chat-toggle" id="ai-chat-toggle">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
            <path d="M2 17l10 5 10-5"></path>
            <path d="M2 12l10 5 10-5"></path>
          </svg>
        </button>
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

      <div class="ai-chat-input-container">
        <div class="ai-chat-input-wrapper">
          <input
            type="text"
            id="ai-chat-input"
            placeholder="Describe what you want to create or modify..."
            autocomplete="off"
          >
          <button class="ai-chat-send" id="ai-chat-send">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22,2 15,22 11,13 2,9"></polygon>
            </svg>
          </button>
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
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .ai-chat-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 400px;
        height: 600px;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        display: flex;
        flex-direction: column;
        z-index: 1000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        overflow: hidden;
        border: 1px solid #e5e7eb;
      }

      .ai-chat-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 16px 20px;
        border-radius: 16px 16px 0 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .ai-chat-header-content {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .ai-chat-icon {
        font-size: 24px;
        background: rgba(255, 255, 255, 0.2);
        width: 40px;
        height: 40px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .ai-chat-title h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }

      .ai-chat-subtitle {
        font-size: 12px;
        opacity: 0.8;
        margin-top: 2px;
      }

      .ai-chat-toggle {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
      }

      .ai-chat-toggle:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: scale(1.05);
      }

      .ai-chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        background: #f8fafc;
      }

      .ai-chat-welcome {
        text-align: center;
        padding: 20px 0;
      }

      .ai-chat-welcome-icon {
        font-size: 32px;
        margin-bottom: 12px;
      }

      .ai-chat-welcome h4 {
        margin: 0 0 8px 0;
        color: #1f2937;
        font-size: 18px;
        font-weight: 600;
      }

      .ai-chat-welcome p {
        margin: 0 0 16px 0;
        color: #6b7280;
        font-size: 14px;
      }

      .ai-chat-examples {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .ai-example {
        background: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 13px;
        color: #374151;
        border: 1px solid #e5e7eb;
        text-align: left;
        cursor: pointer;
        transition: all 0.2s;
      }

      .ai-example:hover {
        border-color: #667eea;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
      }

      .ai-message {
        margin-bottom: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .ai-message.user {
        align-items: flex-end;
      }

      .ai-message.ai {
        align-items: flex-start;
      }

      .ai-message-bubble {
        max-width: 80%;
        padding: 12px 16px;
        border-radius: 16px;
        font-size: 14px;
        line-height: 1.4;
        word-wrap: break-word;
      }

      .ai-message.user .ai-message-bubble {
        background: #667eea;
        color: white;
        border-bottom-right-radius: 4px;
      }

      .ai-message.ai .ai-message-bubble {
        background: white;
        color: #374151;
        border: 1px solid #e5e7eb;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }

      .ai-message-timestamp {
        font-size: 11px;
        color: #9ca3af;
        margin-top: 4px;
      }

      .ai-chat-input-container {
        background: white;
        border-top: 1px solid #e5e7eb;
        padding: 16px 20px;
      }

      .ai-chat-input-wrapper {
        display: flex;
        gap: 12px;
        align-items: center;
      }

      #ai-chat-input {
        flex: 1;
        padding: 12px 16px;
        border: 1px solid #d1d5db;
        border-radius: 24px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
      }

      #ai-chat-input:focus {
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }

      .ai-chat-send {
        background: #667eea;
        border: none;
        color: white;
        width: 40px;
        height: 40px;
        border-radius: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
      }

      .ai-chat-send:hover {
        background: #5a67d8;
        transform: scale(1.05);
      }

      .ai-chat-send:disabled {
        background: #9ca3af;
        cursor: not-allowed;
        transform: none;
      }

      .ai-chat-typing {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 12px;
        color: #6b7280;
        font-size: 13px;
      }

      .ai-chat-typing-dots {
        display: flex;
        gap: 4px;
      }

      .ai-chat-typing-dots span {
        width: 6px;
        height: 6px;
        background: #667eea;
        border-radius: 50%;
        animation: typing 1.4s infinite ease-in-out;
      }

      .ai-chat-typing-dots span:nth-child(1) { animation-delay: -0.32s; }
      .ai-chat-typing-dots span:nth-child(2) { animation-delay: -0.16s; }

      @keyframes typing {
        0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
        40% { transform: scale(1); opacity: 1; }
      }

      /* Mobile responsiveness */
      @media (max-width: 768px) {
        .ai-chat-container {
          bottom: 10px;
          right: 10px;
          left: 10px;
          width: auto;
          height: 500px;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(this.container);

    // Get DOM elements
    this.messagesContainer = this.container.querySelector('#ai-chat-messages');
    this.input = this.container.querySelector('#ai-chat-input');
    this.sendButton = this.container.querySelector('#ai-chat-send');
    this.toggleButton = this.container.querySelector('#ai-chat-toggle');
    this.typingIndicator = this.container.querySelector('#ai-chat-typing');
  }

  bindEvents() {
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

    // Toggle chat visibility
    this.toggleButton.addEventListener('click', () => {
      this.toggleChat();
    });

    // Handle example clicks
    this.container.addEventListener('click', (e) => {
      if (e.target.classList.contains('ai-example')) {
        const text = e.target.textContent;
        this.input.value = text;
        this.sendMessage();
      }
    });
  }

  toggleChat() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.container.style.height = '600px';
      this.toggleButton.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
    } else {
      this.container.style.height = 'auto';
      this.toggleButton.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
          <path d="M2 17l10 5 10-5"></path>
          <path d="M2 12l10 5 10-5"></path>
        </svg>
      `;
    }
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
    } catch (error) {
      console.error('AI Chat Error:', error);
      this.setTyping(false);
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

  dispose() {
    if (this.container) {
      document.body.removeChild(this.container);
    }
  }
}
