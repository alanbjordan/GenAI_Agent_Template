/**
 * File: client/src/utils/analyticsService.js
 * Description: Service for handling analytics-related API calls and events
 */

import apiClient from './apiClient';
import eventBus from './eventBus';
import { EVENT_TYPES } from './eventTypes';

class AnalyticsService {
  constructor() {
    // Set up response interceptor for analytics data
    this.setupResponseInterceptor();
  }

  setupResponseInterceptor() {
    // Add a response interceptor to detect analytics data in responses
    apiClient.interceptors.response.use(
      (response) => {
        // Check if the response contains analytics data
        if (response.data && response.data.analytics) {
          console.log('ANALYTICS SERVICE: Response contains analytics data, emitting event');
          eventBus.emit(EVENT_TYPES.ANALYTICS_FETCH);
        }
        return response;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
  }

  // Fetch analytics summary data
  async fetchAnalyticsSummary() {
    try {
      console.log('ANALYTICS SERVICE: Fetching analytics summary');
      const response = await apiClient.get('/analytics/summary');
      return response.data;
    } catch (error) {
      console.error('ANALYTICS SERVICE: Error fetching analytics summary:', error);
      throw error;
    }
  }

  // Reset analytics data
  async resetAnalytics() {
    try {
      console.log('ANALYTICS SERVICE: Resetting analytics data');
      const response = await apiClient.post('/analytics/reset');
      return response.data;
    } catch (error) {
      console.error('ANALYTICS SERVICE: Error resetting analytics data:', error);
      throw error;
    }
  }
}

// Create a singleton instance
const analyticsService = new AnalyticsService();

export default analyticsService; 