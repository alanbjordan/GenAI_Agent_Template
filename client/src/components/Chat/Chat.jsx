/**
 * File: client/src/components/Chat/Chat.jsx
 * Description: Main chat component that handles message interactions
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import apiClient from '../../utils/apiClient';
import InventoryDisplay from './InventoryDisplay';
import Message from './Message';
import ChatInput from './ChatInput';
import './Chat.css';
import { useNavigate } from 'react-router-dom';
import eventBus from '../../utils/eventBus';
import { EVENT_TYPES } from '../../utils/eventTypes';

// A simple function to generate a unique ID.
const generateUniqueId = () => {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
};

// Function to get current time in EST
const getCurrentTimeInEST = () => {
  try {
    const now = new Date();
    const options = { 
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };
    
    const estDate = new Intl.DateTimeFormat('en-US', options).format(now);
    const [datePart, timePart] = estDate.split(', ');
    const [month, day, year] = datePart.split('/');
    
    return `${year}-${month}-${day} ${timePart} EST`;
  } catch (error) {
    console.error("Error formatting EST time:", error);
    const now = new Date();
    const estOffset = -5; // EST is UTC-5
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const est = new Date(utc + (3600000 * estOffset));
    
    return est.toISOString().replace('T', ' ').split('.')[0] + ' EST';
  }
};

const TypingIndicator = () => (
  <div className="typing-indicator">
    <span></span>
    <span></span>
    <span></span>
  </div>
);

const Chat = ({ analyticsData, updateAnalytics }) => {
  const [messages, setMessages] = useState([
    { 
      id: generateUniqueId(), 
      sender: 'bot', 
      text: 'Hello! How can I help you today?',
      timestamp: new Date()
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [toolCallInProgress, setToolCallInProgress] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (message) => {
    if (!message.trim()) return;

    const userMessage = { 
      id: generateUniqueId(), 
      sender: 'user', 
      text: message,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    try {
      let formattedHistory = conversationHistory.length > 0 
        ? [...conversationHistory] 
        : [];
      
      const currentTime = getCurrentTimeInEST();
      
      formattedHistory.push({
        role: "system",
        content: `Current time: ${currentTime}`
      });
      
      formattedHistory.push({
        role: 'user',
        content: message
      });

      const payload = {
        message: message,
        conversation_history: formattedHistory
      };

      // Emit message sent event
      eventBus.emit(EVENT_TYPES.CHAT_MESSAGE_SENT, { 
        message,
        timestamp: new Date().toISOString()
      });
      
      // Log message sent
      console.log('Message sent:', { 
        message,
        timestamp: new Date().toISOString()
      });

      const response = await apiClient.post('/chat', payload);
      const { chat_response, conversation_history: updatedHistory, tool_call_detected, analytics: updatedAnalytics } = response.data;
      
      setConversationHistory(updatedHistory);

      if (updatedAnalytics) {
        updateAnalytics(updatedAnalytics);
      }

      if (tool_call_detected) {
        setToolCallInProgress(true);
        
        const searchingMessage = { 
          id: generateUniqueId(), 
          sender: 'bot', 
          text: 'Please wait while I search our inventory.',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, searchingMessage]);
        
        const toolCallResponse = await apiClient.post('/tool-call-result', {
          conversation_history: updatedHistory
        });
        
        const { final_response, final_conversation_history, analytics: toolCallAnalytics } = toolCallResponse.data;
        
        setConversationHistory(final_conversation_history);
        
        if (toolCallAnalytics) {
          updateAnalytics(toolCallAnalytics);
        }
        
        const finalMessage = { 
          id: generateUniqueId(), 
          sender: 'bot', 
          text: final_response,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, finalMessage]);
        
        // Emit response returned event for tool call
        eventBus.emit(EVENT_TYPES.CHAT_RESPONSE_RETURNED, { 
          message: final_response,
          timestamp: new Date().toISOString(),
          isToolCall: true,
          analytics: toolCallAnalytics
        });
        
        // Log response returned for tool call
        console.log('Response returned (Tool Call):', { 
          message: final_response,
          timestamp: new Date().toISOString(),
          isToolCall: true,
          analytics: toolCallAnalytics
        });
        
        setToolCallInProgress(false);
      } else {
        const botMessage = { 
          id: generateUniqueId(), 
          sender: 'bot', 
          text: chat_response,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, botMessage]);
        
        // Emit response returned event for regular response
        eventBus.emit(EVENT_TYPES.CHAT_RESPONSE_RETURNED, { 
          message: chat_response,
          timestamp: new Date().toISOString(),
          isToolCall: false,
          analytics: updatedAnalytics
        });
        
        // Log response returned for regular response
        console.log('Response returned (Regular):', { 
          message: chat_response,
          timestamp: new Date().toISOString(),
          isToolCall: false,
          analytics: updatedAnalytics
        });
      }

      // Emit message received event
      eventBus.emit(EVENT_TYPES.CHAT_MESSAGE_RECEIVED, { 
        message: chat_response,
        analytics: updatedAnalytics 
      });
      
      // Log message received
      console.log('Message received:', { 
        message: chat_response,
        analytics: updatedAnalytics 
      });

      // Update analytics data through event bus
      if (updatedAnalytics) {
        console.log('Emitting analytics update with:', updatedAnalytics);
        eventBus.emit(EVENT_TYPES.ANALYTICS_UPDATE, updatedAnalytics);
      }

    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage = { 
        id: generateUniqueId(), 
        sender: 'bot', 
        text: 'Sorry, I encountered an error. Please try again later.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      eventBus.emit(EVENT_TYPES.CHAT_ERROR, { error: error });
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyticsClick = () => {
    navigate('/analytics');
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>Chat with AI</h2>
        <div className="header-buttons">
          <InventoryDisplay />
          <button 
            className="analytics-button"
            onClick={handleAnalyticsClick}
          >
            View Analytics
          </button>
        </div>
      </div>
      
      <div className="chat-messages">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Message message={message} />
            </motion.div>
          ))}
        </AnimatePresence>
        {loading && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>
      
      <ChatInput 
        onSend={handleSend}
        loading={loading}
        disabled={toolCallInProgress}
      />
    </div>
  );
};

export default Chat;
