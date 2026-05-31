// services/cfService.js
const axios = require('axios');

// Job 1: Get everything a user has solved
const getUserSolvedProblems = async (handle) => {
    try {
        const response = await axios.get(`https://codeforces.com/api/user.status?handle=${handle}`);
        if (response.data.status !== 'OK') return [];
        
        const solved = response.data.result
            .filter(sub => sub.verdict === 'OK')
            .map(sub => `${sub.problem.contestId}-${sub.problem.index}`);
            
        return [...new Set(solved)]; // Return unique keys
    } catch (error) {
        console.error(`⚠️ Could not fetch history for ${handle}:`, error.message);
        return [];
    }
};

// Job 2: Watch for a correct submission during a duel
const activeWatchers = new Map();

const watchForSolve = (duelId, handle, contestId, problemIndex, startTimeMs, onSolve) => {
    const watcherKey = `${duelId}-${handle}`;

    const checkStatus = async () => {
        console.log(`🔄 Polling ${handle}...`);

        if (!activeWatchers.has(watcherKey)) return; // Stop if cancelled

        try {
            const url = `https://codeforces.com/api/user.status?handle=${handle}&from=1&count=1`;
            const response = await axios.get(url);

            if (response.data.status === 'OK' && response.data.result.length > 0) {
                const latestSub = response.data.result[0];
                const subTimeMs = latestSub.creationTimeSeconds * 1000;

                const isTargetProblem =
                    latestSub.problem.contestId === contestId &&
                    latestSub.problem.index === problemIndex;
                const isAfterDuelStart = subTimeMs >= startTimeMs;

                if (isTargetProblem && isAfterDuelStart) {
                    if (latestSub.verdict === 'OK') {
                        console.log(`🏆 [${handle}] Solved it!`);
                        stopWatching(duelId, handle);
                        onSolve(subTimeMs);
                        return; // Don't schedule another poll
                    } else if (latestSub.verdict !== 'TESTING') {
                        console.log(`❌ [${handle}] Submitted: ${latestSub.verdict}`);
                    }
                }
            }
        } catch (error) {
            console.error(`⚠️ Polling error for ${handle}:`, error.message);
        }
        if (!activeWatchers.has(watcherKey)) return;
        // Schedule next poll
        const timeoutId = setTimeout(checkStatus, 4000);
        activeWatchers.set(watcherKey, timeoutId);
    };

    console.log(`👀 Watching submissions for ${handle}`);
    // ✅ Set a placeholder so has() returns true on first check
    activeWatchers.set(watcherKey, null);
    checkStatus();
};

const stopWatching = (duelId, handle) => {
    const watcherKey = `${duelId}-${handle}`;
    if (activeWatchers.has(watcherKey)) {
        clearTimeout(activeWatchers.get(watcherKey));
        activeWatchers.delete(watcherKey);
        console.log(`🛑 Stopped watching ${handle}`);
    }
};

module.exports = {
    getUserSolvedProblems,
    watchForSolve,
    stopWatching
};
