import { describe, it, expect, vi } from 'vitest';
import { LichessAPI } from './lichess';

describe('LichessAPI', () => {
    describe('selectMoves', () => {
        it('should return empty array when no moves are provided', () => {
            const result = LichessAPI.selectMoves([], 1, 10);
            expect(result).toEqual([]);
        });

        it('should select and normalize moves that exceed topP', () => {
            const moves = [
                { white: 60, black: 60, draws: 60, uci: 'e2e4' }, // 180 games = 60%
                { white: 30, black: 30, draws: 30, uci: 'd2d4' }, // 90 games = 30%
                { white: 10, black: 10, draws: 10, uci: 'c2c4' }  // 30 games = 10%
            ];
            
            // With topP = 0.5, should only select first move since 0.6 > 0.5
            const result1 = LichessAPI.selectMoves(moves, 0.5, 10);
            expect(result1.length).toBe(1);
            expect(result1[0].uci).toBe('e2e4');
            expect(result1[0].probability).toBeCloseTo(1, 6); // Normalized to 1 since it's the only move
            
            // With topP = 0.8, should select first two moves since 0.6 + 0.3 = 0.9 > 0.8
            const result2 = LichessAPI.selectMoves(moves, 0.8, 10);
            expect(result2.length).toBe(2);
            expect(result2[0].uci).toBe('e2e4');
            expect(result2[1].uci).toBe('d2d4');
            expect(result2[0].probability).toBeCloseTo(0.67, 2); // 0.6 / 0.9
            expect(result2[1].probability).toBeCloseTo(0.33, 2); // 0.3 / 0.9
            
            // With topP = 0.95, should select all three moves
            const result3 = LichessAPI.selectMoves(moves, 0.95, 10);
            expect(result3.length).toBe(3);
            expect(result3.map(m => m.uci)).toEqual(['e2e4', 'd2d4', 'c2c4']);
            expect(result3[0].probability).toBeCloseTo(0.6, 6);
            expect(result3[1].probability).toBeCloseTo(0.3, 6);
            expect(result3[2].probability).toBeCloseTo(0.1, 6);
        });

        it('should respect topK parameter', () => {
            const moves = [
                { white: 100, black: 100, draws: 100, uci: 'e2e4' }, // 300 games = 50%
                { white: 100, black: 100, draws: 100, uci: 'd2d4' }, // 300 games = 50%
                { white: 100, black: 100, draws: 100, uci: 'c2c4' }  // 300 games
            ];
            
            const result = LichessAPI.selectMoves(moves, 1, 2);
            expect(result.length).toBe(2);
            expect(result.map(m => m.uci)).toEqual(['e2e4', 'd2d4']);
            expect(result[0].probability).toBeCloseTo(0.5, 6);
            expect(result[1].probability).toBeCloseTo(0.5, 6);
        });
    });

    describe('sampleMove', () => {
        const mockRandom = vi.spyOn(Math, 'random');

        it('should return null for empty moves array', () => {
            expect(LichessAPI.sampleMove([])).toBeNull();
        });

        it('should return the only move if there is just one', () => {
            const moves = [{ uci: 'e2e4', probability: 1 }];
            expect(LichessAPI.sampleMove(moves).uci).toBe('e2e4');
        });

        it('should sample moves according to their probabilities', () => {
            const moves = [
                { uci: 'e2e4', probability: 0.7 },
                { uci: 'd2d4', probability: 0.3 }
            ];
            
            mockRandom.mockReturnValue(0.5);
            expect(LichessAPI.sampleMove(moves).uci).toBe('e2e4');
            
            mockRandom.mockReturnValue(0.8);
            expect(LichessAPI.sampleMove(moves).uci).toBe('d2d4');
        });

        it('should handle floating point probabilities correctly', () => {
            const moves = [
                { uci: 'e2e4', probability: 0.33333 },
                { uci: 'd2d4', probability: 0.33333 },
                { uci: 'c2c4', probability: 0.33334 }
            ];
            
            mockRandom.mockReturnValue(0.2);
            expect(LichessAPI.sampleMove(moves).uci).toBe('e2e4');
            
            mockRandom.mockReturnValue(0.4);
            expect(LichessAPI.sampleMove(moves).uci).toBe('d2d4');
            
            mockRandom.mockReturnValue(0.8);
            expect(LichessAPI.sampleMove(moves).uci).toBe('c2c4');
        });
    });

    describe('selectComputerMove', () => {
        it('should combine selectMoves and sampleMove correctly', () => {
            const moves = [
                { white: 60, black: 60, draws: 60, uci: 'e2e4' },
                { white: 40, black: 40, draws: 40, uci: 'd2d4' }
            ];
            
            vi.spyOn(LichessAPI, 'selectMoves').mockReturnValue([
                { uci: 'e2e4', probability: 0.6 },
                { uci: 'd2d4', probability: 0.4 }
            ]);
            
            vi.spyOn(Math, 'random').mockReturnValue(0.7);
            
            const result = LichessAPI.selectComputerMove(moves, 0.9, 10);
            expect(result.uci).toBe('d2d4');
        });
    });
}); 