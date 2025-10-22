-- Database Schema for Uptime Monitor Backend

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    api_key VARCHAR(255) UNIQUE NOT NULL,
    is_admin BOOLEAN DEFAULT false,
    admin_created BOOLEAN DEFAULT false,
    force_password_reset BOOLEAN DEFAULT false,
    force_username_change BOOLEAN DEFAULT false,
    reset_token VARCHAR(255),
    reset_token_expiry TIMESTAMP,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verification_token VARCHAR(255),
    email_verification_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Groups table
CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User group membership
CREATE TABLE IF NOT EXISTS user_groups (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member', -- owner, admin, member, viewer
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, group_id)
);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(7) DEFAULT '#3B82F6', -- hex color
    symbol VARCHAR(100) DEFAULT 'tag.fill', -- SF Symbol name for iOS
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tags_owner_check CHECK ((user_id IS NOT NULL) OR (group_id IS NOT NULL))
);

-- Devices table (for push notifications)
CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    device_token VARCHAR(255) UNIQUE NOT NULL,
    device_name VARCHAR(255),
    device_model VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Monitors table
CREATE TABLE IF NOT EXISTS monitors (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- http, https, ping, tcp, dns
    url TEXT,
    hostname VARCHAR(255),
    port INTEGER,
    method VARCHAR(10) DEFAULT 'GET',
    accepted_status_codes TEXT DEFAULT '200-299',
    check_interval INTEGER DEFAULT 60, -- seconds
    retry_interval INTEGER DEFAULT 60,
    max_retries INTEGER DEFAULT 3,
    timeout INTEGER DEFAULT 30,
    active BOOLEAN DEFAULT true,

    -- Notifications
    notify_on_down BOOLEAN DEFAULT true,
    notify_on_up BOOLEAN DEFAULT true,

    -- DNS settings
    dns_resolver VARCHAR(255),
    dns_record_type VARCHAR(10),

    -- Authentication
    auth_method VARCHAR(50),
    auth_username VARCHAR(255),
    auth_password VARCHAR(255),

    -- Current status
    current_status VARCHAR(20) DEFAULT 'pending', -- up, down, pending, maintenance
    last_check TIMESTAMP,
    last_up_time TIMESTAMP,
    last_down_time TIMESTAMP,
    uptime_percentage DECIMAL(5,2) DEFAULT 0.00,
    avg_response_time INTEGER, -- milliseconds

    -- SSL Certificate
    ssl_cert_expiry TIMESTAMP,
    ssl_cert_days_remaining INTEGER,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT monitors_owner_check CHECK ((user_id IS NOT NULL) OR (group_id IS NOT NULL))
);

-- Monitor tags relationship
CREATE TABLE IF NOT EXISTS monitor_tags (
    id SERIAL PRIMARY KEY,
    monitor_id INTEGER REFERENCES monitors(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(monitor_id, tag_id)
);

-- Check history table
CREATE TABLE IF NOT EXISTS check_history (
    id SERIAL PRIMARY KEY,
    monitor_id INTEGER REFERENCES monitors(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL, -- up, down
    response_time INTEGER, -- milliseconds
    status_code INTEGER,
    error_message TEXT,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email settings table
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
);

-- Monitoring settings table (per-user preferences)
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
);

-- Apple Push Notification Service (APNs) settings table
CREATE TABLE IF NOT EXISTS apns_settings (
    id SERIAL PRIMARY KEY,
    apns_key_path VARCHAR(500),
    apns_key_id VARCHAR(100),
    apns_team_id VARCHAR(100),
    apns_bundle_id VARCHAR(200),
    is_configured BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id)
);

-- Cloudflare Turnstile settings table
CREATE TABLE IF NOT EXISTS turnstile_settings (
    id SERIAL PRIMARY KEY,
    site_key VARCHAR(500),
    secret_key VARCHAR(500),
    is_enabled BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_monitors_user_id ON monitors(user_id);
CREATE INDEX IF NOT EXISTS idx_monitors_group_id ON monitors(group_id);
CREATE INDEX IF NOT EXISTS idx_monitors_active ON monitors(active);
CREATE INDEX IF NOT EXISTS idx_check_history_monitor_id ON check_history(monitor_id);
CREATE INDEX IF NOT EXISTS idx_check_history_checked_at ON check_history(checked_at);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_groups_user_id ON user_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_user_groups_group_id ON user_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_tags_group_id ON tags(group_id);
CREATE INDEX IF NOT EXISTS idx_monitor_tags_monitor_id ON monitor_tags(monitor_id);
CREATE INDEX IF NOT EXISTS idx_monitor_tags_tag_id ON monitor_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_settings_user_id ON monitoring_settings(user_id);

-- Create default groups (Admin and Subscription Plans)
INSERT INTO groups (id, name, description, created_by)
VALUES
    (1, 'Admin', 'Administrator group with full access', NULL),
    (2, 'Member', 'Default member group', NULL)
ON CONFLICT (id) DO NOTHING;

-- Set sequence for groups id to start after default groups
SELECT setval('groups_id_seq', (SELECT MAX(id) FROM groups));

-- Insert default APNS settings
INSERT INTO apns_settings (is_configured) VALUES (false)
ON CONFLICT DO NOTHING;

-- Create default admin user (password: Test1234! - MUST BE CHANGED ON FIRST LOGIN!)
-- Password hash for 'Test1234!'
-- Default email: admin@example.com - MUST BE CHANGED ON FIRST LOGIN!
INSERT INTO users (username, email, password_hash, api_key, is_admin, force_password_reset, force_username_change, email_verified)
VALUES ('admin', 'admin@example.com', '$2a$10$ZhRLu.K0ov4Y7k5mHIz9PO6uiLHHQj6y.6dO9QxqAjXO/IxiatCdC', 'default-api-key-change-this-immediately', true, true, true, true)
ON CONFLICT (username) DO NOTHING;

-- Assign admin user to Admin group as owner and Member group
INSERT INTO user_groups (user_id, group_id, role)
SELECT id, 1, 'owner' FROM users WHERE username = 'admin'
UNION ALL
SELECT id, 2, 'member' FROM users WHERE username = 'admin'
ON CONFLICT DO NOTHING;

-- Insert default email settings
INSERT INTO email_settings (is_configured) VALUES (false)
ON CONFLICT DO NOTHING;

-- Insert default Turnstile settings
INSERT INTO turnstile_settings (is_enabled) VALUES (false)
ON CONFLICT DO NOTHING;
