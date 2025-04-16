/**
 * File: client/src/components/Analytics/index.jsx
 * Description: Main analytics component that serves as the container for analytics features
 */

// client/src/components/Analytics/index.jsx

import React, { useState, useEffect } from 'react';
import AnalyticsSummary from './AnalyticsSummary';
import AnalyticsTable from './AnalyticsTable';
import apiClient from '../../utils/apiClient';
import eventBus from '../../utils/eventBus';
import { EVENT_TYPES } from '../../utils/eventTypes';
import './Analytics.css';

const Analytics = () => {
  const [analyticsData, setAnalyticsData] = useState({
    totalCost: 0,
    totalRequests: 0,
    averageCostPerRequest: 0,
    totalSentTokens: 0,
    totalReceivedTokens: 0,
    averageLatency: 0,
    requestsByDate: [],
    costByModel: {}
  });
  const [error, setError] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(null);

  // Function to fetch analytics data
  const fetchAnalyticsData = async () => {
    try {
      console.log('ANALYTICS: Fetching analytics data...');
      const response = await apiClient.get('/analytics/summary');
      const newData = response.data;
      setAnalyticsData(newData);
      setError(null);
      setLastFetchTime(new Date().toISOString());
      console.log('ANALYTICS: Data fetched successfully:', newData);
    } catch (err) {
      console.error('ANALYTICS: Error fetching analytics data:', err);
      setError('Failed to load analytics data. Please try again later.');
    }
  };

  const handleReset = async () => {
    try {
      console.log('ANALYTICS: Resetting analytics data...');
      // Immediately clear the data
      const emptyData = {
        totalCost: 0,
        totalRequests: 0,
        averageCostPerRequest: 0,
        totalSentTokens: 0,
        totalReceivedTokens: 0,
        averageLatency: 0,
        requestsByDate: [],
        costByModel: {}
      };
      
      // Update the UI immediately with empty data
      setAnalyticsData(emptyData);
      setShowResetConfirm(false);
      
      // Emit reset event
      eventBus.emit(EVENT_TYPES.ANALYTICS_RESET);
      console.log('ANALYTICS: Emitted reset event');
      
      // Then make the API call in the background
      const response = await apiClient.post('/analytics/reset');
      
      // Update with the actual reset data from the server
      if (response.data && response.data.analytics) {
        setAnalyticsData(response.data.analytics);
        console.log('ANALYTICS: Reset successful, new data:', response.data.analytics);
      }
    } catch (err) {
      console.error('ANALYTICS: Error resetting analytics data:', err);
      setError('Failed to reset analytics data. Please try again later.');
    }
  };

  // Set up event listeners
  useEffect(() => {
    console.log('ANALYTICS: Setting up event listeners...');
    
    // Listen for analytics updates
    const unsubscribeUpdate = eventBus.on(EVENT_TYPES.ANALYTICS_UPDATE, (data) => {
      console.log('ANALYTICS: Received update event with data:', data);
      setAnalyticsData(data);
    });

    // Listen for analytics reset events
    const unsubscribeReset = eventBus.on(EVENT_TYPES.ANALYTICS_RESET, () => {
      console.log('ANALYTICS: Received reset event');
      fetchAnalyticsData();
    });

    // Listen for chat response events to automatically fetch updated data
    const unsubscribeChatResponse = eventBus.on(EVENT_TYPES.CHAT_RESPONSE_RETURNED, (data) => {
      console.log('ANALYTICS: Received chat response event:', data);
      // Add a small delay to ensure the server has processed the analytics
      setTimeout(() => {
        console.log('ANALYTICS: Auto-fetching data after chat response');
        fetchAnalyticsData();
      }, 500);
    });

    // Initial fetch
    fetchAnalyticsData();

    // Cleanup event listeners
    return () => {
      console.log('ANALYTICS: Cleaning up event listeners');
      unsubscribeUpdate();
      unsubscribeReset();
      unsubscribeChatResponse();
    };
  }, []);

  if (error) {
    return (
      <div className="analytics-container">
        <div className="error">{error}</div>
      </div>
    );
  }

  return (
    <div className="analytics-container">
      <div className="analytics-header">
        <h2>Model Performance Analytics</h2>
        <div className="header-buttons">
          <button 
            className="fetch-button"
            onClick={fetchAnalyticsData}
          >
            Fetch Data
          </button>
          <button 
            className="reset-button"
            onClick={() => setShowResetConfirm(true)}
          >
            Reset Data
          </button>
        </div>
      </div>

      {lastFetchTime && (
        <div className="last-fetch-time">
          Last updated: {new Date(lastFetchTime).toLocaleTimeString()}
        </div>
      )}

      {showResetConfirm && (
        <div className="reset-confirm-dialog">
          <div className="reset-confirm-content">
            <h3>Reset Analytics Data</h3>
            <p>Are you sure you want to reset all analytics data? This action cannot be undone.</p>
            <div className="reset-confirm-buttons">
              <button 
                className="cancel-button"
                onClick={() => setShowResetConfirm(false)}
              >
                Cancel
              </button>
              <button 
                className="confirm-button"
                onClick={handleReset}
              >
                Reset Data
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="analytics-content">
        <AnalyticsSummary data={analyticsData} />
        <AnalyticsTable requests={analyticsData.requestsByDate} />
      </div>
    </div>
  );
};

export default Analytics;
