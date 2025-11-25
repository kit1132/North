// オセロゲームのコアロジック

export type CellState = 'empty' | 'black' | 'white';
export type Player = 'black' | 'white';

export interface Position {
  row: number;
  col: number;
}

export interface GameState {
  board: CellState[][];
  currentPlayer: Player;
  isGameOver: boolean;
  winner: Player | 'draw' | null;
  blackScore: number;
  whiteScore: number;
  validMoves: Position[];
  lastMove: Position | null;
  flippedPieces: Position[];
}

export interface MoveResult {
  success: boolean;
  flippedPieces: Position[];
  newState: GameState;
}

const BOARD_SIZE = 8;
const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],          [0, 1],
  [1, -1],  [1, 0], [1, 1]
];

export class OthelloGame {
  private board: CellState[][];
  private currentPlayer: Player;
  private isGameOver: boolean;
  private winner: Player | 'draw' | null;
  private lastMove: Position | null;
  private flippedPieces: Position[];

  constructor() {
    this.board = this.createEmptyBoard();
    this.currentPlayer = 'black';
    this.isGameOver = false;
    this.winner = null;
    this.lastMove = null;
    this.flippedPieces = [];
    this.initializeBoard();
  }

  private createEmptyBoard(): CellState[][] {
    return Array(BOARD_SIZE).fill(null).map(() =>
      Array(BOARD_SIZE).fill('empty')
    );
  }

  private initializeBoard(): void {
    // 初期配置: 中央に2x2の駒を配置
    const mid = BOARD_SIZE / 2;
    this.board[mid - 1][mid - 1] = 'white';
    this.board[mid - 1][mid] = 'black';
    this.board[mid][mid - 1] = 'black';
    this.board[mid][mid] = 'white';
  }

  public reset(): void {
    this.board = this.createEmptyBoard();
    this.currentPlayer = 'black';
    this.isGameOver = false;
    this.winner = null;
    this.lastMove = null;
    this.flippedPieces = [];
    this.initializeBoard();
  }

  public getState(): GameState {
    return {
      board: this.board.map(row => [...row]),
      currentPlayer: this.currentPlayer,
      isGameOver: this.isGameOver,
      winner: this.winner,
      blackScore: this.countPieces('black'),
      whiteScore: this.countPieces('white'),
      validMoves: this.getValidMoves(this.currentPlayer),
      lastMove: this.lastMove,
      flippedPieces: [...this.flippedPieces]
    };
  }

  public getBoard(): CellState[][] {
    return this.board.map(row => [...row]);
  }

  public getCurrentPlayer(): Player {
    return this.currentPlayer;
  }

  private countPieces(player: Player): number {
    let count = 0;
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (this.board[row][col] === player) {
          count++;
        }
      }
    }
    return count;
  }

  public getValidMoves(player: Player): Position[] {
    const moves: Position[] = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (this.isValidMove(row, col, player)) {
          moves.push({ row, col });
        }
      }
    }
    return moves;
  }

  public isValidMove(row: number, col: number, player: Player): boolean {
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
      return false;
    }
    if (this.board[row][col] !== 'empty') {
      return false;
    }
    return this.getFlippablePieces(row, col, player).length > 0;
  }

  private getFlippablePieces(row: number, col: number, player: Player): Position[] {
    const opponent = player === 'black' ? 'white' : 'black';
    const allFlippable: Position[] = [];

    for (const [dr, dc] of DIRECTIONS) {
      const flippable: Position[] = [];
      let r = row + dr;
      let c = col + dc;

      // 相手の駒を探す
      while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && this.board[r][c] === opponent) {
        flippable.push({ row: r, col: c });
        r += dr;
        c += dc;
      }

      // 自分の駒で終わっていればフリップ可能
      if (flippable.length > 0 && r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && this.board[r][c] === player) {
        allFlippable.push(...flippable);
      }
    }

    return allFlippable;
  }

  public makeMove(row: number, col: number): MoveResult {
    if (this.isGameOver) {
      return { success: false, flippedPieces: [], newState: this.getState() };
    }

    if (!this.isValidMove(row, col, this.currentPlayer)) {
      return { success: false, flippedPieces: [], newState: this.getState() };
    }

    const flippable = this.getFlippablePieces(row, col, this.currentPlayer);

    // 駒を置く
    this.board[row][col] = this.currentPlayer;

    // 駒をひっくり返す
    for (const pos of flippable) {
      this.board[pos.row][pos.col] = this.currentPlayer;
    }

    this.lastMove = { row, col };
    this.flippedPieces = flippable;

    // ターンを切り替え
    this.switchTurn();

    return {
      success: true,
      flippedPieces: flippable,
      newState: this.getState()
    };
  }

  private switchTurn(): void {
    const opponent: Player = this.currentPlayer === 'black' ? 'white' : 'black';

    // 相手が打てる手があるか確認
    if (this.getValidMoves(opponent).length > 0) {
      this.currentPlayer = opponent;
      return;
    }

    // 相手が打てない場合、自分が続けて打てるか確認
    if (this.getValidMoves(this.currentPlayer).length > 0) {
      // パス - 自分のターンが続く
      return;
    }

    // どちらも打てない場合、ゲーム終了
    this.endGame();
  }

  private endGame(): void {
    this.isGameOver = true;
    const blackScore = this.countPieces('black');
    const whiteScore = this.countPieces('white');

    if (blackScore > whiteScore) {
      this.winner = 'black';
    } else if (whiteScore > blackScore) {
      this.winner = 'white';
    } else {
      this.winner = 'draw';
    }
  }

  // 盤面のクローンを作成（AI用）
  public clone(): OthelloGame {
    const newGame = new OthelloGame();
    newGame.board = this.board.map(row => [...row]);
    newGame.currentPlayer = this.currentPlayer;
    newGame.isGameOver = this.isGameOver;
    newGame.winner = this.winner;
    newGame.lastMove = this.lastMove ? { ...this.lastMove } : null;
    newGame.flippedPieces = [...this.flippedPieces];
    return newGame;
  }

  // 盤面を直接設定（AI用）
  public setBoardState(board: CellState[][], player: Player): void {
    this.board = board.map(row => [...row]);
    this.currentPlayer = player;
  }
}
