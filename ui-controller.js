import { Chessground } from 'https://cdn.jsdelivr.net/npm/chessground@9.1.1/dist/chessground.js';
import { ChessEngine } from './chess-engine.js';
import { LichessAPI } from './lichess.js';

export class ChessUIController {
    constructor() {
        this.engine = new ChessEngine();
        this.cg = null;
        this.savedPositions = [];
        this.initializeUI();
    }

    // Initialize UI elements and event listeners
    initializeUI() {
        this.initializeChessground();
        this.initializeEventListeners();
        this.loadSavedPositions();
        this.updateStatus();
        this.updateMovesList();
    }

    initializeChessground() {
        const config = {
            fen: this.engine.getFen(),
            movable: {
                color: this.engine.practicing ? this.engine.playerColor : 'both',
                free: false,
                dests: this.getChessgroundDests(),
                events: {
                    after: (orig, dest) => this.onMove(orig, dest)
                }
            },
            draggable: {
                showGhost: true
            }
        };

        this.cg = Chessground(document.getElementById('board'), config);
    }

    // Event listeners
    initializeEventListeners() {
        document.getElementById('flipBoardBtn').addEventListener('click', () => this.flipBoard());
        document.getElementById('startBtn').addEventListener('click', () => this.startPractice());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetPosition());
        document.getElementById('setFenBtn').addEventListener('click', () => this.setPositionFromFen());
        document.getElementById('copyFenBtn').addEventListener('click', () => this.copyFen());
        document.getElementById('copyPgnBtn').addEventListener('click', () => this.copyPgn());
        document.getElementById('savePositionBtn').addEventListener('click', () => this.saveCurrentPosition());
        document.getElementById('backBtn').addEventListener('click', () => this.undoMove());
        document.getElementById('forwardBtn').addEventListener('click', () => this.redoMove());
        document.getElementById('pgnFile').addEventListener('change', (e) => this.handlePGNFileUpload(e));
        document.getElementById('autoCheckMoves').addEventListener('change', (event) => {
            this.engine.autoCheckEnabled = event.target.checked;
        });
        document.getElementById('checkMovesBtn').addEventListener('click', () => this.checkMoves());
        document.getElementById('analyzeBtn').addEventListener('click', () => this.goToLichessAnalysis());
        
