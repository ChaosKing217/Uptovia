const apn = require('apn');
const db = require('./database');

class PushNotificationService {
    constructor() {
        this.provider = null;
        this.isConfigured = false;
    }

    initialize() {
        try {
            // Check if APNs certificates exist
            const options = {
                token: {
                    key: process.env.APNS_KEY_PATH || '/app/certs/AuthKey.p8',
                    keyId: process.env.APNS_KEY_ID,
                    teamId: process.env.APNS_TEAM_ID
                },
                production: process.env.NODE_ENV === 'production'
            };

            // Only initialize if credentials are provided
            if (options.token.keyId && options.token.teamId) {
                this.provider = new apn.Provider(options);
                this.isConfigured = true;
                console.log('✅ Push notification service initialized');
            } else {
                console.log('⚠️  APNs credentials not configured - push notifications disabled');
            }
        } catch (error) {
            console.error('Failed to initialize APNs provider:', error);
            this.isConfigured = false;
        }
    }

    async sendMonitorAlert(monitor, status) {
        if (!this.isConfigured) {
            console.log('⚠️  Push notifications not configured, skipping notification');
            return;
        }

        try {
            // Get all devices for this user
            const result = await db.query(
                'SELECT device_token FROM devices WHERE user_id = $1',
                [monitor.user_id]
            );

            if (result.rows.length === 0) {
                console.log(`No devices registered for user ${monitor.user_id}`);
                return;
            }

            const notification = new apn.Notification();

            // Configure notification
            notification.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires in 1 hour
            notification.badge = 1;
            notification.sound = 'default';
            notification.topic = process.env.APNS_BUNDLE_ID || 'com.yourcompany.uptime';
            notification.priority = 10;

            // Set title and body based on status
            if (status === 'down') {
                notification.title = '🔴 Monitor Down';
                notification.body = `${monitor.name} is not responding`;
                notification.category = 'MONITOR_DOWN';
            } else {
                notification.title = '🟢 Monitor Up';
                notification.body = `${monitor.name} is back online`;
                notification.category = 'MONITOR_UP';
            }

            // Add custom data
            notification.payload = {
                monitorId: monitor.id,
                monitorName: monitor.name,
                status: status,
                timestamp: new Date().toISOString()
            };

            // Send to all devices
            const devices = result.rows.map(row => row.device_token);

            for (const deviceToken of devices) {
                try {
                    const response = await this.provider.send(notification, deviceToken);

                    if (response.failed && response.failed.length > 0) {
                        console.error(`Failed to send notification to ${deviceToken}:`, response.failed);

                        // Remove invalid device tokens
                        for (const failure of response.failed) {
                            if (failure.status === '410') {
                                await this.removeInvalidDevice(deviceToken);
                            }
                        }
                    } else {
                        console.log(`✅ Notification sent to device ${deviceToken.substring(0, 8)}...`);
                    }
                } catch (error) {
                    console.error(`Error sending notification to ${deviceToken}:`, error);
                }
            }

            console.log(`📱 Sent ${status} notification for monitor "${monitor.name}" to ${devices.length} device(s)`);
        } catch (error) {
            console.error('Error sending monitor alert:', error);
        }
    }

    async sendTestNotification(userId, deviceToken) {
        if (!this.isConfigured) {
            throw new Error('Push notifications not configured');
        }

        try {
            const notification = new apn.Notification();
            notification.expiry = Math.floor(Date.now() / 1000) + 3600;
            notification.badge = 1;
            notification.sound = 'default';
            notification.topic = process.env.APNS_BUNDLE_ID || 'com.yourcompany.uptime';
            notification.title = '✅ Test Notification';
            notification.body = 'Push notifications are working correctly!';
            notification.payload = { test: true };

            const response = await this.provider.send(notification, deviceToken);

            if (response.failed && response.failed.length > 0) {
                throw new Error(`Failed to send test notification: ${JSON.stringify(response.failed)}`);
            }

            return { success: true, message: 'Test notification sent successfully' };
        } catch (error) {
            console.error('Error sending test notification:', error);
            throw error;
        }
    }

    async removeInvalidDevice(deviceToken) {
        try {
            await db.query(
                'DELETE FROM devices WHERE device_token = $1',
                [deviceToken]
            );
            console.log(`Removed invalid device token: ${deviceToken.substring(0, 8)}...`);
        } catch (error) {
            console.error('Error removing invalid device:', error);
        }
    }

    shutdown() {
        if (this.provider) {
            this.provider.shutdown();
            console.log('Push notification service shut down');
        }
    }
}

module.exports = new PushNotificationService();
