const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
    console.log('📊 Database connection established');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err);
});

const query = async (text, params) => {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        if (duration > 1000) {
            console.warn(`⚠️  Slow query (${duration}ms): ${text}`);
        }
        return res;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
};

const initialize = async () => {
    try {
        await pool.query('SELECT NOW()');
        console.log('✅ Database connection successful');
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        throw error;
    }
};

const close = async () => {
    await pool.end();
    console.log('📊 Database connection closed');
};

module.exports = {
    query,
    initialize,
    close,
    pool
};
