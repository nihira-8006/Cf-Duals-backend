// scripts/syncProblems.js
require('dotenv').config();
const axios = require('axios');
const pool = require('../config/db'); // Assuming db.js exports a pg pool

const syncProblems = async () => {
    try {
        console.log('⏳ Fetching problems from Codeforces...');
        const response = await axios.get('https://codeforces.com/api/problemset.problems');
        
        if (response.data.status !== 'OK') {
            throw new Error('Failed to fetch from Codeforces');
        }

        const problems = response.data.result.problems;
        console.log(`✅ Fetched ${problems.length} problems. Upserting to database...`);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            for (const p of problems) {
                // Skip interactive/special problems and ones without a rating
                if (!p.rating || p.tags.includes('*special') || p.tags.includes('interactive')) {
                    continue;
                }

                await client.query(
                    `INSERT INTO problems (contest_id, index, name, rating, tags) 
                     VALUES ($1, $2, $3, $4, $5) 
                     ON CONFLICT (contest_id, index) DO UPDATE 
                     SET rating = EXCLUDED.rating, tags = EXCLUDED.tags`,
                    [p.contestId, p.index, p.name, p.rating, p.tags]
                );
            }
            
            await client.query('COMMIT');
            console.log('🚀 Successfully synced all problems to the database!');
        } catch (dbError) {
            await client.query('ROLLBACK');
            throw dbError;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('❌ Sync failed:', error.message);
    } finally {
        process.exit(0);
    }
};

syncProblems();