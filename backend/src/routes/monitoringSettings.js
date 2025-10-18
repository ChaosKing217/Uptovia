const express = require('express');
const db = require('../services/database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.use(verifyToken);

// Get monitoring settings for current user
router.get('/', async (req, res) => {
    try {
        // Check if table exists and create it if it doesn't
        await db.query(`
            CREATE TABLE IF NOT EXISTS monitoring_settings (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                default_check_interval INTEGER DEFAULT 60,
                default_timeout INTEGER DEFAULT 30,
                retention_period INTEGER DEFAULT 30,
                notify_on_down BOOLEAN DEFAULT true,
                notify_on_up BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id)
            )
        `);

        const result = await db.query(
            'SELECT * FROM monitoring_settings WHERE user_id = $1',
            [req.userId]
        );

        if (result.rows.length === 0) {
            // Create default settings for user
            const defaultResult = await db.query(
                `INSERT INTO monitoring_settings (user_id)
                 VALUES ($1)
                 RETURNING *`,
                [req.userId]
            );
            return res.json({ settings: defaultResult.rows[0] });
        }

        res.json({ settings: result.rows[0] });
    } catch (error) {
        console.error('Get monitoring settings error:', error);
        res.status(500).json({ error: error.message || 'Failed to get monitoring settings' });
    }
});

// Update monitoring settings for current user
router.put('/', async (req, res) => {
    try {
        const {
            default_check_interval,
            default_timeout,
            retention_period,
            notify_on_down,
            notify_on_up
        } = req.body;

        // Check if settings exist, create if not
        const existingSettings = await db.query(
            'SELECT id FROM monitoring_settings WHERE user_id = $1',
            [req.userId]
        );

        if (existingSettings.rows.length === 0) {
            // Create new settings
            const result = await db.query(
                `INSERT INTO monitoring_settings
                 (user_id, default_check_interval, default_timeout, retention_period, notify_on_down, notify_on_up)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [req.userId, default_check_interval, default_timeout, retention_period, notify_on_down, notify_on_up]
            );
            return res.json({ settings: result.rows[0], message: 'Monitoring settings created successfully' });
        }

        // Update existing settings
        const result = await db.query(
            `UPDATE monitoring_settings
             SET default_check_interval = $1,
                 default_timeout = $2,
                 retention_period = $3,
                 notify_on_down = $4,
                 notify_on_up = $5,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $6
             RETURNING *`,
            [default_check_interval, default_timeout, retention_period, notify_on_down, notify_on_up, req.userId]
        );

        res.json({ settings: result.rows[0], message: 'Monitoring settings updated successfully' });
    } catch (error) {
        console.error('Update monitoring settings error:', error);
        res.status(500).json({ error: error.message || 'Failed to update monitoring settings' });
    }
});

module.exports = router;
