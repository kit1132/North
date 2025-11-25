// WebXR オセロゲーム - メインエントリーポイント

import { OthelloGame, Position, GameState, Player } from './game/OthelloGame';
import { OthelloAI, AIDifficulty } from './game/AI';
import { GameRenderer } from './renderer/GameRenderer';
import { WebXRManager } from './xr/WebXRManager';
import { soundManager } from './audio/SoundManager';

class OthelloApp {
  private game: OthelloGame;
  private ai: OthelloAI;
  private renderer: GameRenderer;
  private xrManager: WebXRManager;

  // UI要素
  private menuOverlay!: HTMLElement;
  private gameUI!: HTMLElement;
  private gameControls!: HTMLElement;
  private resultOverlay!: HTMLElement;
  private blackScoreEl!: HTMLElement;
  private whiteScoreEl!: HTMLElement;
  private turnIndicator!: HTMLElement;
  private vrButton!: HTMLElement;
  private vrStatus!: HTMLElement;

  // ゲーム状態
  private isPlaying: boolean = false;
  private isPlayerTurn: boolean = true;
  private playerColor: Player = 'black';
  private showHints: boolean = true;
  private soundEnabled: boolean = true;
  private difficulty: AIDifficulty = 2;

  constructor() {
    this.game = new OthelloGame();
    this.ai = new OthelloAI(this.difficulty);

    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new GameRenderer(canvas);
    this.xrManager = new WebXRManager(
      this.renderer.getRenderer(),
      this.renderer.getScene(),
      this.renderer.getCamera()
    );

    this.initUI();
    this.initEventListeners();
    this.startRenderLoop();
    this.checkVRSupport();
  }

  private initUI(): void {
    this.menuOverlay = document.getElementById('menu-overlay')!;
    this.gameUI = document.getElementById('game-ui')!;
    this.gameControls = document.getElementById('game-controls')!;
    this.resultOverlay = document.getElementById('result-overlay')!;
    this.blackScoreEl = document.getElementById('black-score')!;
    this.whiteScoreEl = document.getElementById('white-score')!;
    this.turnIndicator = document.getElementById('turn-indicator')!;
    this.vrButton = document.getElementById('start-vr')!;
    this.vrStatus = document.getElementById('vr-status')!;
  }

