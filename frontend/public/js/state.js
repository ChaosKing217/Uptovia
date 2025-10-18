// ============================================
// GLOBAL STATE MANAGEMENT
// ============================================

export let currentUser = null;
export let authToken = null;
export let monitors = [];
export let tags = [];
export let currentView = 'monitors';
export let deleteTarget = null;
export let apiKeyVisible = false;

// State setters
export function setCurrentUser(user) {
    currentUser = user;
}

export function setAuthToken(token) {
    authToken = token;
}

export function setMonitors(data) {
    monitors = data;
}

export function setTags(data) {
    tags = data;
}

export function setCurrentView(view) {
    currentView = view;
}

export function setDeleteTarget(target) {
    deleteTarget = target;
}

export function setApiKeyVisible(visible) {
    apiKeyVisible = visible;
}

// Getters
export function getCurrentUser() {
    return currentUser;
}

export function getAuthToken() {
    return authToken;
}

export function getMonitors() {
    return monitors;
}

export function getTags() {
    return tags;
}

export function getCurrentView() {
    return currentView;
}

export function getDeleteTarget() {
    return deleteTarget;
}

export function isApiKeyVisible() {
    return apiKeyVisible;
}
