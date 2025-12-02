/// <reference path="./types/ammo.d.ts" />
import * as THREE from "https://esm.sh/three@0.181.2";
import { OrbitControls } from "https://esm.sh/three@0.181.2/examples/jsm/controls/OrbitControls.js";
import { addBody, createBox, createHole } from "./utils.ts";

// Ammo.js physics types
interface AmmoVector3 {
  x(): number;
  y(): number;
  z(): number;
}

interface AmmoTransform {
  getOrigin(): AmmoVector3;
}

interface AmmoMotionState {
  getWorldTransform(transform: AmmoTransform): void;
}

interface AmmoRigidBody {
  getMotionState(): AmmoMotionState | null;
  getLinearVelocity(): AmmoVector3;
  activate(forceActivation?: boolean): void;
  applyCentralImpulse(impulse: unknown): void;
  setFriction(friction: number): void;
  setRollingFriction(friction: number): void;
  setDamping(linear: number, angular: number): void;
}

interface AmmoWorld {
  setGravity(gravity: unknown): void;
  stepSimulation(timeStep: number, maxSubSteps?: number): void;
  removeRigidBody(body: AmmoRigidBody): void;
  addRigidBody(body: AmmoRigidBody): void;
}

// Ammo.js is loaded globally
// deno-lint-ignore no-explicit-any
declare const Ammo: any;

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let clock: THREE.Clock;

// Physics
let physicsWorld: AmmoWorld;
let tmpTrans: AmmoTransform;
const bodies: { body: AmmoRigidBody; mesh: THREE.Mesh }[] = [];

let ballBody: AmmoRigidBody;
let ballMesh: THREE.Mesh;

let player: THREE.Mesh;

// Game state
let world1Started = false;
let world2Started = false;
let gameEnded = false;
let tries = 0;
let inventory = 0;

// Constants
const GRAVITY = -50;
const POWER_MAX = 100;
const POWER_RATE = 40;
const OVERPOWER = 85;

let HOLE = { x: 0, z: 0 };

let power = 0;
let charging = false;
let powerLocked = false;
let overcharged = false;

let powerMultiplier = 1.0;
const WEAK = 0.6;
const STRONG = 1.6;

// UI
let powerFill: HTMLElement;
let triesText: HTMLElement;
let modeText: HTMLElement;
let interactPrompt: HTMLElement;

// Movement keys
const keys: Record<string, boolean> = {};

// Start the game
function start() {
  initScene();
  initPhysics();
  initUI();
  _createWorld0();
  bindInput();
  animate();
}

// Scene initalization
function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);
  scene.fog = new THREE.Fog(0x1a1a1a, 50, 100);

  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
  camera.position.set(0, 10, 20);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(20, 20, 20);
  sun.castShadow = true;
  scene.add(sun);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  clock = new THREE.Clock();

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

// Physics initalization
function initPhysics() {
  const cfg = new Ammo.btDefaultCollisionConfiguration();
  const dispatcher = new Ammo.btCollisionDispatcher(cfg);
  const broad = new Ammo.btDbvtBroadphase();
  const solver = new Ammo.btSequentialImpulseConstraintSolver();

  physicsWorld = new Ammo.btDiscreteDynamicsWorld(
    dispatcher,
    broad,
    solver,
    cfg,
  );

  physicsWorld.setGravity(new Ammo.btVector3(0, GRAVITY, 0));
  tmpTrans = new Ammo.btTransform();
}

// UI initalization
function initUI() {
  const bar = document.createElement("div");
  bar.id = "power-ui";

  const fill = document.createElement("div");
  fill.id = "power-fill";
  bar.appendChild(fill);
  document.body.appendChild(bar);

  const triesEl = document.createElement("div");
  triesEl.style.position = "fixed";
  triesEl.style.top = "20px";
  triesEl.style.right = "20px";
  triesEl.style.color = "white";
  triesEl.style.fontSize = "20px";
  document.body.appendChild(triesEl);

  const modeEl = document.createElement("div");
  modeEl.style.position = "fixed";
  modeEl.style.bottom = "20px";
  modeEl.style.right = "20px";
  modeEl.style.color = "white";
  modeEl.style.fontSize = "18px";
  document.body.appendChild(modeEl);

  const promptEl = document.createElement("div");
  promptEl.style.position = "fixed";
  promptEl.style.bottom = "50%";
  promptEl.style.left = "50%";
  promptEl.style.transform = "translate(-50%, 50%)";
  promptEl.style.color = "white";
  promptEl.style.fontSize = "24px";
  promptEl.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
  promptEl.style.padding = "15px 30px";
  promptEl.style.borderRadius = "10px";
  promptEl.style.display = "none";
  promptEl.textContent = "Press E to interact";
  document.body.appendChild(promptEl);

  powerFill = fill;
  triesText = triesEl;
  modeText = modeEl;
  interactPrompt = promptEl;

  powerFill.style.display = "none";
  triesText.style.display = "block";
  modeText.style.display = "none";

  // Initial UI update
  updateUI();
}

