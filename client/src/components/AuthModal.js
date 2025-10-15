import { auth } from '../core/Auth.js'

export class AuthModal {
  constructor() {
    this.isOpen = false
    this.mode = 'signin' // 'signin' or 'signup'
    this.awaitingConfirmation = false
    this.pendingEmail = null
    this.createModal()
    this.setupAuthListeners()
  }

  createModal() {
    // Create modal container
    this.modal = document.createElement('div')
    this.modal.className = 'auth-modal'
    this.modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    `

    // Create modal content
    this.modalContent = document.createElement('div')
    this.modalContent.className = 'auth-modal-content'
    this.modalContent.style.cssText = `
      background: white;
      padding: 2rem;
      border-radius: 8px;
      min-width: 300px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      outline: none;
      position: relative;
      z-index: 1001;
    `

    this.modal.appendChild(this.modalContent)
    document.body.appendChild(this.modal)

    // Close modal when clicking outside content area
    this.modal.addEventListener('mousedown', (e) => {
      if (e.target === this.modal) {
        this.close()
      }
    })

    this.render()
  }

  setupAuthListeners() {
    // Listen for email confirmation required
    auth.onEmailConfirmationRequired((email) => {
      this.pendingEmail = email
      this.awaitingConfirmation = true
      this.showEmailConfirmationMessage()
    })
  }

  showEmailConfirmationMessage() {
    this.modalContent.innerHTML = `
      <h2 style="margin-bottom: 1.5rem; text-align: center; color: #333;">Check Your Email</h2>
      <div style="text-align: center; margin-bottom: 1.5rem; color: #666;">
        <p>We've sent a confirmation link to:</p>
        <p style="font-weight: bold; margin: 0.5rem 0; color: #333;">${this.pendingEmail}</p>
        <p style="font-size: 14px;">Click the link in your email to activate your account, then try signing in again.</p>
      </div>
      <button
        id="resend-confirmation"
        style="width: 100%; padding: 0.75rem; background: #4ecdc4; color: white; border: none; border-radius: 4px; cursor: pointer; margin-bottom: 0.5rem;"
      >
        Resend Confirmation Email
      </button>
      <button
        id="back-to-signin"
        style="width: 100%; padding: 0.5rem; background: transparent; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; color: #333;"
      >
        Back to Sign In
      </button>
      <div id="auth-message" style="margin-top: 1rem; text-align: center; color: #28a745;"></div>
    `

    this.attachConfirmationEventListeners()
  }

  attachConfirmationEventListeners() {
    const resendBtn = this.modalContent.querySelector('#resend-confirmation')
    const backBtn = this.modalContent.querySelector('#back-to-signin')
    const messageDiv = this.modalContent.querySelector('#auth-message')

    if (resendBtn) {
      resendBtn.addEventListener('click', async () => {
        try {
          await auth.signUp(this.pendingEmail, 'dummy_password') // Resend confirmation
          messageDiv.textContent = 'Confirmation email sent!'
          messageDiv.style.color = '#28a745'
        } catch (error) {
          messageDiv.textContent = 'Error resending email: ' + error.message
          messageDiv.style.color = '#e74c3c'
        }
      })
    }

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.awaitingConfirmation = false
        this.pendingEmail = null
        this.mode = 'signin'
        this.render()
      })
    }
  }

  render() {
    const title = this.mode === 'signin' ? 'Sign In' : 'Sign Up'
    const toggleText = this.mode === 'signin'
      ? "Don't have an account? Sign up"
      : "Already have an account? Sign in"
    const submitText = this.mode === 'signin' ? 'Sign In' : 'Sign Up'

    this.modalContent.innerHTML = `
      <h2 style="margin-bottom: 1.5rem; text-align: center; color: #333;">${title}</h2>
      <form id="auth-form">
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: bold; color: #333;">Email:</label>
          <input
            type="email"
            id="email"
            required
            style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; color: #333; background: white;"
          >
        </div>
        <div style="margin-bottom: 1.5rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: bold; color: #333;">Password:</label>
          <input
            type="password"
            id="password"
            required
            minlength="6"
            style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; color: #333; background: white;"
          >
        </div>
        <button
          type="submit"
          style="width: 100%; padding: 0.75rem; background: #4ecdc4; color: white; border: none; border-radius: 4px; cursor: pointer;"
        >
          ${submitText}
        </button>
        <button
          type="button"
          id="toggle-mode"
          style="width: 100%; margin-top: 0.5rem; padding: 0.5rem; background: transparent; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; color: #333;"
        >
          ${toggleText}
        </button>
      </form>
      <div id="auth-message" style="margin-top: 1rem; text-align: center; color: #e74c3c;"></div>
    `

    this.attachEventListeners()
  }

  attachEventListeners() {
    const form = this.modalContent.querySelector('#auth-form')
    const toggleBtn = this.modalContent.querySelector('#toggle-mode')
    const emailInput = this.modalContent.querySelector('#email')
    const passwordInput = this.modalContent.querySelector('#password')
    const messageDiv = this.modalContent.querySelector('#auth-message')

    form.addEventListener('submit', async (e) => {
      e.preventDefault()

      const email = emailInput.value.trim()
      const password = passwordInput.value

      if (!email || !password) {
        this.showMessage('Please fill in all fields')
        return
      }

      try {
        console.log('Form submission started, mode:', this.mode)

        if (this.mode === 'signin') {
          console.log('Attempting sign in for:', email)
          const result = await auth.signIn(email, password)
          console.log('Sign in result:', result)

          if (result.user) {
            this.showMessage('Successfully signed in!', 'green')
            setTimeout(() => this.close(), 1000)
          }
        } else {
          console.log('Attempting sign up for:', email)
          // For signup, we don't check result.user immediately since email confirmation is required
          await auth.signUp(email, password)
          console.log('Sign up completed successfully')

          // Show success message - email confirmation will be handled by the auth listener
          this.showMessage('Account created! Please check your email for a confirmation link.', 'green')
        }
      } catch (error) {
        console.error('Auth error:', error)
        // Handle specific error cases
        if (error.message.includes('Email not confirmed')) {
          this.showMessage('Please check your email and click the confirmation link before signing in.', '#ffa500')
        } else if (error.message.includes('Invalid login credentials')) {
          this.showMessage('Invalid email or password. Please try again.', '#e74c3c')
        } else if (error.message.includes('User already registered')) {
          this.showMessage('An account with this email already exists. Try signing in instead.', '#ffa500')
        } else if (error.message.includes('Password should be at least')) {
          this.showMessage('Password should be at least 6 characters long.', '#e74c3c')
        } else {
          this.showMessage(error.message)
        }
      }
    })

    toggleBtn.addEventListener('click', () => {
      this.mode = this.mode === 'signin' ? 'signup' : 'signin'
      this.render()
    })
  }

  showMessage(message, color = '#e74c3c') {
    const messageDiv = this.modalContent.querySelector('#auth-message')
    messageDiv.textContent = message
    messageDiv.style.color = color
  }

  open(mode = 'signin') {
    this.mode = mode
    this.render()
    this.modal.style.display = 'flex'
    this.isOpen = true

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden'

    // Notify parent that modal is open
    this.onModalStateChange?.(true)

    // Focus first input
    setTimeout(() => {
      const emailInput = this.modalContent.querySelector('#email')
      if (emailInput) emailInput.focus()
    }, 100)

    // Handle Escape to close modal
    this.handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        this.close()
      }
    }

    // Add listener to modal content
    this.modalContent.addEventListener('keydown', this.handleKeyDown)
  }

  close() {
    this.modal.style.display = 'none'
    this.isOpen = false

    // Restore body scroll
    document.body.style.overflow = ''

    // Notify parent that modal is closed
    this.onModalStateChange?.(false)

    // Remove keyboard event listeners
    if (this.handleKeyDown) {
      this.modalContent.removeEventListener('keydown', this.handleKeyDown)
      this.handleKeyDown = null
    }
  }

  dispose() {
    // Clean up event listeners
    this.close()

    // Remove modal from DOM
    if (this.modal && this.modal.parentNode) {
      this.modal.parentNode.removeChild(this.modal)
    }

    this.modal = null
    this.modalContent = null
  }
}

