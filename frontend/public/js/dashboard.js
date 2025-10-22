// ============================================
// ADMIN DASHBOARD MODULE
// ============================================

import { apiRequest } from './api.js';
import { showToast } from './ui.js';

// ============================================
// DASHBOARD LOADING
// ============================================
export async function loadDashboard() {
    try {
        console.log('Loading dashboard...');

        // Check if dashboard view is visible
        const dashboardView = document.getElementById('dashboardView');
        if (!dashboardView || !dashboardView.classList.contains('active')) {
            console.warn('Dashboard view is not active, skipping load');
            return;
        }

        const data = await apiRequest('/users/admin/stats');
        console.log('Dashboard data received:', data);

        if (!data) {
            console.error('No data received from API');
            showToast('Load Failed', 'No data received from server', 'error');
            return;
        }

        // Update monitor statistics
        const statTotalMonitors = document.getElementById('statTotalMonitors');
        const statActiveMonitors = document.getElementById('statActiveMonitors');
        const statPausedMonitors = document.getElementById('statPausedMonitors');

        if (statTotalMonitors) {
            statTotalMonitors.textContent = data.totalMonitors || 0;
        } else {
            console.error('statTotalMonitors element not found - dashboard may not be rendered');
            return;
        }

        if (statActiveMonitors) {
            statActiveMonitors.textContent = data.activeMonitors || 0;
        } else {
            console.warn('statActiveMonitors element not found');
        }

        if (statPausedMonitors) {
            statPausedMonitors.textContent = data.pausedMonitors || 0;
        } else {
            console.warn('statPausedMonitors element not found');
        }

        // Update user statistics
        const statTotalUsers = document.getElementById('statTotalUsers');
        const statVerifiedUsers = document.getElementById('statVerifiedUsers');
        const statUnverifiedUsers = document.getElementById('statUnverifiedUsers');

        if (statTotalUsers) {
            statTotalUsers.textContent = data.totalUsers || 0;
        } else {
            console.warn('statTotalUsers element not found');
        }

        if (statVerifiedUsers) {
            statVerifiedUsers.textContent = data.verifiedUsers || 0;
        } else {
            console.warn('statVerifiedUsers element not found');
        }

        if (statUnverifiedUsers) {
            statUnverifiedUsers.textContent = data.unverifiedUsers || 0;
        } else {
            console.warn('statUnverifiedUsers element not found');
        }

        // Update tags statistics
        const statTotalTags = document.getElementById('statTotalTags');
        if (statTotalTags) {
            statTotalTags.textContent = data.totalTags || 0;
        } else {
            console.warn('statTotalTags element not found');
        }

        // Render groups with user counts
        console.log('Groups stats data:', data.groupsStats);
        renderGroupsStats(data.groupsStats);

        // Render monitors by status
        console.log('Monitor status data:', data.monitorsByStatus);
        renderMonitorStatus(data.monitorsByStatus);

        console.log('Dashboard loaded successfully');
    } catch (error) {
        console.error('Dashboard load error:', error);
        console.error('Error stack:', error.stack);
        showToast('Load Failed', error.message || 'Unknown error occurred', 'error');
    }
}

// ============================================
// RENDER GROUPS STATS
// ============================================
function renderGroupsStats(groups) {
    const groupsList = document.getElementById('groupsStatsList');

    if (!groupsList) {
        console.error('groupsStatsList element not found');
        return;
    }

    if (!groups || groups.length === 0) {
        groupsList.innerHTML = '<div style="text-align: center; padding: var(--space-4); color: var(--text-secondary);">No groups found</div>';
        return;
    }

    groupsList.innerHTML = groups.map(group => {
        const count = parseInt(group.user_count || 0);
        return `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: var(--text-secondary);">${escapeHtml(group.name)}</span>
                <span style="font-size: var(--text-xl); font-weight: 700;">${count}</span>
            </div>
        `;
    }).join('');
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// RENDER MONITOR STATUS
// ============================================
function renderMonitorStatus(statuses) {
    const statusList = document.getElementById('monitorStatusList');

    if (!statusList) {
        console.error('monitorStatusList element not found');
        return;
    }

    if (!statuses || statuses.length === 0) {
        statusList.innerHTML = '<div style="text-align: center; padding: var(--space-4); color: var(--text-secondary);">No monitors found</div>';
        return;
    }

    // Status display configuration
    const statusConfig = {
        'up': { label: 'Up', icon: '✅', color: '#34C759' },
        'down': { label: 'Down', icon: '❌', color: '#FF3B30' },
        'pending': { label: 'Pending', icon: '⏳', color: '#FF9500' },
        'maintenance': { label: 'Maintenance', icon: '🔧', color: '#007AFF' }
    };

    statusList.innerHTML = statuses.map(status => {
        const config = statusConfig[status.current_status] || { label: status.current_status, icon: '❓', color: '#8E8E93' };
        const count = parseInt(status.count);

        return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-3); background: var(--surface, #f5f5f7); border-radius: var(--radius-md); border: 1px solid var(--border);">
                <div style="display: flex; align-items: center; gap: var(--space-3);">
                    <div style="font-size: 24px;">${config.icon}</div>
                    <div>
                        <div style="font-weight: 600; color: var(--text-primary);">${config.label}</div>
                        <div style="font-size: var(--text-sm); color: var(--text-secondary);">${count} monitor${count !== 1 ? 's' : ''}</div>
                    </div>
                </div>
                <div style="font-size: var(--text-2xl); font-weight: 700; color: ${config.color};">${count}</div>
            </div>
        `;
    }).join('');
}
