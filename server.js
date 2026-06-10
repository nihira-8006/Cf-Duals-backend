require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const roomRoutes = require('./routes/roomRoutes');
const duelRoutes = require('./routes/duelRoutes');
const pool = require('./config/db');
const authRoutes = require('./routes/authRoutes');

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


app.use('/api/auth', authRoutes);

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

           const onPlayerWin = async (winnerHandle, solveTimeMs) => {
    const deltaSeconds = Math.floor((solveTimeMs - startTimeMs) / 1000);
    const timeTakenMinutes = (deltaSeconds / 60).toFixed(2);

    cfService.stopWatching(roomId, handle1);
    cfService.stopWatching(roomId, handle2);

    try {
        const user1Res = await pool.query('SELECT id, handle FROM users WHERE LOWER(handle) = LOWER($1)', [handle1]);
        const user2Res = await pool.query('SELECT id, handle FROM users WHERE LOWER(handle) = LOWER($1)', [handle2]);

        if (user1Res.rows.length > 0 && user2Res.rows.length > 0) {
            const u1 = user1Res.rows[0];
            const u2 = user2Res.rows[0];
            const u1IsWinner = winnerHandle.toLowerCase() === u1.handle.toLowerCase();

            // 1. Save History for both
            const historyQuery = `INSERT INTO user_history (id, user_id, opponent_handle, problem_contest_id, problem_index, outcome, time_taken_seconds) VALUES ($1, $2, $3, $4, $5, $6, $7)`;
            await pool.query(historyQuery, [crypto.randomUUID(), u1.id, u2.handle, problem.contest_id, problem.index, u1IsWinner ? 'victory' : 'defeat', deltaSeconds]);
            await pool.query(historyQuery, [crypto.randomUUID(), u2.id, u1.handle, problem.contest_id, problem.index, u1IsWinner ? 'defeat' : 'victory', deltaSeconds]);

            // 2. Update Fast-Stats
            await pool.query('UPDATE users SET total_matches = total_matches + 1, total_wins = total_wins + 1 WHERE LOWER(handle) = LOWER($1)', [winnerHandle]);
            const loserHandle = u1IsWinner ? u2.handle : u1.handle;
            await pool.query('UPDATE users SET total_matches = total_matches + 1 WHERE LOWER(handle) = LOWER($1)', [loserHandle]);
        }

        // 3. Delete the Room (Clean up)
        await pool.query("DELETE FROM rooms WHERE id = $1", [roomId]);
        console.log(`🗑️ Room ${roomId} deleted. 💾 Stats updated.`);

    } catch (dbErr) {
        console.error('❌ DB Update Failed:', dbErr);
    }

    io.to(roomId).emit('duel_ended', {
        winner: winnerHandle,
        message: `🏆 ${winnerHandle} won in ${timeTakenMinutes} minutes!`,
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



    // 1. Relay the offer to the room
    socket.on('offer_draw', (data) => {
        socket.to(data.roomId).emit('draw_offered', { sender: data.sender });
    });

    // 2. Relay the decline back to the room
    socket.on('decline_draw', (data) => {
        socket.to(data.roomId).emit('draw_declined', { sender: data.sender });
    });

    // 3. Handle the Accepted Draw
    socket.on('accept_draw', async (data) => {
        const { roomId, player1, player2, problem, startTimeMs } = data;
        const deltaSeconds = Math.floor((Date.now() - startTimeMs) / 1000);

        // Immediately stop polling Codeforces
        cfService.stopWatching(roomId, player1);
        cfService.stopWatching(roomId, player2);

        try {
            const u1Res = await pool.query('SELECT id, handle FROM users WHERE LOWER(handle) = LOWER($1)', [player1]);
            const u2Res = await pool.query('SELECT id, handle FROM users WHERE LOWER(handle) = LOWER($1)', [player2]);

            if (u1Res.rows.length > 0 && u2Res.rows.length > 0) {
                const u1 = u1Res.rows[0];
                const u2 = u2Res.rows[0];

                const historyQuery = `INSERT INTO user_history (id, user_id, opponent_handle, problem_contest_id, problem_index, source, outcome, time_taken_seconds) VALUES ($1, $2, $3, $4, $5, 'local', 'draw', $6)`;
                
                // Record the 'draw' for both players
                await pool.query(historyQuery, [crypto.randomUUID(), u1.id, u2.handle, problem.contest_id, problem.index, deltaSeconds]);
                await pool.query(historyQuery, [crypto.randomUUID(), u2.id, u1.handle, problem.contest_id, problem.index, deltaSeconds]);

                // Update total_matches, but DO NOT increase total_wins
                await pool.query('UPDATE users SET total_matches = total_matches + 1 WHERE LOWER(handle) IN (LOWER($1), LOWER($2))', [player1, player2]);
            }

            // Delete the Room
            await pool.query("DELETE FROM rooms WHERE id = $1", [roomId]);
            console.log(`🤝 Room ${roomId} deleted. ${player1} and ${player2} drew.`);

        } catch (dbErr) {
            console.error('❌ DB Update Failed on Draw:', dbErr.message);
        }

        // Broadcast the peaceful end of the duel to BOTH screens
        io.to(roomId).emit('duel_ended', {
            winner: 'Draw',
            message: `🤝 Match ended in a draw! Both players agreed.`,
            problemId: `${problem.contest_id}${problem.index}`
        });
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