// Update UI elements
function updateUI() {
  powerFill.style.height = `${(power / POWER_MAX) * 100}%`;
  triesText.textContent = `Tries: ${tries}`;
  modeText.textContent ||= "Mode: NORMAL";
}

// Input binding
function bindInput() {
  addEventListener("keydown", (e) => {
    const k = e.code;
    if (!world1Started) {
      return;
    }

    if (k === "Space" && canShoot()) {
      charging = true;
    }

    if (k === "Digit1") {
      powerMultiplier = WEAK;
      modeText.textContent = "Mode: WEAK";
    }

    if (k === "Digit2") {
      powerMultiplier = STRONG;
      modeText.textContent = "Mode: STRONG";
    }
  });

  addEventListener("keyup", (e) => {
    if (!world2Started) {
      return;
    }
    if (e.code === "Space") {
      shoot();
    }
  });

  addEventListener("keydown", (e) => keys[e.code] = true);
  addEventListener("keyup", (e) => keys[e.code] = false);
}

// Player movement
function updatePlayerMovement() {
  if (!player || world2Started) {
    return;
  }

  const speed = 0.15;
  if (keys["KeyW"]) {
    player.position.z -= speed;
  }
  if (keys["KeyS"]) {
    player.position.z += speed;
  }
  if (keys["KeyA"]) {
    player.position.x -= speed;
  }
  if (keys["KeyD"]) {
    player.position.x += speed;
  }
  const moveVec = new THREE.Vector3();

  if (keys["KeyW"]) {
    moveVec.z -= 1;
  }
  if (keys["KeyS"]) {
    moveVec.z += 1;
  }
  if (keys["KeyA"]) {
    moveVec.x -= 1;
  }
  if (keys["KeyD"]) {
    moveVec.x += 1;
  }

  checkStartWorld1Trigger();
  checkStartWorld2Trigger();
}

// Items the player can pick up
interface Item {
  mesh: THREE.Mesh;
  body: AmmoRigidBody | undefined;
  position: THREE.Vector3;
  name: string;
  interactable: boolean;
  pickedUp: boolean;
}

const items: Item[] = [];

// Item functions
function createItem(
  pos: { x: number; y: number; z: number },
  size = 1,
  isPhysical = false,
) {
  const geo = new THREE.BoxGeometry(size, size, size);
  const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geo, mat);

  mesh.position.set(pos.x, pos.y ?? size / 2, pos.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  let body: AmmoRigidBody | undefined;

  if (isPhysical) {
    const shape = new Ammo.btBoxShape(
      new Ammo.btVector3(size / 2, size / 2, size / 2),
    );
    const res = addBody(shape, 0, pos, scene, bodies, physicsWorld);
    body = res.body;
  }

  const item: Item = {
    mesh,
    body,
    position: mesh.position.clone(),
    name: "cube",
    interactable: true,
    pickedUp: false,
  };

  items.push(item);

  return item;
}

// Get player position
function getPlayerPosition(): THREE.Vector3 | null {
  if (player) return player.position;
  return null;
}

let wantPickup = false;

// keydown -> request a pickup attempt
addEventListener("keydown", (e) => {
  if (e.code === "KeyE") {
    wantPickup = true;
  }
});

// Call this every frame (already in animate())
function updateItems() {
  const playerPos = getPlayerPosition();
  if (!playerPos) {
    interactPrompt.style.display = "none";
    if (!wantPickup) return;
    wantPickup = false;
    console.warn("Pickup attempted but no player/ball present.");
    return;
  }

  const PICKUP_RANGE = 2.5;
  let nearItem = false;

  // Check if player is near any item
  for (const item of items) {
    if (item.pickedUp) continue;

    const dx = item.mesh.position.x - playerPos.x;
    const dy = item.mesh.position.y - playerPos.y;
    const dz = item.mesh.position.z - playerPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist <= PICKUP_RANGE) {
      nearItem = true;
      break;
    }
  }

  // Show/hide interact prompt
  interactPrompt.style.display = nearItem ? "block" : "none";

  // Handle pickup action
  if (!wantPickup) return;
  wantPickup = false;

  let pickedAny = false;

  for (const item of items) {
    if (item.pickedUp) continue;

    const dx = item.mesh.position.x - playerPos.x;
    const dy = item.mesh.position.y - playerPos.y;
    const dz = item.mesh.position.z - playerPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist <= PICKUP_RANGE) {
      pickupItem(item);
      pickedAny = true;
      break;
    }
  }

  if (!pickedAny) {
    console.log("No items in range to pick up.");
  }
}

