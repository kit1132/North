// WebXRセッション管理

import * as THREE from 'three';
import { Position } from '../game/OthelloGame';

export type XRSessionType = 'immersive-vr' | 'immersive-ar' | 'inline';

export interface XRControllerState {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  isSelecting: boolean;
  controller: THREE.Group;
}

export class WebXRManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private xrSession: XRSession | null = null;
  private controllers: XRControllerState[] = [];
  private controllerGrips: THREE.Group[] = [];
  private isVRSupported: boolean = false;
  private onSelectCallback: ((position: Position) => void) | null = null;
  private raycaster: THREE.Raycaster;
  private tempMatrix: THREE.Matrix4;
  private boardPlane: THREE.Plane;
  private intersectPoint: THREE.Vector3;

  // VR用の追加オブジェクト
  private vrUI: THREE.Group | null = null;
  private controllerModels: THREE.Group[] = [];

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.tempMatrix = new THREE.Matrix4();
    this.boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.intersectPoint = new THREE.Vector3();

    this.checkVRSupport();
    this.setupControllers();
  }

  private async checkVRSupport(): Promise<void> {
    if ('xr' in navigator) {
      try {
        this.isVRSupported = await navigator.xr!.isSessionSupported('immersive-vr');
      } catch {
        this.isVRSupported = false;
      }
    }
  }

  public isSupported(): boolean {
    return this.isVRSupported;
  }

  public async startSession(): Promise<boolean> {
    if (!this.isVRSupported) {
      console.warn('WebXR VR not supported');
      return false;
    }

    try {
      const sessionInit: XRSessionInit = {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
      };

      this.xrSession = await navigator.xr!.requestSession('immersive-vr', sessionInit);

      await this.renderer.xr.setSession(this.xrSession);

      this.xrSession.addEventListener('end', this.onSessionEnd.bind(this));

      // VR用のUIを作成
      this.createVRUI();

      console.log('WebXR session started');
      return true;
    } catch (error) {
      console.error('Failed to start WebXR session:', error);
      return false;
    }
  }

  public async endSession(): Promise<void> {
    if (this.xrSession) {
      await this.xrSession.end();
    }
  }

  private onSessionEnd(): void {
    this.xrSession = null;
    this.removeVRUI();
    console.log('WebXR session ended');
  }

  public isInSession(): boolean {
    return this.xrSession !== null;
  }

  private setupControllers(): void {
    // コントローラー0（通常は右手）
    const controller0 = this.renderer.xr.getController(0);
    controller0.addEventListener('selectstart', () => this.onSelectStart(0));
    controller0.addEventListener('selectend', () => this.onSelectEnd(0));
    controller0.addEventListener('connected', (event) => this.onControllerConnected(event, 0));
    controller0.addEventListener('disconnected', () => this.onControllerDisconnected(0));
    this.scene.add(controller0);

    // コントローラー1（通常は左手）
    const controller1 = this.renderer.xr.getController(1);
    controller1.addEventListener('selectstart', () => this.onSelectStart(1));
    controller1.addEventListener('selectend', () => this.onSelectEnd(1));
    controller1.addEventListener('connected', (event) => this.onControllerConnected(event, 1));
    controller1.addEventListener('disconnected', () => this.onControllerDisconnected(1));
    this.scene.add(controller1);

    // コントローラーグリップ
    const controllerGrip0 = this.renderer.xr.getControllerGrip(0);
    const controllerGrip1 = this.renderer.xr.getControllerGrip(1);
    this.scene.add(controllerGrip0);
    this.scene.add(controllerGrip1);
    this.controllerGrips = [controllerGrip0, controllerGrip1];

    // コントローラーの状態を初期化
    this.controllers = [
      {
        position: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        isSelecting: false,
        controller: controller0
      },
      {
        position: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        isSelecting: false,
        controller: controller1
      }
    ];

    // レイ（光線）の可視化
    this.createControllerRays();
  }

  private createControllerRays(): void {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -3)
    ]);

    for (let i = 0; i < 2; i++) {
      const material = new THREE.LineBasicMaterial({
        color: i === 0 ? 0x00ff00 : 0x0088ff,
        transparent: true,
        opacity: 0.5
      });
      const line = new THREE.Line(geometry, material);
      line.name = 'controllerRay';
      this.controllers[i].controller.add(line);
    }
  }

  private onControllerConnected(event: { data: XRInputSource }, index: number): void {
    const inputSource = event.data;

    // コントローラーモデルの作成
    const controllerModel = this.buildControllerModel(inputSource);
    this.controllerGrips[index].add(controllerModel);
    this.controllerModels[index] = controllerModel;

    console.log(`Controller ${index} connected:`, inputSource.handedness);
  }

  private onControllerDisconnected(index: number): void {
    if (this.controllerModels[index]) {
      this.controllerGrips[index].remove(this.controllerModels[index]);
    }
    console.log(`Controller ${index} disconnected`);
  }

  private buildControllerModel(inputSource: XRInputSource): THREE.Group {
    const group = new THREE.Group();

    // シンプルなコントローラー形状
    const bodyGeometry = new THREE.CylinderGeometry(0.02, 0.025, 0.1, 16);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: inputSource.handedness === 'right' ? 0x333333 : 0x444444,
      roughness: 0.5,
      metalness: 0.5
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.x = Math.PI / 4;
    group.add(body);

    // トリガー部分
    const triggerGeometry = new THREE.BoxGeometry(0.02, 0.04, 0.02);
    const triggerMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.3
    });
    const trigger = new THREE.Mesh(triggerGeometry, triggerMaterial);
    trigger.position.set(0, -0.02, 0.03);
    group.add(trigger);

    return group;
  }

  private onSelectStart(index: number): void {
    this.controllers[index].isSelecting = true;

    // ボードとの交差判定
    const controller = this.controllers[index].controller;
    this.tempMatrix.identity().extractRotation(controller.matrixWorld);

    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

    // ボード平面との交差
    if (this.raycaster.ray.intersectPlane(this.boardPlane, this.intersectPoint)) {
      const position = this.worldToBoardPosition(this.intersectPoint);
      if (position && this.onSelectCallback) {
        this.onSelectCallback(position);
      }
    }

    // レイの色を変更
    const ray = controller.getObjectByName('controllerRay') as THREE.Line;
    if (ray) {
      (ray.material as THREE.LineBasicMaterial).color.setHex(0xff0000);
    }
  }

  private onSelectEnd(index: number): void {
    this.controllers[index].isSelecting = false;

    // レイの色を戻す
    const ray = this.controllers[index].controller.getObjectByName('controllerRay') as THREE.Line;
    if (ray) {
      (ray.material as THREE.LineBasicMaterial).color.setHex(index === 0 ? 0x00ff00 : 0x0088ff);
    }
  }

  private worldToBoardPosition(point: THREE.Vector3): Position | null {
    const BOARD_SIZE = 8;
    const CELL_SIZE = 0.5;
    const BOARD_TOTAL_SIZE = BOARD_SIZE * CELL_SIZE;

    // ボード範囲内かチェック
    const halfSize = BOARD_TOTAL_SIZE / 2;
    if (Math.abs(point.x) > halfSize || Math.abs(point.z) > halfSize) {
      return null;
    }

    // セル位置を計算
    const col = Math.floor((point.x + halfSize) / CELL_SIZE);
    const row = Math.floor((point.z + halfSize) / CELL_SIZE);

    if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
      return { row, col };
    }

    return null;
  }

  public setOnSelectCallback(callback: (position: Position) => void): void {
    this.onSelectCallback = callback;
  }

  private createVRUI(): void {
    this.vrUI = new THREE.Group();
    this.vrUI.position.set(0, 1.5, -1.5);

    // スコアボード背景
    const bgGeometry = new THREE.PlaneGeometry(1.2, 0.4);
    const bgMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    });
    const background = new THREE.Mesh(bgGeometry, bgMaterial);
    this.vrUI.add(background);

    // テキストは Canvas テクスチャで作成
    this.updateVRUIText('Your Turn', 2, 2);

    this.scene.add(this.vrUI);
  }

  public updateVRUIText(turnText: string, blackScore: number, whiteScore: number): void {
    if (!this.vrUI) return;

    // 既存のテキストメッシュを削除
    const existingText = this.vrUI.getObjectByName('scoreText');
    if (existingText) {
      this.vrUI.remove(existingText);
    }

    // Canvas でテキストを描画
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // 背景をクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // テキストを描画
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(turnText, 256, 40);

    ctx.font = '24px Arial';
    ctx.fillText(`⚫ ${blackScore}  -  ${whiteScore} ⚪`, 256, 90);

    // テクスチャを作成
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide
    });

    const geometry = new THREE.PlaneGeometry(1, 0.25);
    const textMesh = new THREE.Mesh(geometry, material);
    textMesh.name = 'scoreText';
    textMesh.position.z = 0.01;

    this.vrUI.add(textMesh);
  }

  private removeVRUI(): void {
    if (this.vrUI) {
      this.scene.remove(this.vrUI);
      this.vrUI = null;
    }
  }

  public update(): void {
    // コントローラーの位置を更新
    for (const state of this.controllers) {
      state.position.setFromMatrixPosition(state.controller.matrixWorld);
      this.tempMatrix.identity().extractRotation(state.controller.matrixWorld);
      state.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);
    }

    // VR UI をカメラの方に向ける
    if (this.vrUI && this.isInSession()) {
      const cameraPosition = new THREE.Vector3();
      this.camera.getWorldPosition(cameraPosition);
      this.vrUI.lookAt(cameraPosition);
    }
  }

  public getControllerStates(): XRControllerState[] {
    return this.controllers;
  }

  public dispose(): void {
    this.endSession();
    this.removeVRUI();
  }
}
