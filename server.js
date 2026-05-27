
require('dotenv').config(); 
const express = require('express');
const path = require('path');

const roomRoutes = require('./routes/roomRoutes');
const app = express();
const pool = require('./config/db');
const duelRoutes = require('./routes/duelRoutes');

app.use(express.json());
app.use('/api/rooms', roomRoutes);

const PORT = process.env.PORT

console.log('📦 Pool imported:', pool ? '✅ defined' : '❌ undefined');

app.use('/api/duels', duelRoutes);

// Basic health check
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
const startServer = async () => {
    try {
        // Test DB connection
        await pool.query('SELECT NOW()');
        console.log('✅ Database connected');
        
        app.listen(PORT, () => {
            console.log(`✅ Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