function pickupItem(item: Item) {
  item.pickedUp = true;
  item.interactable = false;

  // Remove 3D model
  scene.remove(item.mesh);

  // Remove physics body
  if (item.body) {
    physicsWorld.removeRigidBody(item.body);

    // Find and remove mesh from bodies
    const bodyIndex = bodies.findIndex((b) => b.body === item.body);
    if (bodyIndex !== -1) {
      const physicsBodyMesh = bodies[bodyIndex].mesh;
      scene.remove(physicsBodyMesh);
      bodies.splice(bodyIndex, 1);
    }

    // Clean up Ammo objects
    Ammo.destroy(item.body);
  }

  // Add to inventory and increase tries
  inventory++;
  tries++;
  updateUI();

  console.log(
    "Item picked up:",
    item.name,
    "| Inventory:",
    inventory,
    "| Tries:",
    tries,
  );
}

// Start World 1
const WORLD1_TRIGGER = { x: 0, z: -15, size: 5 };
function checkStartWorld1Trigger() {
  if (world1Started) return;

  const dx = player.position.x - WORLD1_TRIGGER.x;
  const dz = player.position.z - WORLD1_TRIGGER.z;

  if (dx * dx + dz * dz < WORLD1_TRIGGER.size * WORLD1_TRIGGER.size) {
    world1Started = true;
    clearScene();
    clearPhysics();
    _createWorld1();
  }
}

// Start World 2
const WORLD2_TRIGGER = { x: 0, z: -15, size: 5 };
function checkStartWorld2Trigger() {
  if (world2Started) {
    return;
  }

  const dx = player.position.x - WORLD2_TRIGGER.x;
  const dz = player.position.z - WORLD2_TRIGGER.z;

  if (dx * dx + dz * dz < WORLD2_TRIGGER.size * WORLD2_TRIGGER.size) {
    if (inventory === 0) {
      alert("💀");
      location.reload();
    } else {
      startWorld2();
    }
  }
}

// Golf functions
function canShoot(): boolean {
  if (!ballBody) {
    return false;
  }

  const vel = ballBody.getLinearVelocity();
  const speed = Math.sqrt(vel.x() ** 2 + vel.y() ** 2 + vel.z() ** 2);
  return speed < 0.05 && !gameEnded;
}

// Shoot the ball
function shoot() {
  if (!charging || !ballBody || gameEnded) {
    return;
  }

  charging = false;
  overcharged = power >= OVERPOWER;
  powerLocked = true;

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();

  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const lateral = overcharged
    ? (Math.random() * 2) * (Math.random() < 0.5 ? -1 : 1)
    : 0;
  const strength = (power / POWER_MAX) * 120 * powerMultiplier;

  const impulse = new Ammo.btVector3(
    dir.x * strength + side.x * lateral,
    0.15 * (power / POWER_MAX),
    dir.z * strength + side.z * lateral,
  );

  ballBody.activate(true);
  ballBody.applyCentralImpulse(impulse);

  tries--;
  updateUI();
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  physicsWorld.stepSimulation(dt, 10);

  // Sync physics bodies to meshes
  bodies.forEach((o) => {
    const ms = o.body.getMotionState();
    if (ms) {
      ms.getWorldTransform(tmpTrans);
      const p = tmpTrans.getOrigin();
      o.mesh.position.set(p.x(), p.y(), p.z());
    }
  });

  if (!world2Started) {
    updatePlayerMovement();
  }

  if (charging && !powerLocked) {
    power = Math.min(POWER_MAX, power + POWER_RATE * dt);
    updateUI();
  }

  if (powerLocked && canShoot()) {
    powerLocked = false;
    power = 0;
    overcharged = false;
    updateUI();

    // Check for game over after turn is complete (ball has stopped)
    if (tries <= 0 && !gameEnded) {
      gameEnded = true;
      setTimeout(() => {
        alert("💀");
        location.reload();
      }, 500);
    }
  }

  if (ballMesh && !gameEnded) checkWin();

  updateItems();

  controls.update();
  renderer.render(scene, camera);
}

