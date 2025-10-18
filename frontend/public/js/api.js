// ============================================
// API REQUEST HELPER
// ============================================

import { API_BASE } from './config.js';
import { getAuthToken } from './state.js';

/**
 * Makes an authenticated API request
 * @param {string} endpoint - API endpoint path (e.g., '/monitors')
 * @param {object} options - Fetch options (method, body, headers, etc.)
 * @returns {Promise<object>} - Response data
 */
export async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`,
            ...options.headers
        }
    });

    if (response.status === 401) {
        // Session expired - import logout dynamically to avoid circular dependency
        const { logout } = await import('./auth.js');
        logout();
        throw new Error('Session expired');
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }

    return data;
}
