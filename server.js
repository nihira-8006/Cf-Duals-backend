require('dotenv').config();

const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const roomRoutes = require('./routes/roomRoutes');
const duelRoutes = require('./routes/duelRoutes');
const pool = require('./config/db');

const app = express();

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
// Serve static files from the 'public' directory
app.use(express.static('public'));
// Routes
app.use('/api/rooms', roomRoutes);
app.use('/api/duels', duelRoutes);

const duelService = require('./services/duelService');
const cfService = require('./services/cfService');

// Health check
app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'index.html'));
});

// Create HTTP server
const server = http.createServer(app);

// Attach Socket.io
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Socket logic
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

    socket.on('disconnect', () => {
        console.log(`🔌 User disconnected: ${socket.id}`);
    });


      socket.on('start_duel', async (data) => {
        const { roomId, handle1, handle2, targetRating } = data;
        
        io.to(roomId).emit('room_update', { message: `Fetching problem for ${targetRating} rating...` });

        try {
            // Get a fair problem
            const problem = await duelService.getFairProblemForDuel(handle1, handle2, targetRating);
            console.log(problem);
            const startTimeMs = Date.now();

            // Broadcast the problem to both players instantly
            io.to(roomId).emit('duel_started', {
                problem: problem,
                startTime: startTimeMs
            });

            // Set up the win condition callback
            const onPlayerWin = (winnerHandle, solveTimeMs) => {
                const timeTaken = ((solveTimeMs - startTimeMs) / 1000 / 60).toFixed(2); // in minutes
                console.log("Starting watcher for", handle1);
                console.log("Starting watcher for", handle2);
                // Stop watching both players
                cfService.stopWatching(roomId, handle1);
                cfService.stopWatching(roomId, handle2);

                // Announce the winner!
                io.to(roomId).emit('duel_ended', {
                    winner: winnerHandle,
                    message: `🏆 ${winnerHandle} won in ${timeTaken} minutes!`,
                    problemId: `${problem.contest_id}${problem.index}`
                });
            };

            // Start polling Codeforces for both players in the background
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
// 2. Start the Duel (NEW)
  
// Start server
const startServer = async () => {
    try {
        await pool.query('SELECT NOW()');

        console.log('✅ Database connected');

        server.listen(PORT, () => {
            console.log(`✅ Server running on http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

startServer();