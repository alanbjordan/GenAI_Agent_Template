/**
 * File: client/src/utils/eventTypes.js
 * Description: Constants for event types used throughout the application
 */

export const EVENT_TYPES = {
  // Analytics events
  ANALYTICS_UPDATE: 'analytics:update',
  ANALYTICS_RESET: 'analytics:reset',
  ANALYTICS_FETCH: 'analytics:fetch',
  
  // Chat events
  CHAT_MESSAGE_SENT: 'chat:message:sent',
  CHAT_MESSAGE_RECEIVED: 'chat:message:received',
  CHAT_RESPONSE_RETURNED: 'chat:response:returned',
  CHAT_ERROR: 'chat:error',
  
  // Tool events
  TOOL_CALL_STARTED: 'tool:call:started',
  TOOL_CALL_COMPLETED: 'tool:call:completed',
  TOOL_CALL_ERROR: 'tool:call:error',
  
  // UI events
  UI_LOADING_STATE: 'ui:loading:state',
  UI_ERROR: 'ui:error',
  UI_NOTIFICATION: 'ui:notification'
}; 