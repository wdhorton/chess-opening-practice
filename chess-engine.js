export class ChessEngine {
    constructor() {
        this.game = new Chess();
        this.practicing = false;
        this.playerColor = 'white';
        this.appliedMoves = [];
        this.undoneMoves = [];
        this.fenMoveMap = {};
        this.autoCheckEnabled = false;
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
                fenMap[currentFen].add(move.notation.notation);

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

    getValidMovesForPosition(fen) {
        const normalizedFen = this.normalizeFen(fen);
        return this.fenMoveMap[normalizedFen] || [];
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