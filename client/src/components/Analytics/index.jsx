/**
 * File: client/src/components/Analytics/index.jsx
 * Description: Main analytics component that serves as the container for analytics features
 */

// client/src/components/Analytics/index.jsx

import React, { useState, useEffect } from 'react';
import AnalyticsSummary from './AnalyticsSummary';
import AnalyticsTable from './AnalyticsTable';
import analyticsService from '../../utils/analyticsService';
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
      const newData = await analyticsService.fetchAnalyticsSummary();
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
      const response = await analyticsService.resetAnalytics();
      
      // Update with the actual reset data from the server
      if (response && response.analytics) {
        setAnalyticsData(response.analytics);
        console.log('ANALYTICS: Reset successful, new data:', response.analytics);
      }
    } catch (err) {
      console.error('ANALYTICS: Error resetting analytics data:', err);
      setError('Failed to reset analytics data. Please try again later.');
    }
  };

  // Set up event listeners
  useEffect(() => {
    console.log('ANALYTICS: Setting up event listeners...');
    
    // Listen for analytics fetch notification from API client
    const unsubscribeFetch = eventBus.on(EVENT_TYPES.ANALYTICS_FETCH, () => {
      console.log('ANALYTICS: Received fetch notification from API client');
      fetchAnalyticsData();
    });

    // Listen for analytics reset events
    const unsubscribeReset = eventBus.on(EVENT_TYPES.ANALYTICS_RESET, () => {
      console.log('ANALYTICS: Received reset event');
      fetchAnalyticsData();
    });

    // Initial fetch
    fetchAnalyticsData();

    // Cleanup event listeners
    return () => {
      console.log('ANALYTICS: Cleaning up event listeners');
      unsubscribeFetch();
      unsubscribeReset();
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
