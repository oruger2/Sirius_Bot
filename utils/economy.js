function setUserEconomy(userId, balance, username) {
    // Logic to set user economy
    return { userId, balance, username };
}

function getUserEconomy(userId) {
    // Logic to get user economy
    const economyData = {}; // Fetch economy data here
    return { ...economyData, username: economyData.username };
}

function getRanking() {
    const rankingData = []; // Fetch ranking data here
    return rankingData.map(entry => ({ ...entry, username: entry.username }));
}