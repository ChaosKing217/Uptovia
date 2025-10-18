const express = require('express');
const db = require('../services/database');
const { verifyToken } = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

// Middleware to check if user is admin
const requireAdmin = async (req, res, next) => {
    try {
        const result = await db.query(
            'SELECT is_admin FROM users WHERE id = $1',
            [req.userId]
        );

        if (result.rows.length === 0 || !result.rows[0].is_admin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        next();
    } catch (error) {
        console.error('Admin check error:', error);
        res.status(500).json({ error: 'Authorization check failed' });
    }
};

router.use(verifyToken);
router.use(requireAdmin);

// Get email settings
router.get('/', async (req, res) => {
    try {
        // Check if table exists and create it if it doesn't
        await db.query(`
            CREATE TABLE IF NOT EXISTS email_settings (
                id SERIAL PRIMARY KEY,
                smtp_host VARCHAR(255),
                smtp_port INTEGER DEFAULT 587,
                smtp_secure BOOLEAN DEFAULT false,
                smtp_user VARCHAR(255),
                smtp_password TEXT,
                smtp_from VARCHAR(255) DEFAULT 'Uptime Monitor <noreply@monitor.local>',
                is_configured BOOLEAN DEFAULT false,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_by INTEGER REFERENCES users(id)
            )
        `);

        const result = await db.query('SELECT * FROM email_settings ORDER BY id LIMIT 1');

        if (result.rows.length === 0) {
            // Create default settings
            const defaultResult = await db.query(
                'INSERT INTO email_settings (is_configured) VALUES (false) RETURNING *'
            );
            const settings = defaultResult.rows[0];
            // Don't send password to frontend
            delete settings.smtp_password;
            return res.json({ settings });
        }

        const settings = result.rows[0];
        // Don't send password to frontend
        delete settings.smtp_password;
        res.json({ settings });
    } catch (error) {
        console.error('Get email settings error:', error);
        res.status(500).json({ error: error.message || 'Failed to get email settings' });
    }
});

// Update email settings
router.put('/', async (req, res) => {
    try {
        const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, smtp_from } = req.body;

        // Check if settings exist, create if not
        const existingSettings = await db.query('SELECT smtp_password FROM email_settings LIMIT 1');
        if (existingSettings.rows.length === 0) {
            await db.query('INSERT INTO email_settings (is_configured) VALUES (false)');
        }

        const hasExistingPassword = existingSettings.rows.length > 0 && existingSettings.rows[0].smtp_password;

        // Mark as configured if all required fields are present
        const isConfigured = !!(smtp_host && smtp_user && (smtp_password || hasExistingPassword));

        const queryParams = [smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password || '', smtp_from, isConfigured, req.userId];

        // Simple direct update with all fields
        const result = await db.query(
            `UPDATE email_settings
             SET smtp_host = $1,
                 smtp_port = $2,
                 smtp_secure = $3,
                 smtp_user = $4,
                 smtp_password = COALESCE(NULLIF($5, ''), smtp_password),
                 smtp_from = $6,
                 is_configured = $7,
                 updated_at = CURRENT_TIMESTAMP,
                 updated_by = $8
             WHERE id = (SELECT id FROM email_settings ORDER BY id LIMIT 1)
             RETURNING *`,
            queryParams
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Email settings not found' });
        }

        // Reinitialize email service with new settings (before deleting password)
        emailService.reinitialize(result.rows[0]);

        const settings = { ...result.rows[0] };
        delete settings.smtp_password;
        res.json({ settings, message: 'Email settings updated successfully' });
    } catch (error) {
        console.error('Update email settings error:', error);
        console.error('Error details:', error.stack);
        res.status(500).json({ error: error.message || 'Failed to update email settings' });
    }
});

// Send test email
router.post('/test', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email address is required' });
        }

        await emailService.sendTestEmail(email);
        res.json({ message: 'Test email sent successfully' });
    } catch (error) {
        console.error('Send test email error:', error);
        res.status(500).json({ error: error.message || 'Failed to send test email' });
    }
});

module.exports = router;
