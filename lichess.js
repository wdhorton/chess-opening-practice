export class LichessAPI {
    static async getMoves(fen, filters) {
        const params = new URLSearchParams({ fen });
        filters.speeds.forEach(speed => params.append('speeds[]', speed));
        filters.ratings.forEach(rating => params.append('ratings[]', rating));
        
        const response = await fetch(`https://explorer.lichess.ovh/lichess?${params.toString()}`);
        return await response.json();
    }

    static async getPositionStats(fen, filters, playerColor) {
        const data = await this.getMoves(fen, filters);
        
        if (!data.moves || data.moves.length === 0) {
            return {
                success: false,
                message: 'No games found in database for this position with current filters.'
            };
        }

        const totalGames = data.moves.reduce((sum, move) => sum + move.white + move.black + move.draws, 0);
        let totalScore = data.moves.reduce((sum, move) => {
            const moveScore = playerColor === 'white' ? 
                (move.white + 0.5 * move.draws) : 
                (move.black + 0.5 * move.draws);
            return sum + moveScore;
        }, 0);
        
        const score = totalScore / totalGames;
        const scorePercent = (score * 100).toFixed(1);
        
        return {
            success: true,
            totalGames,
            scorePercent,
            message: `There are ${totalGames.toLocaleString()} games with this position using your filters. ` +
                    `${playerColor.charAt(0).toUpperCase() + playerColor.slice(1)} scored ${scorePercent}% from this position.`
        };
    }

    static selectMoves(moves, topP, topK) {
        if (!moves || moves.length === 0) return [];

        const totalGames = moves.reduce((sum, move) => sum + move.white + move.black + move.draws, 0);
        if (totalGames === 0) return [];
        
        // Calculate probabilities and sort by popularity
        const movesWithProb = moves
            .map(move => ({
                ...move,
                probability: (move.white + move.black + move.draws) / totalGames
            }))
            .sort((a, b) => b.probability - a.probability);

        // Select moves until we exceed topP, respecting topK
        const selectedMoves = [];
        let cumulativeProb = 0;

        for (let i = 0; i < movesWithProb.length && i < topK; i++) {
            selectedMoves.push(movesWithProb[i]);
            cumulativeProb += movesWithProb[i].probability;
            if (cumulativeProb >= topP) break;
        }

        // Normalize probabilities of selected moves
        return selectedMoves.map(move => ({
            ...move,
            probability: move.probability / cumulativeProb
        }));
    }

    static sampleMove(normalizedMoves) {
        if (!normalizedMoves || normalizedMoves.length === 0) return null;
        if (normalizedMoves.length === 1) return normalizedMoves[0];

        const random = Math.random();
        let cumulative = 0;
        
        for (const move of normalizedMoves) {
            cumulative += move.probability;
            if (random <= cumulative) {
                return move;
            }
        }
        
        return normalizedMoves[0];
    }

    static selectComputerMove(moves, topP, topK) {
        const selectedMoves = this.selectMoves(moves, topP, topK);
        return this.sampleMove(selectedMoves);
    }
} 