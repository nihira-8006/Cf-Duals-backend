const roomService = require('../services/roomService');
const { randomUUID } = require('crypto');

const createRoom = async (req, res) => {
    try {
        const { handle } = req.body;
        const result = await roomService.createRoom(handle);
        res.status(201).json(result);
    } catch (error) {
        console.error('Error creating room:', error);
        res.status(400).json({ error: error.message });
    }
};

const joinRoom = async (req, res) => {
    try {
        const { handle, roomCode } = req.body;
        const result = await roomService.joinRoom(handle, roomCode);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error joining room:', error);
        res.status(400).json({ error: error.message });
    }
};

const getRoomStatus = async (req, res) => {
    try {
        const { roomId } = req.params;
        const result = await roomService.getRoomStatus(roomId);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error getting room status:', error);
        if (error.message === 'Room not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(400).json({ error: error.message });
    }
};

const leaveRoom = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        const result = await roomService.leaveRoom(roomId, userId);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error leaving room:', error);
        res.status(400).json({ error: error.message });
    }
};

module.exports = {
    createRoom,
    joinRoom,
    getRoomStatus,
    leaveRoom
};


