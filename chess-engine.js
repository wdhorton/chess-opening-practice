export class ChessEngine {
    constructor() {
        this.game = new Chess();
        this.practicing = false;
        this.playerColor = 'white';
        this.appliedMoves = [];
        this.undoneMoves = [];
        this.fenMoveMap = {};
        this.autoCheckEnabled = false;
        this.activeRepertoires = new Map(); // Map to store multiple active repertoires
    }

    // Core game state methods
    getFen() {
        return this.game.fen();
    }

    getPgn() {
        return this.game.pgn();
    }

    getHistory({ verbose } = { verbose: true }) {
        return this.game.history({ verbose: verbose });
    }

    getTurn() {
        return this.game.turn();
    }

    isInCheck() {
        return this.game.in_check();
    }

    isGameOver() {
        return this.game.game_over();
    }

    isCheckmate() {
        return this.game.in_checkmate();
    }

    isDraw() {
        return this.game.in_draw();
    }

    isStalemate() {
        return this.game.in_stalemate();
    }

    isThreefoldRepetition() {
        return this.game.in_threefold_repetition();
    }

    isInsufficientMaterial() {
        return this.game.insufficient_material();
    }

    // Move management
    makeMove(sanOrMove) {
        const prevFen = this.game.fen();
        const move = this.game.move(sanOrMove);

        if (move) {
            this.appliedMoves.push(move);
            this.undoneMoves = [];
            return { success: true, move, prevFen };
        }
        return { success: false };
    }

    undoMove() {
        if (this.appliedMoves.length > 0) {
            const move = this.game.undo();
            this.undoneMoves.push(move);
            this.appliedMoves.pop();
            return { success: true, move };
        }
        return { success: false };
    }

    redoMove() {
        if (this.undoneMoves.length > 0) {
            const move = this.undoneMoves.pop();
            const result = this.game.move({
                from: move.from,
                to: move.to,
                promotion: move.promotion || 'q'
            });
            if (result) {
                this.appliedMoves.push(result);
                return { success: true, move: result };
            }
        }
        return { success: false };
    }

    // Position management
    setPositionFromFen(fen) {
        try {
            const success = this.game.load(fen);
            if (success) {
                this.practicing = false;
                this.appliedMoves = [];
                this.undoneMoves = [];
                return { success: true };
            }
            return { success: false, error: 'Invalid FEN' };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    setPositionFromPgn(pgn) {
        try {
            const success = this.game.load_pgn(pgn);
            if (success) {
                this.practicing = false;
                this.appliedMoves = [];
                this.undoneMoves = [];
                return { success: true };
            }
            return { success: false, error: 'Invalid PGN' };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    resetPosition() {
        this.game = new Chess();
        this.practicing = false;
        this.appliedMoves = [];
        this.undoneMoves = [];
        return { success: true };
    }

    // Move validation and checking
    normalizeFen(fen) {
        const [layout, turn] = fen.split(' ');
        return `${layout} ${turn}`;
    }

    buildFenMoveMap(pgn) {
        const games = PgnParser.parse(pgn);
        const fenMap = {};

        const traverseMoves = (moves, board) => {
            for (const move of moves) {
                const currentFen = this.normalizeFen(board.fen());
                if (!fenMap[currentFen]) {
                    fenMap[currentFen] = new Set();
                }
                
                // Store move with comment if it exists
                const moveText = move.notation.notation;
                const moveWithComment = move.comments && move.comments.length > 0 
                    ? { san: moveText, comment: move.comments.join(' ') }
                    : moveText;
                
                fenMap[currentFen].add(moveWithComment);

                if (move.variations && move.variations.length) {
                    for (const variation of move.variations) {
                        const boardClone = new Chess(board.fen());
                        traverseMoves(variation, boardClone);
                    }
                }

                const san = move.notation.notation;
                const result = board.move(san);
                if (!result) {
                    console.error(`Illegal move encountered: ${san} ${board.fen()}`);
                    continue;
                }
            }
        };

        for (const game of games) {
            const chess = new Chess();
            if (game.tags && game.tags.FEN) {
                chess.load(game.tags.FEN);
            }
            traverseMoves(game.moves, chess);
        }

        this.fenMoveMap = Object.fromEntries(
            Object.entries(fenMap).map(([fen, moveSet]) => [fen, Array.from(moveSet)])
        );
        return this.fenMoveMap;
    }

    clearRepertoire() {
        this.fenMoveMap = {};
        return { success: true };
    }
    
    // Clear all active repertoires
    clearAllRepertoires() {
        this.fenMoveMap = {};
        this.activeRepertoires.clear();
        return { success: true };
    }

    setRepertoire(fenMoveMap) {
        if (!fenMoveMap || typeof fenMoveMap !== 'object') {
            return { success: false, error: 'Invalid repertoire data' };
        }
        
        this.fenMoveMap = fenMoveMap;
        return { success: true };
    }
    
    // Add a repertoire to active repertoires
    addActiveRepertoire(name, fenMoveMap) {
        if (!fenMoveMap || typeof fenMoveMap !== 'object') {
            return { success: false, error: 'Invalid repertoire data' };
        }
        
        this.activeRepertoires.set(name, fenMoveMap);
        return { success: true };
    }
    
    // Remove a repertoire from active repertoires
    removeActiveRepertoire(name) {
        if (this.activeRepertoires.has(name)) {
            this.activeRepertoires.delete(name);
            return { success: true };
        }
        return { success: false, error: 'Repertoire not found' };
    }
    
    // Check if a repertoire is active
    isRepertoireActive(name) {
        return this.activeRepertoires.has(name);
    }
    
    // Get all active repertoire names
    getActiveRepertoireNames() {
        return Array.from(this.activeRepertoires.keys());
    }

    getMovesWithComments(fen) {
        const normalizedFen = this.normalizeFen(fen);
        const moves = this.fenMoveMap[normalizedFen] || [];
        return moves.map(move => {
            // If move is already an object with san and comment, return it
            if (typeof move === 'object' && move.san) {
                return move;
            }
            // If it's just a string (san), return it wrapped in an object with no comment
            return { san: move, comment: null };
        });
    }

    getValidMoveSANs(fen) {
        const moves = this.getValidMovesForPosition(fen);
        return moves.map(move => typeof move === 'object' && move.san ? move.san : move);
    }

    getValidMovesForPosition(fen) {
        const simplifiedFen = this.normalizeFen(fen);
        
        // Check in the main fenMoveMap first
        const mainMoves = this.fenMoveMap[simplifiedFen] || [];
        
        // If there are no active repertoires, just return the main moves
        if (this.activeRepertoires.size === 0) {
            return this.getMovesWithComments(fen);
        }
        
        // Combine moves from all active repertoires
        const allMovesMap = new Map();
        
        // Add moves from main repertoire
        mainMoves.forEach(move => {
            const san = typeof move === 'object' && move.san ? move.san : move;
            allMovesMap.set(san, move);
        });
        
        // Add moves from each active repertoire
        for (const repertoire of this.activeRepertoires.values()) {
            const repMoves = repertoire[simplifiedFen] || [];
            repMoves.forEach(move => {
                const san = typeof move === 'object' && move.san ? move.san : move;
                allMovesMap.set(san, move);
            });
        }
        
        // Convert back to array
        return Array.from(allMovesMap.values());
    }
    
    // Get valid moves from a specific repertoire
    getValidMovesFromRepertoire(fen, repertoireName) {
        const simplifiedFen = this.normalizeFen(fen);
        const repertoire = this.activeRepertoires.get(repertoireName);
        return repertoire && repertoire[simplifiedFen] ? repertoire[simplifiedFen] : [];
    }
    
    // Get valid moves from each active repertoire
    getValidMovesPerRepertoire(fen) {
        const simplifiedFen = this.normalizeFen(fen);
        const result = {};
        
        // Add the main repertoire
        if (Object.keys(this.fenMoveMap).length > 0) {
            result['Main'] = this.fenMoveMap[simplifiedFen] || [];
        }
        
        // Add each active repertoire
        for (const [name, repertoire] of this.activeRepertoires.entries()) {
            const moves = repertoire[simplifiedFen] || [];
            result[name] = moves;
        }
        
        return result;
    }

    // Game mode management
    startPracticing() {
        this.practicing = true;
        return { success: true };
    }

    stopPracticing() {
        this.practicing = false;
        return { success: true };
    }

    setPlayerColor(color) {
        if (color === 'white' || color === 'black') {
            this.playerColor = color;
            return { success: true };
        }
        return { success: false, error: 'Invalid color' };
    }

    togglePlayerColor() {
        this.playerColor = this.playerColor === 'white' ? 'black' : 'white';
        return { success: true, color: this.playerColor };
    }

    // Utility methods
    generatePGN() {
        const date = new Date().toISOString().split('T')[0];
        const headers = [
            '[Event "Chess Opening Practice"]',
            '[Site "Chess Practice App"]',
            '[Date "' + date + '"]',
            '[White "Player"]',
            '[Black "Practice Partner"]',
            '[Result "*"]'
        ];
        return headers.join('\n') + '\n\n' + this.game.pgn() + ' *';
    }

    // State getters
    getState() {
        return {
            fen: this.game.fen(),
            practicing: this.practicing,
            playerColor: this.playerColor,
            autoCheckEnabled: this.autoCheckEnabled,
            inCheck: this.game.in_check(),
            turn: this.game.turn(),
            history: this.game.history({ verbose: true }),
            validMoves: this.getValidMovesForPosition(this.game.fen())
        };
    }
} 