// Win condition
function checkWin() {
  const dx = ballMesh.position.x - HOLE.x;
  const dz = ballMesh.position.z - (-HOLE.z);

  if (Math.sqrt(dx * dx + dz * dz) < 2.5 && ballMesh.position.y < -2) {
    alert("🎉 You Win!");
    gameEnded = true;
  }
}

// Bootstrap Ammo and start
function waitForAmmo() {
  const w = window as unknown as {
    Ammo?: typeof Ammo | (() => Promise<unknown>);
  };
  if (w.Ammo) {
    if (typeof w.Ammo === "function") {
      w.Ammo().then(start);
    } else {
      start();
    }
  } else {
    setTimeout(waitForAmmo, 100);
  }
}
waitForAmmo();

// World 0: Starting Room
function _createWorld0() {
  // Update UI for World 0
  triesText.style.display = "block";
  updateUI();

  const world1Size = 8;
  const triggerGeo = new THREE.PlaneGeometry(world1Size, world1Size);
  const triggerMat = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
  });

  const triggerPlane = new THREE.Mesh(triggerGeo, triggerMat);
  triggerPlane.rotation.x = -Math.PI / 2;
  triggerPlane.position.set(WORLD1_TRIGGER.x, 0.01, WORLD1_TRIGGER.z);
  scene.add(triggerPlane);

  const groundThickness = 0.1;
  const groundGeo = new THREE.BoxGeometry(32, groundThickness, 32);

  const groundMat = new THREE.MeshStandardMaterial({
    color: 0xFFFFFF,
    roughness: 0.6,
  });

  // Ground
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.y = -groundThickness / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Items
  createItem({ x: -12, y: 0.8, z: -5 }, 1, true);
  createItem({ x: 12, y: 0.8, z: 8 }, 1, true);

  // Player (triangle shape)
  const shape = new THREE.Shape();
  shape.moveTo(0, 1);
  shape.lineTo(-1, -1);
  shape.lineTo(1, -1);
  shape.lineTo(0, 1);

  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: 0.5,
    bevelEnabled: false,
  });

  const mat = new THREE.MeshStandardMaterial({ color: 0x00ffcc });
  player = new THREE.Mesh(extrude, mat);
  player.rotation.x = Math.PI / 2;
  player.rotation.z = Math.PI;
  player.castShadow = true;
  player.position.set(0, 1, 0);
  scene.add(player);

  // Visual walls
  const wallHeight = 2.5;
  const wallThickness = 0.3;
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.7,
  });

  const frontWallGeo = new THREE.BoxGeometry(32, wallHeight, wallThickness);
  const frontWall = new THREE.Mesh(frontWallGeo, wallMaterial);
  frontWall.position.set(0, wallHeight / 2, -16);
  frontWall.castShadow = true;
  scene.add(frontWall);

  const backWall = frontWall.clone();
  backWall.position.set(0, wallHeight / 2, 16);
  scene.add(backWall);

  const sideWallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, 32);
  const leftWall = new THREE.Mesh(sideWallGeo, wallMaterial);
  leftWall.position.set(-16, wallHeight / 2, 0);
  leftWall.castShadow = true;
  scene.add(leftWall);

  const rightWall = leftWall.clone();
  rightWall.position.set(16, wallHeight / 2, 0);
  scene.add(rightWall);
}

