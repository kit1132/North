// Three.jsを使った3Dゲームレンダラー

import * as THREE from 'three';
import { CellState, Position, GameState } from '../game/OthelloGame';

const BOARD_SIZE = 8;
const CELL_SIZE = 0.5;
const BOARD_TOTAL_SIZE = BOARD_SIZE * CELL_SIZE;
const PIECE_RADIUS = 0.2;
const PIECE_HEIGHT = 0.08;

interface PieceMesh extends THREE.Mesh {
  userData: {
    row: number;
    col: number;
    isFlipping?: boolean;
    targetRotation?: number;
  };
}

export interface RaycastResult {
  position: Position | null;
  isValid: boolean;
}

export class GameRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private boardGroup: THREE.Group;
  private piecesGroup: THREE.Group;
  private highlightGroup: THREE.Group;
  private pieces: Map<string, PieceMesh> = new Map();
  private validMoveMarkers: THREE.Mesh[] = [];
  private hoverMarker: THREE.Mesh | null = null;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private cellMeshes: THREE.Mesh[] = [];
  private animationMixers: THREE.AnimationMixer[] = [];

  // マテリアル
  private blackMaterial: THREE.MeshStandardMaterial;
  private whiteMaterial: THREE.MeshStandardMaterial;
  private boardMaterial: THREE.MeshStandardMaterial;
  private cellMaterial: THREE.MeshStandardMaterial;
  private validMoveMaterial: THREE.MeshBasicMaterial;
  private hoverMaterial: THREE.MeshBasicMaterial;
  private lastMoveMaterial: THREE.MeshBasicMaterial;

  constructor(canvas: HTMLCanvasElement) {
    // シーンの作成
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // カメラの設定
    this.camera = new THREE.PerspectiveCamera(
      60,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 4, 3);
    this.camera.lookAt(0, 0, 0);

    // レンダラーの設定
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;

    // グループの作成
    this.boardGroup = new THREE.Group();
    this.piecesGroup = new THREE.Group();
    this.highlightGroup = new THREE.Group();
    this.scene.add(this.boardGroup);
    this.scene.add(this.piecesGroup);
    this.scene.add(this.highlightGroup);

    // マテリアルの作成
    this.blackMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.3,
      metalness: 0.1
    });

    this.whiteMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5f5f5,
      roughness: 0.3,
      metalness: 0.1
    });

    this.boardMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d5a27,
      roughness: 0.8
    });

    this.cellMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e4620,
      roughness: 0.9
    });

    this.validMoveMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.3
    });

    this.hoverMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.5
    });

    this.lastMoveMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.4
    });

    // レイキャスター
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // シーンの構築
    this.createLights();
    this.createBoard();
    this.createHoverMarker();

    // ウィンドウリサイズ対応
    window.addEventListener('resize', this.onResize.bind(this));
  }

  private createLights(): void {
    // 環境光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    // メインのディレクショナルライト
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(5, 10, 5);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 50;
    mainLight.shadow.camera.left = -10;
    mainLight.shadow.camera.right = 10;
    mainLight.shadow.camera.top = 10;
    mainLight.shadow.camera.bottom = -10;
    this.scene.add(mainLight);

    // 補助ライト
    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    fillLight.position.set(-5, 5, -5);
    this.scene.add(fillLight);

    // ポイントライト（ゲーム盤の上）
    const pointLight = new THREE.PointLight(0xffffcc, 0.5, 10);
    pointLight.position.set(0, 3, 0);
    this.scene.add(pointLight);
  }

  private createBoard(): void {
    // ボードベース
    const baseGeometry = new THREE.BoxGeometry(
      BOARD_TOTAL_SIZE + 0.4,
      0.2,
      BOARD_TOTAL_SIZE + 0.4
    );
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3728,
      roughness: 0.7
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = -0.1;
    base.receiveShadow = true;
    this.boardGroup.add(base);

    // セル
    const cellGeometry = new THREE.BoxGeometry(CELL_SIZE - 0.02, 0.05, CELL_SIZE - 0.02);

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = new THREE.Mesh(cellGeometry, this.cellMaterial);
        const pos = this.boardPositionToWorld(row, col);
        cell.position.set(pos.x, 0.025, pos.z);
        cell.receiveShadow = true;
        cell.userData = { row, col };
        this.boardGroup.add(cell);
        this.cellMeshes.push(cell);
      }
    }

    // グリッドライン
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });

    for (let i = 0; i <= BOARD_SIZE; i++) {
      const offset = (i - BOARD_SIZE / 2) * CELL_SIZE;

      // 横線
      const hPoints = [
        new THREE.Vector3(-BOARD_TOTAL_SIZE / 2, 0.051, offset),
        new THREE.Vector3(BOARD_TOTAL_SIZE / 2, 0.051, offset)
      ];
      const hGeometry = new THREE.BufferGeometry().setFromPoints(hPoints);
      const hLine = new THREE.Line(hGeometry, lineMaterial);
      this.boardGroup.add(hLine);

      // 縦線
      const vPoints = [
        new THREE.Vector3(offset, 0.051, -BOARD_TOTAL_SIZE / 2),
        new THREE.Vector3(offset, 0.051, BOARD_TOTAL_SIZE / 2)
      ];
      const vGeometry = new THREE.BufferGeometry().setFromPoints(vPoints);
      const vLine = new THREE.Line(vGeometry, lineMaterial);
      this.boardGroup.add(vLine);
    }

    // 中央の4つの点
    const dotGeometry = new THREE.CircleGeometry(0.03, 16);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const dotPositions = [
      [-1.5, -1.5], [-1.5, 1.5], [1.5, -1.5], [1.5, 1.5]
    ];

    for (const [x, z] of dotPositions) {
      const dot = new THREE.Mesh(dotGeometry, dotMaterial);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(x * CELL_SIZE, 0.052, z * CELL_SIZE);
      this.boardGroup.add(dot);
    }
  }

  private createHoverMarker(): void {
    const geometry = new THREE.RingGeometry(PIECE_RADIUS * 0.8, PIECE_RADIUS, 32);
    this.hoverMarker = new THREE.Mesh(geometry, this.hoverMaterial);
    this.hoverMarker.rotation.x = -Math.PI / 2;
    this.hoverMarker.position.y = 0.06;
    this.hoverMarker.visible = false;
    this.highlightGroup.add(this.hoverMarker);
  }

  private boardPositionToWorld(row: number, col: number): THREE.Vector3 {
    const x = (col - BOARD_SIZE / 2 + 0.5) * CELL_SIZE;
    const z = (row - BOARD_SIZE / 2 + 0.5) * CELL_SIZE;
    return new THREE.Vector3(x, 0, z);
  }

  public createPiece(row: number, col: number, color: 'black' | 'white'): PieceMesh {
    const geometry = new THREE.CylinderGeometry(
      PIECE_RADIUS,
      PIECE_RADIUS,
      PIECE_HEIGHT,
      32
    );

    // 両面のマテリアル（黒は下、白は上）
    const materials = color === 'black'
      ? [this.blackMaterial, this.blackMaterial, this.whiteMaterial]
      : [this.whiteMaterial, this.whiteMaterial, this.blackMaterial];

    const mesh = new THREE.Mesh(geometry, materials[0]) as PieceMesh;
    const pos = this.boardPositionToWorld(row, col);
    mesh.position.set(pos.x, PIECE_HEIGHT / 2 + 0.05, pos.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { row, col };

    // 白の場合は最初から反転
    if (color === 'white') {
      mesh.rotation.x = Math.PI;
      mesh.material = this.whiteMaterial;
    }

    return mesh;
  }

  public updateBoard(state: GameState): void {
    const { board, lastMove, flippedPieces } = state;

    // 新しい駒を追加、既存の駒を更新
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = board[row][col];
        const key = `${row}-${col}`;
        const existingPiece = this.pieces.get(key);

        if (cell === 'empty') {
          if (existingPiece) {
            this.piecesGroup.remove(existingPiece);
            this.pieces.delete(key);
          }
        } else {
          if (!existingPiece) {
            // 新しい駒を作成
            const piece = this.createPiece(row, col, cell);

            // 置いたばかりの駒にはアニメーション
            if (lastMove && lastMove.row === row && lastMove.col === col) {
              this.animatePieceDrop(piece);
            }

            this.piecesGroup.add(piece);
            this.pieces.set(key, piece);
          } else {
            // 裏返しが必要か確認
            const isFlipped = flippedPieces.some(p => p.row === row && p.col === col);
            if (isFlipped) {
              this.animatePieceFlip(existingPiece, cell);
            }
          }
        }
      }
    }
  }

  private animatePieceDrop(piece: PieceMesh): void {
    const startY = 1;
    const endY = PIECE_HEIGHT / 2 + 0.05;
    piece.position.y = startY;

    const animate = (progress: number) => {
      // イージング関数（バウンス効果）
      const eased = 1 - Math.pow(1 - progress, 3);
      piece.position.y = startY + (endY - startY) * eased;

      if (progress < 1) {
        requestAnimationFrame(() => animate(progress + 0.05));
      }
    };

    animate(0);
  }

  private animatePieceFlip(piece: PieceMesh, newColor: CellState): void {
    if (piece.userData.isFlipping) return;
    piece.userData.isFlipping = true;

    const startRotation = piece.rotation.x;
    const endRotation = startRotation + Math.PI;
    const duration = 300; // ms
    const startTime = performance.now();

    const newMaterial = newColor === 'black' ? this.blackMaterial : this.whiteMaterial;

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // イージング
      const eased = 0.5 - Math.cos(progress * Math.PI) / 2;
      piece.rotation.x = startRotation + (endRotation - startRotation) * eased;

      // 半分を超えたらマテリアルを変更
      if (progress >= 0.5 && piece.material !== newMaterial) {
        piece.material = newMaterial;
      }

      // ジャンプ効果
      const jumpHeight = Math.sin(progress * Math.PI) * 0.2;
      piece.position.y = PIECE_HEIGHT / 2 + 0.05 + jumpHeight;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        piece.userData.isFlipping = false;
      }
    };

    animate();
  }

  public showValidMoves(moves: Position[]): void {
    // 既存のマーカーを削除
    this.clearValidMoves();

    const geometry = new THREE.CircleGeometry(PIECE_RADIUS * 0.6, 32);

    for (const move of moves) {
      const marker = new THREE.Mesh(geometry, this.validMoveMaterial);
      const pos = this.boardPositionToWorld(move.row, move.col);
      marker.position.set(pos.x, 0.06, pos.z);
      marker.rotation.x = -Math.PI / 2;
      marker.userData = { row: move.row, col: move.col };
      this.highlightGroup.add(marker);
      this.validMoveMarkers.push(marker);
    }
  }

  public clearValidMoves(): void {
    for (const marker of this.validMoveMarkers) {
      this.highlightGroup.remove(marker);
    }
    this.validMoveMarkers = [];
  }

  public showLastMove(position: Position | null): void {
    // 既存のラストムーブマーカーを削除
    const existingMarker = this.highlightGroup.getObjectByName('lastMoveMarker');
    if (existingMarker) {
      this.highlightGroup.remove(existingMarker);
    }

    if (position) {
      const geometry = new THREE.RingGeometry(PIECE_RADIUS * 0.9, PIECE_RADIUS * 1.1, 32);
      const marker = new THREE.Mesh(geometry, this.lastMoveMaterial);
      const pos = this.boardPositionToWorld(position.row, position.col);
      marker.position.set(pos.x, 0.07, pos.z);
      marker.rotation.x = -Math.PI / 2;
      marker.name = 'lastMoveMarker';
      this.highlightGroup.add(marker);
    }
  }

  public updateHover(position: Position | null): void {
    if (!this.hoverMarker) return;

    if (position) {
      const pos = this.boardPositionToWorld(position.row, position.col);
      this.hoverMarker.position.set(pos.x, 0.06, pos.z);
      this.hoverMarker.visible = true;
    } else {
      this.hoverMarker.visible = false;
    }
  }

  public raycastBoard(clientX: number, clientY: number, validMoves: Position[]): RaycastResult {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.cellMeshes);

    if (intersects.length > 0) {
      const cell = intersects[0].object;
      const { row, col } = cell.userData;
      const position = { row, col };
      const isValid = validMoves.some(m => m.row === row && m.col === col);
      return { position, isValid };
    }

    return { position: null, isValid: false };
  }

  public getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  public getScene(): THREE.Scene {
    return this.scene;
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  private onResize(): void {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  public startAnimationLoop(callback?: () => void): void {
    this.renderer.setAnimationLoop(() => {
      if (callback) callback();
      this.render();
    });
  }

  public stopAnimationLoop(): void {
    this.renderer.setAnimationLoop(null);
  }

  public dispose(): void {
    this.stopAnimationLoop();
    this.renderer.dispose();

    // マテリアルとジオメトリの解放
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }
}
