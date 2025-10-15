import { App } from './App.js';

// Main entry point for the application
console.log('CollabCanvas starting...');

// Initialize app when DOM is ready
let app = null;

window.addEventListener('DOMContentLoaded', () => {
  app = new App();
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (app) {
    app.dispose();
  }
});
