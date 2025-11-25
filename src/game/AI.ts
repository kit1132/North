// オセロAI - CPU対戦用

import { OthelloGame, Position, Player, CellState } from './OthelloGame';

export type AIDifficulty = 1 | 2 | 3; // 1: Easy, 2: Normal, 3: Hard

// 位置の評価値テーブル（角と辺の重み付け）
const POSITION_WEIGHTS = [
  [100, -20,  10,   5,   5,  10, -20, 100],
  [-20, -50,  -2,  -2,  -2,  -2, -50, -20],
  [ 10,  -2,   1,   1,   1,   1,  -2,  10],
  [  5,  -2,   1,   0,   0,   1,  -2,   5],
  [  5,  -2,   1,   0,   0,   1,  -2,   5],
  [ 10,  -2,   1,   1,   1,   1,  -2,  10],
  [-20, -50,  -2,  -2,  -2,  -2, -50, -20],
  [100, -20,  10,   5,   5,  10, -20, 100]
];

export class OthelloAI {
  private difficulty: AIDifficulty;

  constructor(difficulty: AIDifficulty = 2) {
    this.difficulty = difficulty;
  }

  public setDifficulty(difficulty: AIDifficulty): void {
    this.difficulty = difficulty;
  }

  public getDifficulty(): AIDifficulty {
    return this.difficulty;
  }

  public async getBestMove(game: OthelloGame): Promise<Position | null> {
    // 思考時間をシミュレート（より自然に見せる）
    const thinkingTime = 300 + Math.random() * 500;
    await new Promise(resolve => setTimeout(resolve, thinkingTime));

    const validMoves = game.getValidMoves(game.getCurrentPlayer());

    if (validMoves.length === 0) {
      return null;
    }

    switch (this.difficulty) {
      case 1:
        return this.getEasyMove(game, validMoves);
      case 2:
        return this.getNormalMove(game, validMoves);
      case 3:
        return this.getHardMove(game, validMoves);
      default:
        return this.getNormalMove(game, validMoves);
    }
  }

  // Easy: ランダム + たまに悪い手を選ぶ
  private getEasyMove(game: OthelloGame, validMoves: Position[]): Position {
    // 70%の確率でランダム、30%の確率で最も少ない駒を取る手を選ぶ
    if (Math.random() < 0.7) {
      return validMoves[Math.floor(Math.random() * validMoves.length)];
    }

    // 最も少ない駒を取る手を選ぶ（わざと悪い手）
    let worstMove = validMoves[0];
    let minFlips = Infinity;

    for (const move of validMoves) {
      const cloned = game.clone();
      const result = cloned.makeMove(move.row, move.col);
      const flips = result.flippedPieces.length;

      if (flips < minFlips) {
        minFlips = flips;
        worstMove = move;
      }
    }

    return worstMove;
  }

  // Normal: 位置評価 + 貪欲法
  private getNormalMove(game: OthelloGame, validMoves: Position[]): Position {
    let bestMove = validMoves[0];
    let bestScore = -Infinity;

    for (const move of validMoves) {
      const cloned = game.clone();
      const result = cloned.makeMove(move.row, move.col);

      // 位置の重み + 取れる駒の数
      const positionScore = POSITION_WEIGHTS[move.row][move.col];
      const flipScore = result.flippedPieces.length * 2;
      const score = positionScore + flipScore;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  // Hard: ミニマックス法 + αβカット
  private getHardMove(game: OthelloGame, validMoves: Position[]): Position {
    let bestMove = validMoves[0];
    let bestScore = -Infinity;
    const depth = 5; // 探索深度

    for (const move of validMoves) {
      const cloned = game.clone();
      cloned.makeMove(move.row, move.col);

      const score = this.minimax(cloned, depth - 1, -Infinity, Infinity, false);

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  private minimax(
    game: OthelloGame,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean
  ): number {
    const state = game.getState();

    if (depth === 0 || state.isGameOver) {
      return this.evaluate(game, 'white'); // AIは白
    }

    const validMoves = state.validMoves;

    if (validMoves.length === 0) {
      // パス
      return this.minimax(game, depth - 1, alpha, beta, !isMaximizing);
    }

    if (isMaximizing) {
      let maxScore = -Infinity;
      for (const move of validMoves) {
        const cloned = game.clone();
        cloned.makeMove(move.row, move.col);
        const score = this.minimax(cloned, depth - 1, alpha, beta, false);
        maxScore = Math.max(maxScore, score);
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break;
      }
      return maxScore;
    } else {
      let minScore = Infinity;
      for (const move of validMoves) {
        const cloned = game.clone();
        cloned.makeMove(move.row, move.col);
        const score = this.minimax(cloned, depth - 1, alpha, beta, true);
        minScore = Math.min(minScore, score);
        beta = Math.min(beta, score);
        if (beta <= alpha) break;
      }
      return minScore;
    }
  }

  private evaluate(game: OthelloGame, player: Player): number {
    const state = game.getState();
    const opponent: Player = player === 'black' ? 'white' : 'black';
    const board = state.board;

    let score = 0;

    // 1. 駒の数
    const playerCount = player === 'black' ? state.blackScore : state.whiteScore;
    const opponentCount = player === 'black' ? state.whiteScore : state.blackScore;

    if (state.isGameOver) {
      // ゲーム終了時は駒の数が最重要
      return (playerCount - opponentCount) * 1000;
    }

    // 2. 位置評価
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (board[row][col] === player) {
          score += POSITION_WEIGHTS[row][col];
        } else if (board[row][col] === opponent) {
          score -= POSITION_WEIGHTS[row][col];
        }
      }
    }

    // 3. 角の確保
    const corners = [[0, 0], [0, 7], [7, 0], [7, 7]];
    for (const [r, c] of corners) {
      if (board[r][c] === player) {
        score += 50;
      } else if (board[r][c] === opponent) {
        score -= 50;
      }
    }

    // 4. 動ける手の数（機動性）
    const playerMoves = game.getValidMoves(player).length;
    const opponentMoves = game.getValidMoves(opponent).length;
    score += (playerMoves - opponentMoves) * 5;

    // 5. 安定した駒（辺に沿った駒）
    score += this.countStablePieces(board, player) * 10;
    score -= this.countStablePieces(board, opponent) * 10;

    return score;
  }

  private countStablePieces(board: CellState[][], player: Player): number {
    let count = 0;

    // 角から始まる安定した駒をカウント
    const corners = [
      { corner: [0, 0], dirs: [[0, 1], [1, 0]] },
      { corner: [0, 7], dirs: [[0, -1], [1, 0]] },
      { corner: [7, 0], dirs: [[0, 1], [-1, 0]] },
      { corner: [7, 7], dirs: [[0, -1], [-1, 0]] }
    ];

    for (const { corner, dirs } of corners) {
      const [cr, cc] = corner;
      if (board[cr][cc] === player) {
        count++;
        // 角から辺に沿って安定した駒をカウント
        for (const [dr, dc] of dirs) {
          let r = cr + dr;
          let c = cc + dc;
          while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] === player) {
            count++;
            r += dr;
            c += dc;
          }
        }
      }
    }

    return count;
  }
}
