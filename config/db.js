const { Pool } = require('pg');

// Make sure DATABASE_URL is in ALL CAPS and exactly matches process.env
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.log("⚠️ Warning: DATABASE_URL is undefined! Falling back to localhost.");
}

const pool = new Pool({
    connectionString: connectionString || 'postgresql://postgres:password@localhost:5432/duals',
    ssl: connectionString ? { rejectUnauthorized: false } : false
});

module.exports = pool;