// World 1: Second Room
function _createWorld1() {
  scene.background = new THREE.Color(0x1a1a1a);
  scene.fog = new THREE.Fog(0x1a1a1a, 50, 100);
  addDefaultLights();

  // Update UI for World 1
  triesText.style.display = "block";
  updateUI();

  const size = 8;
  const triggerGeo = new THREE.PlaneGeometry(size, size);
  const triggerMat = new THREE.MeshStandardMaterial({
    color: 0xEE4B2B,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
  });

  const triggerPlane = new THREE.Mesh(triggerGeo, triggerMat);
  triggerPlane.rotation.x = -Math.PI / 2;
  triggerPlane.position.set(WORLD1_TRIGGER.x, 0.01, WORLD1_TRIGGER.z);
  scene.add(triggerPlane);

  const groundThickness = 0.1;
  const groundGeo = new THREE.BoxGeometry(32, groundThickness, 32);

  const groundMat = new THREE.MeshStandardMaterial({
    color: 0xFFFFFF,
    roughness: 0.6,
  });

  // Ground
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.y = -groundThickness / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Items
  createItem({ x: -10, y: 0.8, z: 9 }, 1, true);

  // Player (triangle shape)
  const shape = new THREE.Shape();
  shape.moveTo(0, 1);
  shape.lineTo(-1, -1);
  shape.lineTo(1, -1);
  shape.lineTo(0, 1);

  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: 0.5,
    bevelEnabled: false,
  });

  const mat = new THREE.MeshStandardMaterial({ color: 0x00ffcc });
  player = new THREE.Mesh(extrude, mat);
  player.rotation.x = Math.PI / 2;
  player.rotation.z = Math.PI;
  player.castShadow = true;
  player.position.set(0, 1, 0);
  scene.add(player);

  // Visual walls
  const wallHeight = 2.5;
  const wallThickness = 0.3;
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.7,
  });

  const frontWallGeo = new THREE.BoxGeometry(32, wallHeight, wallThickness);
  const frontWall = new THREE.Mesh(frontWallGeo, wallMaterial);
  frontWall.position.set(0, wallHeight / 2, -16);
  frontWall.castShadow = true;
  scene.add(frontWall);

  const backWall = frontWall.clone();
  backWall.position.set(0, wallHeight / 2, 16);
  scene.add(backWall);

  const sideWallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, 32);
  const leftWall = new THREE.Mesh(sideWallGeo, wallMaterial);
  leftWall.position.set(-16, wallHeight / 2, 0);
  leftWall.castShadow = true;
  scene.add(leftWall);

  const rightWall = leftWall.clone();
  rightWall.position.set(16, wallHeight / 2, 0);
  scene.add(rightWall);
}

// World 2: Golf Game
function startWorld2() {
  world2Started = true;
  clearScene();
  clearPhysics();
  addDefaultLights();
  scene.background = new THREE.Color(0x1a1a1a);
  scene.fog = new THREE.Fog(0x1a1a1a, 50, 100);

  powerFill.style.display = "block";
  triesText.style.display = "block";
  modeText.style.display = "block";

  _createWorld2();
  updateUI();
}

function _createWorld2() {
  tries = inventory;
  HOLE = { x: 0, z: 11 };

  const ballSpawn = { x: 0, y: 2, z: 12 };

  // Hole
  createHole(
    { width: 4, height: 16 },
    { x: 0, z: 0 },
    { width: 1.5, height: 1.5 },
    { x: HOLE.x, z: HOLE.z },
    scene,
    physicsWorld,
    0,
  );

  // Ball
  const ballShape = new Ammo.btSphereShape(1);
  const ball = addBody(ballShape, 1, ballSpawn, scene, bodies, physicsWorld);
  ballMesh = ball.mesh;
  ballBody = ball.body;

  // Walls
  const restitution = 1.1;

  createBox(
    { width: 1, height: 2, depth: 32 },
    { x: 4.5, z: 0 },
    scene,
    physicsWorld,
    0.5,
    restitution,
  );

  createBox(
    { width: 1, height: 2, depth: 32 },
    { x: -4.5, z: 0 },
    scene,
    physicsWorld,
    0.5,
    restitution,
  );

  createBox(
    { width: 10, height: 2, depth: 1 },
    { x: 0, z: -16.5 },
    scene,
    physicsWorld,
    0.5,
    restitution,
  );

  createBox(
    { width: 10, height: 2, depth: 1 },
    { x: 0, z: 16.5 },
    scene,
    physicsWorld,
    0.5,
    restitution,
  );

  // Friction
  ballBody.setFriction(2.5);
  ballBody.setRollingFriction(1.2);
  ballBody.setDamping(0.6, 0.9);
}

// Clear scene and physics for world switch
function clearScene() {
  while (scene.children.length > 0) {
    const obj = scene.children.pop();
    if (obj) {
      scene.remove(obj);
    }
  }
}

// Clear physics bodies
function clearPhysics() {
  if (!physicsWorld) {
    return;
  }

  for (let i = bodies.length - 1; i >= 0; i--) {
    const { body } = bodies[i];

    physicsWorld.removeRigidBody(body);
    Ammo.destroy(body);

    bodies.splice(i, 1);
  }
}

// Add default lights
function addDefaultLights() {
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(20, 20, 20);
  sun.castShadow = true;
  scene.add(sun);
}
