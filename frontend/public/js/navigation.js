// ============================================
// NAVIGATION & VIEW MANAGEMENT MODULE
// ============================================

import { REFRESH_INTERVAL } from './config.js';
import { apiRequest } from './api.js';
import { getCurrentUser, setCurrentUser, getCurrentView, setCurrentView } from './state.js';
import { loadMonitors } from './monitors.js';
import { loadTags } from './tags.js';
import { loadSettings } from './settings.js';
import { loadDashboard } from './dashboard.js';

// ============================================
// SCREEN MANAGEMENT
// ============================================
export function showLoginScreen() {
    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('dashboardScreen').classList.remove('active');
}

export async function showDashboard() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('dashboardScreen').classList.add('active');

    const user = getCurrentUser();
    document.getElementById('sidebarUsername').textContent = user.username;

    // Set user role based on their primary group
    if (user.groups && user.groups.length > 0) {
        document.getElementById('sidebarUserRole').textContent = user.groups[0].name;
    }

    // Load data first to get updated user info
    await loadData();

    // Get updated user info after loading data
    const updatedUser = getCurrentUser();

    // Show dashboard for admins, monitors for regular users
    showView(updatedUser.is_admin ? 'dashboard' : 'monitors');

    // Auto-refresh every 30 seconds
    setInterval(() => {
        const currentView = getCurrentView();
        if (currentView === 'monitors') {
            loadMonitors();
        } else if (currentView === 'dashboard') {
            loadDashboard();
        }
    }, REFRESH_INTERVAL);
}

// ============================================
// VIEW MANAGEMENT
// ============================================
export function showView(viewName, e) {
    setCurrentView(viewName);

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Update active state - find the nav item for this view
    const navItem = document.querySelector(`.nav-item[onclick*="${viewName}"]`);
    if (navItem) {
        navItem.classList.add('active');
    }

    // Update views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${viewName}View`).classList.add('active');

    // Load data for the view
    if (viewName === 'dashboard') {
        loadDashboard();
    } else if (viewName === 'monitors') {
        loadMonitors();
    } else if (viewName === 'tags') {
        loadTags();
    } else if (viewName === 'settings') {
        loadSettings();
    }
}

export function goToHome() {
    const user = getCurrentUser();

    // For admins, go to dashboard; for regular users, go to monitors
    if (user && user.is_admin) {
        // Set dashboard nav item as active
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        const dashboardNav = document.getElementById('dashboardNavItem');
        if (dashboardNav) dashboardNav.classList.add('active');

        // Show dashboard view
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });
        document.getElementById('dashboardView').classList.add('active');

        // Refresh dashboard data
        setCurrentView('dashboard');
        loadDashboard();
    } else {
        // Set monitors nav item as active
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelectorAll('.nav-item')[0].classList.add('active');

        // Show monitors view
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });
        document.getElementById('monitorsView').classList.add('active');

        // Refresh monitors data
        setCurrentView('monitors');
        loadMonitors();
    }
}

// ============================================
// DATA LOADING
// ============================================
async function loadData() {
    // Load user info first to get groups
    try {
        const data = await apiRequest('/auth/me');
        const user = getCurrentUser();
        setCurrentUser({ ...user, ...data.user });
        localStorage.setItem('currentUser', JSON.stringify(getCurrentUser()));

        // Update sidebar role with group info
        const updatedUser = getCurrentUser();
        if (updatedUser.groups && updatedUser.groups.length > 0) {
            document.getElementById('sidebarUserRole').textContent = updatedUser.groups[0].name;
        }

        // Update dashboard nav visibility based on admin status
        const dashboardNavItem = document.getElementById('dashboardNavItem');
        if (dashboardNavItem) {
            dashboardNavItem.style.display = updatedUser.is_admin ? 'flex' : 'none';
        }
    } catch (error) {
        console.error('Failed to load user info:', error);
    }

    await Promise.all([loadMonitors(), loadTags()]);
}
