/**
 * File: client/src/utils/chatService.js
 * Description: Service for handling chat-related API calls and events
 */

import apiClient from './apiClient';
import eventBus from './eventBus';
import { EVENT_TYPES } from './eventTypes';

class ChatService {
  constructor() {
    // Set up response interceptor for chat data
    this.setupResponseInterceptor();
  }

  setupResponseInterceptor() {
    // Add a response interceptor to detect chat responses
    apiClient.interceptors.response.use(
      (response) => {
        // Check if the response is from a chat endpoint
        if (response.config.url.includes('/chat') || response.config.url.includes('/tool-call-result')) {
          console.log('CHAT SERVICE: Chat response received, emitting event');
          eventBus.emit(EVENT_TYPES.CHAT_RESPONSE_RETURNED, response.data);
        }
        return response;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
  }

  // Send a chat message
  async sendMessage(message, conversationHistory) {
    try {
      console.log('CHAT SERVICE: Sending message');
      const payload = {
        message: message,
        conversation_history: conversationHistory
      };
      
      // Emit message sent event
      eventBus.emit(EVENT_TYPES.CHAT_MESSAGE_SENT, { 
        message,
        timestamp: new Date().toISOString()
      });
      
      const response = await apiClient.post('/chat', payload);
      return response.data;
    } catch (error) {
      console.error('CHAT SERVICE: Error sending message:', error);
      eventBus.emit(EVENT_TYPES.CHAT_ERROR, { error });
      throw error;
    }
  }

  // Handle tool call result
  async handleToolCallResult(conversationHistory) {
    try {
      console.log('CHAT SERVICE: Handling tool call result');
      const response = await apiClient.post('/tool-call-result', {
        conversation_history: conversationHistory
      });
      return response.data;
    } catch (error) {
      console.error('CHAT SERVICE: Error handling tool call result:', error);
      throw error;
    }
  }
}

// Create a singleton instance
const chatService = new ChatService();

export default chatService; 