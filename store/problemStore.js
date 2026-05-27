// store/problemStore.js
const pool = require('../config/db');

const getRandomUnsolvedProblem = async (targetRating, excludedProblemKeys) => {
    try {
        console.log(`🔍 Querying DB for problem near rating ${targetRating}...`);
        
        // Search within a 100-point range of the target rating
        const minRating = targetRating - 100;
        const maxRating = targetRating + 100;

        // excludedProblemKeys is an array of strings like ["1342-A", "1500-C"]
        const result = await pool.query(
            `SELECT * FROM problems 
             WHERE rating BETWEEN $1 AND $2 
             AND CONCAT(contest_id, '-', index) != ALL($3)
             ORDER BY RANDOM() 
             LIMIT 1`,
            [minRating, maxRating, excludedProblemKeys]
        );

        if (result.rows.length === 0) {
            throw new Error(`No unsolved problems found in range ${minRating}-${maxRating}`);
        }

        return result.rows[0];
    } catch (error) {
        console.error('❌ Error fetching problem from DB:', error.message);
        throw error;
    }
};

module.exports = { getRandomUnsolvedProblem };