require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const roomRoutes = require('./routes/roomRoutes');
const duelRoutes = require('./routes/duelRoutes');
const pool = require('./config/db');

const duelService = require('./services/duelService');
const cfService = require('./services/cfService');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Set up the allowed frontend URL (Vercel or Localhost)
const frontendURL = process.env.FRONTEND_URL || 'http://localhost:5500';

// 1. Express Middleware
app.use(cors({
    origin: frontendURL,
    methods: ['GET', 'POST']
}));
app.use(express.json());

// 2. REST API Routes
app.use('/api/rooms', roomRoutes);
app.use('/api/duels', duelRoutes);

// Basic backend health check (Replaces the old HTML serving)
app.get('/', (req, res) => {
    res.json({ status: 'CF Duels API is running securely.' });
});

// 3. Socket.io Setup
const io = new Server(server, {
    cors: {
        origin: frontendURL, // Locked down to your frontend
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log(`⚡ New WebSocket connection: ${socket.id}`);

    socket.on('join_room', (data) => {
        const { roomId, handle } = data;
        socket.join(roomId);
        console.log(`🚪 [${handle}] joined socket room: ${roomId}`);

        socket.to(roomId).emit('room_update', {
            message: `${handle} has joined the room!`,
            handle: handle
        });
    });

    socket.on('start_duel', async (data) => {
        const { roomId, handle1, handle2, targetRating } = data;
        
        io.to(roomId).emit('room_update', { message: `Fetching problem for ${targetRating} rating...` });

        try {
            const problem = await duelService.getFairProblemForDuel(handle1, handle2, targetRating);
            console.log(problem);
            const startTimeMs = Date.now();

            io.to(roomId).emit('duel_started', {
                problem: problem,
                startTime: startTimeMs
            });

            const onPlayerWin = (winnerHandle, solveTimeMs) => {
                const timeTaken = ((solveTimeMs - startTimeMs) / 1000 / 60).toFixed(2);
                console.log(`Stop watching both players. Winner: ${winnerHandle}`);
                
                cfService.stopWatching(roomId, handle1);
                cfService.stopWatching(roomId, handle2);

                io.to(roomId).emit('duel_ended', {
                    winner: winnerHandle,
                    message: `🏆 ${winnerHandle} won in ${timeTaken} minutes!`,
                    problemId: `${problem.contest_id}${problem.index}`
                });
            };

            cfService.watchForSolve(roomId, handle1, problem.contest_id, problem.index, startTimeMs, (time) => onPlayerWin(handle1, time));
            cfService.watchForSolve(roomId, handle2, problem.contest_id, problem.index, startTimeMs, (time) => onPlayerWin(handle2, time));

        } catch (error) {
            io.to(roomId).emit('room_update', { message: `❌ Error starting duel: ${error.message}` });
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔌 User disconnected: ${socket.id}`);
    });
});

// 4. Initialize Database and Start Server
const startServer = async () => {
    try {
        await pool.query('SELECT NOW()');
        console.log('✅ Database connected');

        server.listen(PORT, () => {
            console.log(`✅ Backend server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

startServer();