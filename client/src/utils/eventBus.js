/**
 * File: client/src/utils/eventBus.js
 * Description: Event bus service for handling application-wide events
 */

class EventBus {
  constructor() {
    this.events = {};
  }

  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
    
    // Return unsubscribe function
    return () => {
      this.events[event] = this.events[event].filter(cb => cb !== callback);
    };
  }

  emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  off(event, callback) {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter(cb => cb !== callback);
    }
  }

  // Clear all listeners for an event
  clear(event) {
    if (event) {
      delete this.events[event];
    } else {
      this.events = {};
    }
  }
}

// Create a singleton instance
const eventBus = new EventBus();

export default eventBus; 