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
        const data = await apiRequest('/users/admin/stats');
        console.log('Dashboard data received:', data);

        // Update monitor statistics
        document.getElementById('statTotalMonitors').textContent = data.totalMonitors;
        document.getElementById('statActiveMonitors').textContent = data.activeMonitors;
        document.getElementById('statPausedMonitors').textContent = data.pausedMonitors;

        // Update user statistics
        document.getElementById('statTotalUsers').textContent = data.totalUsers;
        document.getElementById('statVerifiedUsers').textContent = data.verifiedUsers;
        document.getElementById('statUnverifiedUsers').textContent = data.unverifiedUsers;

        // Update tags statistics
        document.getElementById('statTotalTags').textContent = data.totalTags;

        // Update subscription statistics
        document.getElementById('statFreePlan').textContent = data.freePlan || 0;
        document.getElementById('statStarterPlan').textContent = data.starterPlan || 0;
        document.getElementById('statProPlan').textContent = data.proPlan || 0;

        // Render monitors by status
        renderMonitorStatus(data.monitorsByStatus);

        console.log('Dashboard loaded successfully');
    } catch (error) {
        console.error('Dashboard load error:', error);
        showToast('Load Failed', error.message, 'error');
    }
}

// ============================================
// RENDER MONITOR STATUS
// ============================================
function renderMonitorStatus(statuses) {
    const statusList = document.getElementById('monitorStatusList');

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
