// services/duelService.js
const cfService = require('./cfService');
const problemStore = require('../store/problemStore');

const getFairProblemForDuel = async (handle1, handle2, targetRating) => {
    console.log(`🎯 Setting up duel for ${handle1} vs ${handle2} at rating ${targetRating}...`);
    
    // 1. Fetch histories concurrently
    const [solved1, solved2] = await Promise.all([
        cfService.getUserSolvedProblems(handle1),
        cfService.getUserSolvedProblems(handle2)
    ]);
    
    // 2. Combine and deduplicate their solved lists
    const combinedSolvedKeys = [...new Set([...solved1, ...solved2])];
    console.log(`📊 Combined solved count: ${combinedSolvedKeys.length} problems`);
    
    // 3. Ask the DB for a problem they haven't seen
    const problem = await problemStore.getRandomUnsolvedProblem(targetRating, combinedSolvedKeys);
    
    console.log(`✅ Selected Problem: ${problem.name} (${problem.contest_id}-${problem.index})`);
    
    return problem;
};

module.exports = {
    getFairProblemForDuel
};