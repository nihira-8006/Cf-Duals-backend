const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');

const register = async (req, res) => {
    try {
        const { handle, password } = req.body;
        if (!handle || !password) return res.status(400).json({ error: 'Handle and password required' });

        const existingUser = await pool.query('SELECT * FROM users WHERE LOWER(handle) = LOWER($1)', [handle]);
        if (existingUser.rows.length > 0) return res.status(400).json({ error: 'Handle already registered' });

        const passwordHash = await bcrypt.hash(password, 10);
        const userId = crypto.randomUUID();

        await pool.query(
            'INSERT INTO users (id, handle, password_hash) VALUES ($1, $2, $3)',
            [userId, handle, passwordHash]
        );

        const token = jwt.sign({ userId, handle }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, handle });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error during registration' });
    }
};

const login = async (req, res) => {
    try {
        const { handle, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE LOWER(handle) = LOWER($1)', [handle]);
        
        if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ userId: user.id, handle: user.handle }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(200).json({ token, handle });
    } catch (error) {
        res.status(500).json({ error: 'Server error during login' });
    }
};

const getDashboardStats = async (req, res) => {
    try {
        // This is ultra-fast because we pre-calculated it!
        const result = await pool.query(
            'SELECT handle, total_matches, total_wins, current_rating FROM users WHERE id = $1',
            [req.user.userId]
        );
        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
};

const getHistory = async (req, res) => {
    try {
        const query = `
            SELECT h.opponent_handle, h.outcome, h.time_taken_seconds, h.created_at, p.name, p.rating 
            FROM user_history h
            LEFT JOIN problems p ON h.problem_contest_id = p.contest_id AND h.problem_index = p.index
            WHERE h.user_id = $1 ORDER BY h.created_at DESC
        `;
        const result = await pool.query(query, [req.user.userId]);
        res.status(200).json({ history: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
};

module.exports = { register, login, getDashboardStats, getHistory };