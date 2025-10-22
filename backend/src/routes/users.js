const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../services/database');
const { verifyAPIKey, verifyToken } = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

// Support both API key and JWT authentication
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const token = req.headers.authorization;

    if (apiKey) {
        return verifyAPIKey(req, res, next);
    } else if (token) {
        return verifyToken(req, res, next);
    } else {
        return res.status(401).json({ error: 'Authentication required' });
    }
};

router.use(authenticate);

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

// Get all users (admin endpoint)
router.get('/admin/all', requireAdmin, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT u.id, u.username, u.email, u.is_admin, u.admin_created, u.email_verified,
                    u.email_verification_token, u.email_verification_expires, u.created_at,
                    ug.group_id,
                    g.name as group_name
             FROM users u
             LEFT JOIN user_groups ug ON u.id = ug.user_id AND ug.group_id = 2
             LEFT JOIN groups g ON ug.group_id = g.id
             ORDER BY u.created_at DESC`
        );

        res.json({ users: result.rows });
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Get admin statistics
router.get('/admin/stats', requireAdmin, async (req, res) => {
    try {
        // Get total monitors count
        const monitorsResult = await db.query('SELECT COUNT(*) as count FROM monitors');
        const totalMonitors = parseInt(monitorsResult.rows[0].count) || 0;

        // Get active monitors count
        const activeMonitorsResult = await db.query('SELECT COUNT(*) as count FROM monitors WHERE active = true');
        const activeMonitors = parseInt(activeMonitorsResult.rows[0].count) || 0;

        // Get paused monitors count
        const pausedMonitorsResult = await db.query('SELECT COUNT(*) as count FROM monitors WHERE active = false');
        const pausedMonitors = parseInt(pausedMonitorsResult.rows[0].count) || 0;

        // Get total tags count
        const tagsResult = await db.query('SELECT COUNT(*) as count FROM tags');
        const totalTags = parseInt(tagsResult.rows[0].count) || 0;

        // Get total users count
        const usersResult = await db.query('SELECT COUNT(*) as count FROM users');
        const totalUsers = parseInt(usersResult.rows[0].count) || 0;

        // Get verified users count
        const verifiedUsersResult = await db.query('SELECT COUNT(*) as count FROM users WHERE email_verified = true');
        const verifiedUsers = parseInt(verifiedUsersResult.rows[0].count) || 0;

        // Get unverified users count
        const unverifiedUsersResult = await db.query('SELECT COUNT(*) as count FROM users WHERE email_verified = false OR email_verified IS NULL');
        const unverifiedUsers = parseInt(unverifiedUsersResult.rows[0].count) || 0;

        // Get monitors by status
        const statusResult = await db.query(`
            SELECT current_status, COUNT(*) as count
            FROM monitors
            WHERE current_status IS NOT NULL
            GROUP BY current_status
        `);

        // Get groups with user counts
        const groupsResult = await db.query(`
            SELECT g.id, g.name, COUNT(DISTINCT ug.user_id) as user_count
            FROM groups g
            LEFT JOIN user_groups ug ON g.id = ug.group_id
            GROUP BY g.id, g.name
            ORDER BY g.id
        `);

        res.json({
            totalMonitors,
            activeMonitors,
            pausedMonitors,
            totalTags,
            totalUsers,
            verifiedUsers,
            unverifiedUsers,
            groupsStats: groupsResult.rows || [],
            monitorsByStatus: statusResult.rows || []
        });
    } catch (error) {
        console.error('Get admin stats error:', error);
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to get statistics', details: error.message });
    }
});

// Get single user (admin endpoint)
router.get('/admin/:id', requireAdmin, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT u.id, u.username, u.email, u.is_admin, u.email_verified, u.force_password_reset, u.force_username_change, u.created_at
             FROM users u
             WHERE u.id = $1`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: result.rows[0] });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

