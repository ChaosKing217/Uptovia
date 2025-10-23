const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./services/database');
const monitoringService = require('./services/monitoring');
const emailService = require('./services/emailService');
const authRoutes = require('./routes/auth');
const monitorRoutes = require('./routes/monitors');
const deviceRoutes = require('./routes/devices');
const groupRoutes = require('./routes/groups');
const userRoutes = require('./routes/users');
const tagRoutes = require('./routes/tags');
const emailSettingsRoutes = require('./routes/emailSettings');
const monitoringSettingsRoutes = require('./routes/monitoringSettings');
const apnsSettingsRoutes = require('./routes/apnsSettings');
const settingsRoutes = require('./routes/settings');
const pushNotifications = require('./services/pushNotifications');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (web dashboard) from frontend directory
// In Docker: /app/frontend/public (mounted volume)
// In development: ../../frontend/public (relative path)
const frontendPath = process.env.FRONTEND_PATH || path.join(__dirname, '../../frontend/public');
app.use(express.static(frontendPath));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/monitors', monitorRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/email-settings', emailSettingsRoutes);
app.use('/api/monitoring-settings', monitoringSettingsRoutes);
app.use('/api/apns-settings', apnsSettingsRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Serve web dashboard for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error'
    });
});

// Start server
app.listen(PORT, async () => {
    console.log(`🚀 Uptovia Backend Server running on port ${PORT}`);
    console.log(`📊 Web Dashboard: http://localhost:${PORT}`);
    console.log(`🔌 API Endpoint: http://localhost:${PORT}/api`);

    // Initialize database
    try {
        await db.initialize();
        console.log('✅ Database initialized');

        // Initialize email service
        emailService.initialize();

        // Initialize push notifications
        pushNotifications.initialize();

        // Start monitoring service
        monitoringService.start();
        console.log('✅ Monitoring service started');
    } catch (error) {
        console.error('❌ Failed to initialize:', error);
        process.exit(1);
    }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    monitoringService.stop();
    pushNotifications.shutdown();
    await db.close();
    process.exit(0);
});