        this.initializeFilterControls();
    }

    checkMoves() {
        const validMoves = this.engine.getValidMovesForPosition(this.engine.getFen());
        if (validMoves.length > 0) {
            moveStatus.textContent = `Valid moves from this position: ${validMoves}`;
            moveStatus.className = 'move-status valid';
        } else {
            moveStatus.textContent = `No moves found in repertoire for this position`;
            moveStatus.className = 'move-status invalid';
        }
    }

    goToLichessAnalysis() {
        const moves = this.engine.getHistory({ verbose: false });
        const pgnMoves = moves.join('_');
        const url = `https://lichess.org/analysis/pgn/${encodeURIComponent(pgnMoves)}`;
        window.open(url, '_blank');
    }

    handlePGNFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.engine.buildFenMoveMap(e.target.result);
                document.getElementById('checkMovesBtn').disabled = false;
                document.getElementById('moveStatus').textContent = `Repertoire loaded successfully: ${Object.keys(this.engine.fenMoveMap).length} positions found`;
                document.getElementById('moveStatus').className = 'move-status valid';
            } catch (error) {
                console.error('Error parsing PGN:', error);
                document.getElementById('moveStatus').textContent = 'Error loading PGN file';
                document.getElementById('moveStatus').className = 'move-status invalid';
            }
        };
        reader.readAsText(file);
    }

    // Move handling
    onMove(orig, dest) {
        const isPlayerMove = !this.engine.practicing || 
            (this.engine.getTurn() === 'w' && this.engine.playerColor === 'white') || 
            (this.engine.getTurn() === 'b' && this.engine.playerColor === 'black');

        const result = this.engine.makeMove(orig, dest);
        
        if (result.success) {
            if (isPlayerMove && this.engine.autoCheckEnabled) {
                const validMoves = this.engine.getValidMovesForPosition(result.prevFen);
                const moveStatus = document.getElementById('moveStatus');
                if (validMoves.includes(result.move.san)) {
                    moveStatus.textContent = 'Move is in your repertoire';
                    moveStatus.className = 'move-status valid';
                } else {
                    moveStatus.textContent = `Move is not in your repertoire. Valid moves were: ${validMoves}`;
                    moveStatus.className = 'move-status invalid';
                }
            }

            this.updateBoard();
            this.updateMovesList();

            if (this.engine.practicing) {
                this.makeComputerMove();
            }
        }
    }

    // Board updates
    updateBoard() {
        this.cg.set({
            fen: this.engine.getFen(),
            turnColor: this.getTurnColor(),
            movable: {
                color: this.engine.practicing ? this.engine.playerColor : 'both',
                dests: this.getChessgroundDests()
            }
        });
        this.updateStatus();
    }

    // UI updates
    updateStatus(message) {
        const statusDiv = document.getElementById('status');
        if (message) {
            statusDiv.textContent = message;
        } else {
            let status = '';
            if (this.engine.practicing) {
                status = `Practice mode: You are playing ${this.engine.playerColor}`;
                if (this.engine.isInCheck()) {
                    status += ' - CHECK!';
                }
            } else {
                status = 'Set up your starting position. You can play moves for both sides. Then click "Start Practice".';
            }
            statusDiv.textContent = status;
        }
        statusDiv.className = 'info';
    }

    updateMovesList() {
        const moves = this.engine.getHistory();
        const movesDiv = document.getElementById('moves');
        let html = '';
        
        for (let i = 0; i < moves.length; i++) {
            if (i % 2 === 0) {
                html += `<span class="move-number">${Math.floor(i/2 + 1)}.</span>`;
            }
            html += `<span class="move">${moves[i].san}</span>`;
            if (i % 2 === 1) {
                html += '<br>';
            }
        }
        
        movesDiv.innerHTML = html;
        movesDiv.scrollTop = movesDiv.scrollHeight;
    }

    // Position management
    async makeComputerMove() {
        const filters = this.getActiveFilters();
        const fen = this.engine.getFen();
        
        try {
            const data = await LichessAPI.getMoves(fen, filters);

            if (data.moves && data.moves.length > 0) {
                const topP = parseFloat(document.getElementById('topPInput').value);
                const topK = parseInt(document.getElementById('topKInput').value);
                const selectedMove = LichessAPI.selectComputerMove(data.moves, topP, topK);
                
                if (selectedMove) {
                    const result = this.engine.makeMove(
                        selectedMove.uci.substring(0, 2),
                        selectedMove.uci.substring(2, 4),
                        selectedMove.uci.length > 4 ? selectedMove.uci[4] : 'q'
                    );
                    
                    if (result.success) {
                        this.updateBoard();
                        this.updateMovesList();
                        await this.updatePositionStats();
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching from Lichess API:', error);
            this.updateStatus('Error making computer move');
        }
    }

    async updatePositionStats() {
        const fen = this.engine.getFen();
        const filters = this.getActiveFilters();
        
        try {
            const stats = await LichessAPI.getPositionStats(fen, filters, this.engine.playerColor);
            document.getElementById('score').textContent = stats.message;
        } catch (error) {
            console.error('Error fetching stats:', error);
            document.getElementById('score').textContent = 'Error fetching position statistics';
        }
    }

    // Filter management
    initializeFilterControls() {
        document.querySelectorAll('.filter-option').forEach(button => {
            button.addEventListener('click', () => {
                button.classList.toggle('active');
                this.saveFilters();
            });
        });
        
        this.loadFilters();
        this.syncTopPControls();
    }

    getActiveFilters() {
        const speeds = Array.from(document.querySelectorAll('#timeControls .filter-option.active'))
            .map(button => button.dataset.speed);
        
        const ratings = Array.from(document.querySelectorAll('#ratings .filter-option.active'))
            .map(button => parseInt(button.dataset.rating));
        
        return { speeds, ratings };
    }

    // Local storage management
    saveFilters() {
        const speeds = Array.from(document.querySelectorAll('#timeControls .filter-option'))
            .map(button => ({
                speed: button.dataset.speed,
                active: button.classList.contains('active')
            }));
        
        const ratings = Array.from(document.querySelectorAll('#ratings .filter-option'))
            .map(button => ({
                rating: button.dataset.rating,
                active: button.classList.contains('active')
            }));
        
        localStorage.setItem('chessFilters', JSON.stringify({ speeds, ratings }));
    }

    loadFilters() {
        const savedFilters = localStorage.getItem('chessFilters');
        if (!savedFilters) return;
        
        const filters = JSON.parse(savedFilters);
        
        filters.speeds.forEach(speed => {
            const button = document.querySelector(`#timeControls .filter-option[data-speed="${speed.speed}"]`);
            if (button) {
                button.classList.toggle('active', speed.active);
            }
        });
        
        filters.ratings.forEach(rating => {
            const button = document.querySelector(`#ratings .filter-option[data-rating="${rating.rating}"]`);
            if (button) {
                button.classList.toggle('active', rating.active);
            }
        });
    }

    // Utility methods
    syncTopPControls() {
        const slider = document.getElementById('topPSlider');
        const input = document.getElementById('topPInput');
        
        slider.addEventListener('input', (e) => {
            input.value = e.target.value;
        });
        
        input.addEventListener('input', (e) => {
            let value = parseFloat(e.target.value);
            if (value < 0) value = 0;
            if (value > 1) value = 1;
            slider.value = value;
            input.value = value;
        });
    }

    getChessgroundDests() {
        const dests = new Map();
        this.engine.game.SQUARES.forEach(s => {
            const ms = this.engine.game.moves({square: s, verbose: true});
            if (ms.length) dests.set(s, ms.map(m => m.to));
        });
        return dests;
    }

    getTurnColor() {
        return (this.engine.getTurn() === 'w') ? 'white' : 'black';
    }

    selectComputerMove(moves) {
        const topP = parseFloat(document.getElementById('topPInput').value);
        const topK = parseInt(document.getElementById('topKInput').value);
        return LichessAPI.selectComputerMove(moves, topP, topK);
    }

    // Button handlers
    flipBoard() {
        this.cg.toggleOrientation();
        this.engine.togglePlayerColor();
        this.updateStatus();
    }

    startPractice() {
        this.engine.startPracticing();
        this.updateBoard();
        if (this.engine.getTurn() !== this.engine.playerColor[0]) {
            this.makeComputerMove();
        }
    }

    resetPosition() {
        this.engine.resetPosition();
        this.updateBoard();
        this.updateMovesList();
    }

    async copyFen() {
        try {
            await navigator.clipboard.writeText(this.engine.getFen());
            this.updateStatus('FEN copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy FEN:', err);
            this.updateStatus('Failed to copy FEN to clipboard');
        }
    }

    async copyPgn() {
        try {
            await navigator.clipboard.writeText(this.engine.generatePGN());
            this.updateStatus('PGN copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy PGN:', err);
            this.updateStatus('Failed to copy PGN to clipboard');
        }
    }

    setPositionFromFen() {
        const fenInput = document.getElementById('fenInput');
        const fen = fenInput.value.trim();
        
        const result = this.engine.setPositionFromFen(fen);
        if (result.success) {
            this.updateBoard();
            this.updateStatus('Position set from FEN');
            this.updateMovesList();
            fenInput.value = '';
        } else {
            console.error('Invalid FEN:', result.error);
            this.updateStatus('Invalid FEN string');
            document.getElementById('status').className = 'warning';
        }
    }

    undoMove() {
        const result = this.engine.undoMove();
        if (result.success) {
            this.updateBoard();
            this.updateMovesList();
        }
    }

    redoMove() {
        const result = this.engine.redoMove();
        if (result.success) {
            this.updateBoard();
            this.updateMovesList();
        }
    }

    // Load saved positions from localStorage
    loadSavedPositions() {
        const saved = localStorage.getItem('chessPositions');
        if (saved) {
            this.savedPositions = JSON.parse(saved);
            this.updatePositionsList();
        }
    }


    // Update the positions list in the UI to show orientation
    updatePositionsList() {
        const positionsList = document.getElementById('positionsList');
        positionsList.innerHTML = '';
        
        if (this.savedPositions.length === 0) {
            positionsList.innerHTML = '<div class="position-item">No saved positions yet</div>';
            return;
        }
        
        this.savedPositions.forEach((position, index) => {
            const item = document.createElement('div');
            item.className = 'position-item';
            item.innerHTML = `
                <span class="position-name">
                    ${position.name}
                    <span class="position-orientation">(${position.orientation})</span>
                </span>
                <div>
                    <button class="delete-position" data-index="${index}">Delete</button>
                </div>
            `;
            
            // Add click handler to load the position
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('delete-position')) {
                    this.loadPosition(position);
                }
            });
            
            positionsList.appendChild(item);
        });
        
        // Add delete handlers
        document.querySelectorAll('.delete-position').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(button.dataset.index);
                this.savedPositions.splice(index, 1);
                this.savePositionsToStorage();
                this.updatePositionsList();
            });
        });
    }

    // Save current position
    saveCurrentPosition() {
        const name = prompt('Enter a name for this position:');
        if (!name) return;
        
        const position = {
            name: name,
            fen: this.engine.getFen(),
            pgn: this.engine.getPgn(),
            moves: this.engine.getHistory(),
            orientation: this.cg.state.orientation  // Save the current board orientation
        };
        
        this.savedPositions.push(position);
        this.savePositionsToStorage();
        this.updatePositionsList();
    }

    // Save positions to localStorage
    savePositionsToStorage() {
        localStorage.setItem('chessPositions', JSON.stringify(this.savedPositions));
    }

    loadPosition(position) {
        // First try to load from PGN
        let result = this.engine.setPositionFromPgn(position.pgn);
        
        if (!result.success) {
            result = this.engine.setPositionFromFen(position.fen);
        }

        if (!result.success) {
            console.error('Error loading position:', result.error);
            alert('Error loading position');
            return;
        }

        if (position.orientation) {
            this.cg.set({
                orientation: position.orientation
            });
            this.engine.setPlayerColor(position.orientation);
        }

        this.engine.stopPracticing();

        this.updateBoard();
        this.updateMovesList();
        this.updateStatus('Position loaded: ' + position.name);
    }
} 