// Create user (admin endpoint)
router.post('/admin/create', requireAdmin, async (req, res) => {
    try {
        const { username, email } = req.body;

        if (!username || !email) {
            return res.status(400).json({ error: 'Username and email are required' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Check if username exists
        const existingUser = await db.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        // Check if email exists
        const existingEmail = await db.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existingEmail.rows.length > 0) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        // Generate account setup token
        const setupToken = crypto.randomBytes(32).toString('hex');
        const setupExpires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

        // Generate temporary placeholder values (will be replaced during setup)
        const tempPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
        const tempApiKey = crypto.randomBytes(32).toString('hex');

        // Create user with temporary password (will be set during setup)
        const result = await db.query(
            `INSERT INTO users (username, email, password_hash, api_key, email_verification_token, email_verification_expires, admin_created)
             VALUES ($1, $2, $3, $4, $5, $6, true)
             RETURNING id, username, email, created_at`,
            [username, email, tempPasswordHash, tempApiKey, setupToken, setupExpires]
        );

        const user = result.rows[0];

        // Assign user to Member group (id: 2) by default
        const role = 'member';

        try {
            await db.query(
                'INSERT INTO user_groups (user_id, group_id, role) VALUES ($1, 2, $2)',
                [user.id, role]
            );
        } catch (error) {
            console.error('Failed to assign user to Member group:', error);
            // Don't fail user creation if group assignment fails
        }

        // Send account setup invitation email
        try {
            await emailService.sendAccountSetupEmail(email, username, setupToken);
        } catch (emailError) {
            console.error('Failed to send account setup email:', emailError);
            // Don't fail user creation if email fails
        }

        res.status(201).json({ user });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Update user (admin endpoint)
router.put('/admin/:id', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { username, email, password, isAdmin, forcePasswordReset } = req.body;

        // Build dynamic update query
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (username !== undefined) {
            // Check if username exists for another user
            const existingUser = await db.query(
                'SELECT id FROM users WHERE username = $1 AND id != $2',
                [username, userId]
            );

            if (existingUser.rows.length > 0) {
                return res.status(400).json({ error: 'Username already exists' });
            }

            updates.push(`username = $${paramCount}`);
            values.push(username);
            paramCount++;
        }

        if (email !== undefined) {
            // Check if email exists for another user
            const existingEmail = await db.query(
                'SELECT id FROM users WHERE email = $1 AND id != $2',
                [email, userId]
            );

            if (existingEmail.rows.length > 0) {
                return res.status(400).json({ error: 'Email already exists' });
            }

            updates.push(`email = $${paramCount}`);
            values.push(email);
            paramCount++;
        }

        if (password) {
            // Validate password strength
            if (password.length < 8) {
                return res.status(400).json({ error: 'Password must be at least 8 characters' });
            }

            if (!/[A-Z]/.test(password)) {
                return res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
            }

            if (!/[\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
                return res.status(400).json({ error: 'Password must contain at least one number or symbol' });
            }

            const passwordHash = await bcrypt.hash(password, 10);
            updates.push(`password_hash = $${paramCount}`);
            values.push(passwordHash);
            paramCount++;
        }

        if (isAdmin !== undefined) {
            updates.push(`is_admin = $${paramCount}`);
            values.push(isAdmin);
            paramCount++;

            // Update user's group assignment based on admin status
            const newGroupId = isAdmin ? 1 : 2;
            const newRole = isAdmin ? 'owner' : 'member';

            try {
                // Remove from all groups
                await db.query('DELETE FROM user_groups WHERE user_id = $1', [userId]);
                // Add to appropriate group
                await db.query(
                    'INSERT INTO user_groups (user_id, group_id, role) VALUES ($1, $2, $3)',
                    [userId, newGroupId, newRole]
                );
            } catch (error) {
                console.error('Failed to update user group:', error);
            }
        }

        if (forcePasswordReset !== undefined) {
            updates.push(`force_password_reset = $${paramCount}`);
            values.push(forcePasswordReset);
            paramCount++;
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(userId);

        const result = await db.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, username, email, is_admin, created_at`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: result.rows[0] });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Delete user (admin endpoint)
router.delete('/admin/:id', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        // Prevent admin from deleting themselves
        if (userId === req.userId) {
            return res.status(403).json({ error: 'You cannot delete your own account' });
        }

        const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING username', [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Resend verification email for a specific user
router.post('/admin/:id/resend-verification', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        const result = await db.query(
            'SELECT id, username, email, email_verified FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];

        if (user.email_verified) {
            return res.status(400).json({ error: 'User email is already verified' });
        }

        if (!user.email) {
            return res.status(400).json({ error: 'User has no email address' });
        }

        // Generate new verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await db.query(
            'UPDATE users SET email_verification_token = $1, email_verification_expires = $2 WHERE id = $3',
            [verificationToken, verificationExpires, userId]
        );

        // Send verification email
        await emailService.sendVerificationEmail(user.email, user.username, verificationToken);

        res.json({ message: 'Verification email sent successfully' });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ error: 'Failed to resend verification email' });
    }
});

// Resend setup email for a specific user
router.post('/admin/:id/resend-setup', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        const result = await db.query(
            'SELECT id, username, email, email_verified, email_verification_token FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];

        if (user.email_verified) {
            return res.status(400).json({ error: 'User has already completed setup' });
        }

        if (!user.email) {
            return res.status(400).json({ error: 'User has no email address' });
        }

        if (!user.email_verification_token) {
            return res.status(400).json({ error: 'User was not invited via email' });
        }

        // Generate new setup token
        const setupToken = crypto.randomBytes(32).toString('hex');
        const setupExpires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

        await db.query(
            'UPDATE users SET email_verification_token = $1, email_verification_expires = $2 WHERE id = $3',
            [setupToken, setupExpires, userId]
        );

        // Send setup email
        await emailService.sendAccountSetupEmail(user.email, user.username, setupToken);

        res.json({ message: 'Setup email sent successfully' });
    } catch (error) {
        console.error('Resend setup error:', error);
        res.status(500).json({ error: 'Failed to resend setup email' });
    }
});

// Bulk resend verification emails
router.post('/admin/bulk-resend-verification', requireAdmin, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT id, username, email FROM users WHERE email_verified = false AND email IS NOT NULL AND (email_verification_token IS NULL OR email_verification_token = \'\')'
        );

        const users = result.rows;

        if (users.length === 0) {
            return res.json({ message: 'No unverified users found', count: 0 });
        }

        let successCount = 0;

        for (const user of users) {
            try {
                // Generate new verification token
                const verificationToken = crypto.randomBytes(32).toString('hex');
                const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

                await db.query(
                    'UPDATE users SET email_verification_token = $1, email_verification_expires = $2 WHERE id = $3',
                    [verificationToken, verificationExpires, user.id]
                );

                await emailService.sendVerificationEmail(user.email, user.username, verificationToken);
                successCount++;
            } catch (error) {
                console.error(`Failed to send verification to ${user.email}:`, error);
            }
        }

        res.json({ message: `Verification emails sent to ${successCount} user(s)`, count: successCount });
    } catch (error) {
        console.error('Bulk resend verification error:', error);
        res.status(500).json({ error: 'Failed to resend verification emails' });
    }
});

// Bulk resend setup emails
router.post('/admin/bulk-resend-setup', requireAdmin, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT id, username, email, email_verification_token FROM users WHERE email_verified = false AND email IS NOT NULL AND email_verification_token IS NOT NULL AND email_verification_token != \'\''
        );

        const users = result.rows;

        if (users.length === 0) {
            return res.json({ message: 'No invited users found', count: 0 });
        }

        let successCount = 0;

        for (const user of users) {
            try {
                // Generate new setup token
                const setupToken = crypto.randomBytes(32).toString('hex');
                const setupExpires = new Date(Date.now() + 48 * 60 * 60 * 1000);

                await db.query(
                    'UPDATE users SET email_verification_token = $1, email_verification_expires = $2 WHERE id = $3',
                    [setupToken, setupExpires, user.id]
                );

                await emailService.sendAccountSetupEmail(user.email, user.username, setupToken);
                successCount++;
            } catch (error) {
                console.error(`Failed to send setup email to ${user.email}:`, error);
            }
        }

        res.json({ message: `Setup emails sent to ${successCount} user(s)`, count: successCount });
    } catch (error) {
        console.error('Bulk resend setup error:', error);
        res.status(500).json({ error: 'Failed to resend setup emails' });
    }
});

module.exports = router;
