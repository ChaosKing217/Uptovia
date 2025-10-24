const db = require('./src/services/database');

async function debugNotifications() {
    try {
        await db.initialize();

        console.log('\n=== PUSH NOTIFICATION DEBUG ===\n');

        // Check APNs settings
        console.log('1. APNs Configuration:');
        const apnsSettings = await db.query('SELECT * FROM apns_settings WHERE is_configured = true LIMIT 1');
        if (apnsSettings.rows.length > 0) {
            const settings = apnsSettings.rows[0];
            console.log('   ✅ APNs is configured');
            console.log(`   Bundle ID: ${settings.apns_bundle_id}`);
            console.log(`   Team ID: ${settings.apns_team_id}`);
            console.log(`   Key ID: ${settings.apns_key_id}`);
            console.log(`   Key Path: ${settings.apns_key_path}`);
        } else {
            console.log('   ❌ APNs is NOT configured');
        }

        // Check registered devices
        console.log('\n2. Registered Devices:');
        const devices = await db.query('SELECT * FROM devices ORDER BY created_at DESC');
        if (devices.rows.length > 0) {
            console.log(`   Found ${devices.rows.length} device(s):`);
            devices.rows.forEach(device => {
                console.log(`   - User ID: ${device.user_id}`);
                console.log(`     Token: ${device.device_token.substring(0, 20)}...`);
                console.log(`     Name: ${device.device_name}`);
                console.log(`     Created: ${device.created_at}`);
                console.log(`     Last Seen: ${device.last_seen}`);
            });
        } else {
            console.log('   ❌ No devices registered');
        }

        // Check monitors with notifications enabled
        console.log('\n3. Monitors with Notifications Enabled:');
        const monitors = await db.query(`
            SELECT id, name, user_id, current_status, active,
                   notify_on_down, notify_on_up,
                   status_change_notifications_enabled
            FROM monitors
            WHERE active = true
        `);

        if (monitors.rows.length > 0) {
            console.log(`   Found ${monitors.rows.length} active monitor(s):`);
            monitors.rows.forEach(monitor => {
                console.log(`\n   Monitor: ${monitor.name} (ID: ${monitor.id})`);
                console.log(`   User ID: ${monitor.user_id}`);
                console.log(`   Current Status: ${monitor.current_status}`);
                console.log(`   Status Change Notifications: ${monitor.status_change_notifications_enabled || 'NOT SET'}`);
                console.log(`   Notify on Down: ${monitor.notify_on_down}`);
                console.log(`   Notify on Up: ${monitor.notify_on_up}`);

                if (!monitor.notify_on_down && !monitor.notify_on_up) {
                    console.log('   ⚠️  WARNING: Both notify_on_down and notify_on_up are false!');
                }
            });
        } else {
            console.log('   No active monitors found');
        }

        console.log('\n=== END DEBUG ===\n');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

debugNotifications();