  private initEventListeners(): void {
    // メニューボタン
    document.getElementById('start-game')!.addEventListener('click', () => {
      this.startGame(false);
    });

    document.getElementById('start-vr')!.addEventListener('click', () => {
      this.startGame(true);
    });

    // 難易度選択
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('selected'));
        (e.target as HTMLElement).classList.add('selected');
        this.difficulty = parseInt((e.target as HTMLElement).dataset.level!) as AIDifficulty;
        this.ai.setDifficulty(this.difficulty);
        soundManager.play('click');
      });
    });

    // ゲームコントロール
    document.getElementById('hint-btn')!.addEventListener('click', () => {
      this.toggleHints();
    });

    document.getElementById('sound-btn')!.addEventListener('click', () => {
      this.toggleSound();
    });

    document.getElementById('restart-btn')!.addEventListener('click', () => {
      this.restartGame();
    });

    document.getElementById('menu-btn')!.addEventListener('click', () => {
      this.returnToMenu();
    });

    // 結果画面
    document.getElementById('play-again')!.addEventListener('click', () => {
      this.restartGame();
    });

    document.getElementById('back-to-menu')!.addEventListener('click', () => {
      this.returnToMenu();
    });

    // キャンバスクリック（駒を置く）
    const canvas = this.renderer.getRenderer().domElement;
    canvas.addEventListener('click', (e) => this.onCanvasClick(e));
    canvas.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));
    canvas.addEventListener('mouseleave', () => this.renderer.updateHover(null));

    // WebXRからの選択
    this.xrManager.setOnSelectCallback((position) => {
      this.handleMove(position);
    });
  }

  private async checkVRSupport(): Promise<void> {
    // 少し待ってからチェック（XRの初期化を待つ）
    await new Promise(resolve => setTimeout(resolve, 500));

    if (this.xrManager.isSupported()) {
      this.vrButton.classList.remove('disabled');
      this.vrStatus.textContent = 'VRヘッドセットが検出されました';
    } else {
      (this.vrButton as HTMLButtonElement).disabled = true;
      this.vrStatus.textContent = 'VRは利用できません（対応デバイスがありません）';
    }
  }

  private async startGame(vrMode: boolean): Promise<void> {
    await soundManager.ensureContext();
    soundManager.play('click');

    if (vrMode) {
      const success = await this.xrManager.startSession();
      if (!success) {
        alert('VRセッションを開始できませんでした');
        return;
      }
    }

    this.game.reset();
    this.isPlaying = true;
    this.isPlayerTurn = true;
    this.playerColor = 'black';

    // UIの切り替え
    this.menuOverlay.classList.add('hidden');
    this.resultOverlay.classList.add('hidden');
    this.gameUI.classList.remove('hidden');
    this.gameControls.classList.remove('hidden');

    this.updateGameDisplay();
  }

  private restartGame(): void {
    soundManager.play('click');
    this.game.reset();
    this.isPlayerTurn = true;
    this.resultOverlay.classList.add('hidden');
    this.updateGameDisplay();
  }

  private returnToMenu(): void {
    soundManager.play('click');
    this.isPlaying = false;

    if (this.xrManager.isInSession()) {
      this.xrManager.endSession();
    }

    this.menuOverlay.classList.remove('hidden');
    this.gameUI.classList.add('hidden');
    this.gameControls.classList.add('hidden');
    this.resultOverlay.classList.add('hidden');

    // ボードをリセット
    this.game.reset();
    this.renderer.updateBoard(this.game.getState());
    this.renderer.clearValidMoves();
    this.renderer.updateHover(null);
  }

  private toggleHints(): void {
    this.showHints = !this.showHints;
    const btn = document.getElementById('hint-btn')!;
    btn.textContent = this.showHints ? '💡 ヒント' : '💡 ヒントOFF';
    soundManager.play('click');
    this.updateValidMoveDisplay();
  }

  private toggleSound(): void {
    this.soundEnabled = !this.soundEnabled;
    soundManager.setEnabled(this.soundEnabled);
    const btn = document.getElementById('sound-btn')!;
    btn.textContent = this.soundEnabled ? '🔊 サウンド' : '🔇 サウンドOFF';
  }

  private onCanvasClick(e: MouseEvent): void {
    if (!this.isPlaying || !this.isPlayerTurn) return;

    const state = this.game.getState();
    const result = this.renderer.raycastBoard(e.clientX, e.clientY, state.validMoves);

    if (result.position) {
      this.handleMove(result.position);
    }
  }

  private onCanvasMouseMove(e: MouseEvent): void {
    if (!this.isPlaying) return;

    const state = this.game.getState();
    const result = this.renderer.raycastBoard(e.clientX, e.clientY, state.validMoves);

    if (result.position && result.isValid && this.isPlayerTurn) {
      this.renderer.updateHover(result.position);
    } else {
      this.renderer.updateHover(null);
    }
  }

  private async handleMove(position: Position): Promise<void> {
    if (!this.isPlaying || !this.isPlayerTurn) return;

    const state = this.game.getState();
    const isValid = state.validMoves.some(
      m => m.row === position.row && m.col === position.col
    );

    if (!isValid) {
      soundManager.play('invalid');
      return;
    }

    // プレイヤーの手を実行
    const result = this.game.makeMove(position.row, position.col);

    if (result.success) {
      soundManager.play('place');

      // 駒をひっくり返す音
      if (result.flippedPieces.length > 0) {
        setTimeout(() => {
          soundManager.playFlipSequence(result.flippedPieces.length);
        }, 100);
      }

      this.updateGameDisplay();

      // ゲーム終了チェック
      if (result.newState.isGameOver) {
        this.showResult(result.newState);
        return;
      }

      // CPUのターンへ
      if (result.newState.currentPlayer !== this.playerColor) {
        this.isPlayerTurn = false;
        await this.cpuTurn();
      }
    }
  }

  private async cpuTurn(): Promise<void> {
    this.updateTurnIndicator(false);

    // CPUが考える
    const move = await this.ai.getBestMove(this.game);

    if (move) {
      const result = this.game.makeMove(move.row, move.col);

      if (result.success) {
        soundManager.play('place');

        if (result.flippedPieces.length > 0) {
          setTimeout(() => {
            soundManager.playFlipSequence(result.flippedPieces.length);
          }, 100);
        }

        this.updateGameDisplay();

        // ゲーム終了チェック
        if (result.newState.isGameOver) {
          this.showResult(result.newState);
          return;
        }

        // プレイヤーのターンが回ってきたか確認
        if (result.newState.currentPlayer === this.playerColor) {
          this.isPlayerTurn = true;
          soundManager.play('turn');
        } else {
          // パスされた場合、CPUが続けて打つ
          await this.cpuTurn();
        }
      }
    } else {
      // CPUがパス
      this.isPlayerTurn = true;
      const state = this.game.getState();
      if (state.validMoves.length === 0) {
        // 両者パスでゲーム終了
        this.showResult(state);
      }
    }

    this.updateTurnIndicator(this.isPlayerTurn);
  }

  private updateGameDisplay(): void {
    const state = this.game.getState();

    // ボードを更新
    this.renderer.updateBoard(state);

    // スコアを更新
    this.blackScoreEl.textContent = state.blackScore.toString();
    this.whiteScoreEl.textContent = state.whiteScore.toString();

    // 有効な手を表示
    this.updateValidMoveDisplay();

    // 最後の手を表示
    this.renderer.showLastMove(state.lastMove);

    // ターン表示
    this.updateTurnIndicator(this.isPlayerTurn);

    // WebXR UIの更新
    if (this.xrManager.isInSession()) {
      const turnText = this.isPlayerTurn ? 'Your Turn' : 'CPU Thinking...';
      this.xrManager.updateVRUIText(turnText, state.blackScore, state.whiteScore);
    }
  }

  private updateValidMoveDisplay(): void {
    const state = this.game.getState();

    if (this.showHints && this.isPlayerTurn && state.currentPlayer === this.playerColor) {
      this.renderer.showValidMoves(state.validMoves);
    } else {
      this.renderer.clearValidMoves();
    }
  }

  private updateTurnIndicator(isPlayer: boolean): void {
    if (isPlayer) {
      this.turnIndicator.textContent = 'あなたのターン';
      this.turnIndicator.style.color = '#00ff00';

      // スコアパネルのアニメーション
      document.querySelector('.score-panel.black')?.classList.add('current-turn');
      document.querySelector('.score-panel.white')?.classList.remove('current-turn');
    } else {
      this.turnIndicator.textContent = 'CPUが考え中...';
      this.turnIndicator.style.color = '#ffaa00';

      document.querySelector('.score-panel.black')?.classList.remove('current-turn');
      document.querySelector('.score-panel.white')?.classList.add('current-turn');
    }
  }

  private showResult(state: GameState): void {
    this.isPlaying = false;

    const resultTitle = document.getElementById('result-title')!;
    const resultScore = document.getElementById('result-score')!;

    resultScore.textContent = `黒: ${state.blackScore} - 白: ${state.whiteScore}`;

    if (state.winner === this.playerColor) {
      resultTitle.textContent = '🎉 勝利！';
      resultTitle.style.color = '#00ff00';
      soundManager.play('win');
    } else if (state.winner === 'draw') {
      resultTitle.textContent = '🤝 引き分け';
      resultTitle.style.color = '#ffaa00';
      soundManager.play('draw');
    } else {
      resultTitle.textContent = '😢 敗北...';
      resultTitle.style.color = '#ff4444';
      soundManager.play('lose');
    }

    // 少し待ってから結果を表示
    setTimeout(() => {
      this.resultOverlay.classList.remove('hidden');
    }, 1000);
  }

  private startRenderLoop(): void {
    this.renderer.startAnimationLoop(() => {
      // WebXRの更新
      if (this.xrManager.isInSession()) {
        this.xrManager.update();
      }
    });

    // 初期ボード表示
    this.renderer.updateBoard(this.game.getState());
  }
}

// アプリケーションの起動
document.addEventListener('DOMContentLoaded', () => {
  new OthelloApp();
});
