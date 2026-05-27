// controllers/duelController.js
const duelService = require('../services/duelService');

const startNextDuel = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { handle1, handle2, targetRating } = req.body;

        if (!handle1 || !handle2 || !targetRating) {
            return res.status(400).json({ error: 'Missing handles or target rating' });
        }

        // Fetch a fair problem using our new service
        const problem = await duelService.getFairProblemForDuel(handle1, handle2, targetRating);

        res.status(200).json({
            message: 'Duel problem selected!',
            problem: problem
        });
    } catch (error) {
        console.error('Error starting next duel:', error);
        res.status(400).json({ error: error.message });
    }
};

module.exports = {
    startNextDuel
};