const express = require('express');
const db = require('../services/database');
const { verifyAPIKey } = require('../middleware/auth');

const router = express.Router();

// All routes require API key authentication
router.use(verifyAPIKey);

// Register device for push notifications
router.post('/register', async (req, res) => {
    try {
        const { deviceToken, deviceName, deviceModel } = req.body;

        if (!deviceToken) {
            return res.status(400).json({ error: 'Device token is required' });
        }

        // Check if device already exists
        const existing = await db.query(
            'SELECT id FROM devices WHERE device_token = $1',
            [deviceToken]
        );

        if (existing.rows.length > 0) {
            // Update existing device
            await db.query(
                `UPDATE devices
                 SET user_id = $1, device_name = $2, device_model = $3, last_seen = CURRENT_TIMESTAMP
                 WHERE device_token = $4`,
                [req.userId, deviceName, deviceModel, deviceToken]
            );
        } else {
            // Register new device
            await db.query(
                `INSERT INTO devices (user_id, device_token, device_name, device_model)
                 VALUES ($1, $2, $3, $4)`,
                [req.userId, deviceToken, deviceName, deviceModel]
            );
        }

        res.json({ message: 'Device registered successfully' });
    } catch (error) {
        console.error('Device registration error:', error);
        res.status(500).json({ error: 'Failed to register device' });
    }
});

// Get all devices for user
router.get('/', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, device_token, device_name, device_model, created_at, last_seen
             FROM devices
             WHERE user_id = $1
             ORDER BY last_seen DESC`,
            [req.userId]
        );

        res.json({ devices: result.rows });
    } catch (error) {
        console.error('Get devices error:', error);
        res.status(500).json({ error: 'Failed to get devices' });
    }
});

// Unregister device
router.delete('/:deviceToken', async (req, res) => {
    try {
        const result = await db.query(
            'DELETE FROM devices WHERE device_token = $1 AND user_id = $2 RETURNING id',
            [req.params.deviceToken, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        res.json({ message: 'Device unregistered successfully' });
    } catch (error) {
        console.error('Device unregister error:', error);
        res.status(500).json({ error: 'Failed to unregister device' });
    }
});

module.exports = router;
