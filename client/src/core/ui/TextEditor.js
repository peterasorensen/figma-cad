/**
 * Text Editor modal for editing 3D text objects
 */
export class TextEditor {
  constructor() {
    this.modal = null;
    this.input = null;
    this.confirmBtn = null;
    this.cancelBtn = null;
    this.currentShape = null;
    this.currentText = '';

    this.init();
  }

  init() {
    this.modal = document.getElementById('text-edit-modal');
    this.input = document.getElementById('text-input');
    this.confirmBtn = document.getElementById('text-confirm');
    this.cancelBtn = document.getElementById('text-cancel');

    if (!this.modal || !this.input || !this.confirmBtn || !this.cancelBtn) {
      console.warn('Text editor modal elements not found');
      return;
    }

    // Set up event listeners
    this.confirmBtn.addEventListener('click', () => this.confirmEdit());
    this.cancelBtn.addEventListener('click', () => this.cancelEdit());

    // Handle Enter key to confirm
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelEdit();
      }
    });

    // Prevent modal from closing when clicking inside
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.cancelEdit();
      }
    });
  }

  /**
   * Show the text editor modal for a specific text shape
   */
  show(shape) {
    if (!this.modal || !this.input || !shape) return;

    this.currentShape = shape;
    this.currentText = shape.properties.text || '';

    // Set the input value to current text
    this.input.value = this.currentText;

    // Show the modal
    this.modal.classList.add('show');

    // Focus the input and select all text
    setTimeout(() => {
      this.input.focus();
      this.input.select();
    }, 100);
  }

  /**
   * Hide the text editor modal
   */
  hide() {
    if (!this.modal) return;

    this.modal.classList.remove('show');
    this.currentShape = null;
    this.currentText = '';
  }

  /**
   * Confirm the text edit and update the shape
   */
  confirmEdit() {
    if (!this.currentShape || !this.input) return;

    const newText = this.input.value.trim();

    // If text is empty, use default
    const finalText = newText || 'Text';

    // Update the shape text
    if (this.currentShape.setText) {
      this.currentShape.setText(finalText);
    }

    // Dispatch event for other systems to handle
    const event = new CustomEvent('textEdited', {
      detail: {
        shapeId: this.currentShape.id,
        oldText: this.currentText,
        newText: finalText
      }
    });
    document.dispatchEvent(event);

    this.hide();
  }

  /**
   * Cancel the text edit
   */
  cancelEdit() {
    this.hide();
  }

  /**
   * Check if the modal is currently visible
   */
  isVisible() {
    return this.modal && this.modal.classList.contains('show');
  }
}
