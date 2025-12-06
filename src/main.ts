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
let world0Complete: boolean = false;
let world1Complete: boolean = false;
let gameEnded = false;
let tries: number = 1;
let inventory = 1;

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
const NORMAL = 1.0;
const STRONG = 1.6;

// UI
let powerFill: HTMLElement;
let triesText: HTMLElement;
let modeText: HTMLElement;
let interactPrompt: HTMLElement;

// ===== I18N / L10N SYSTEM =====
type Lang = "en" | "zh" | "ar";

let currentLang: Lang = "en";

const i18n = {
  en: {
    tries: "Tries",
    instructions: `Use WASD to move. Use E to interact with blocks.
In golf mode, hold SPACE to power up your hit and move the camera to aim.
Press '4' to save the game and '5' to reset.
Press '6' for English, '7' for Chinese, '8' for Arabic.`,
    mode: "Mode",
    weak: "WEAK",
    normal: "NORMAL",
    strong: "STRONG",
    interact: "Press E to interact",
    win: "🎉 You Win!",
    lose: "💀",
  },

  zh: {
    tries: "次数",
    instructions: `使用 WASD 移动，按 E 与物体互动。
在高尔夫模式中，按住 空格 键 蓄力并转动镜头瞄准。
按 4 保存游戏，按 5 重置游戏。
按 6 为英语，7 为中文，8 为阿拉伯语。`,
    mode: "模式",
    weak: "弱",
    normal: "正常",
    strong: "强",
    interact: "按 E 键互动",
    win: "🎉 你赢了！",
    lose: "💀",
  },

  ar: {
    tries: "المحاولات",
    instructions: `استخدم WASD للحركة واضغط E للتفاعل.
في وضع الجولف اضغط مطولاً على المسافة واضبط الكاميرا للتصويب.
اضغط 4 للحفظ و5 لإعادة التعيين.
اضغط 6 للإنجليزية و7 للصينية و8 للعربية.`,
    mode: "الوضع",
    weak: "ضعيف",
    normal: "عادي",
    strong: "قوي",
    interact: "اضغط E للتفاعل",
    win: "🎉 فزت!",
    lose: "💀",
  },
};

function t(key: keyof typeof i18n["en"]): string {
  return i18n[currentLang][key];
}

function setLanguage(lang: Lang) {
  currentLang = lang;
  interactPrompt.textContent = t("interact");

  const instructionEl = document.getElementById("instructions");
  if (instructionEl) instructionEl.innerText = t("instructions");

  modeText.textContent = `${t("mode")}: ${t("normal")}`;

  updateUI();
  applyLanguageLayout(lang);
}

function applyLanguageLayout(lang: Lang) {
  if (lang === "ar") {
    document.body.dir = "rtl";
    triesText.style.right = "auto";
    triesText.style.left = "20px";
    modeText.style.right = "auto";
    modeText.style.left = "20px";
  } else {
    document.body.dir = "ltr";
    triesText.style.left = "auto";
    triesText.style.right = "20px";
    modeText.style.left = "auto";
    modeText.style.right = "20px";
  }
}

// ===== OS Light / Dark Mode Support =====
const colorScheme = globalThis.matchMedia("(prefers-color-scheme: dark)");
let isDarkMode = colorScheme.matches;

function applyTheme(dark: boolean) {
  if (!scene) return;

  if (dark) {
    scene.background = new THREE.Color(0x3d3d3d);
    scene.fog = new THREE.Fog(0x0d0d0d, 30, 120);
    setLights(0.25, 0.8);

    document.body.style.backgroundColor = "#0d0d0d";
    triesText.style.color = "white";
    modeText.style.color = "white";
    interactPrompt.style.backgroundColor = "rgba(0,0,0,0.7)";
  } else {
    scene.background = new THREE.Color(0xf0f0f0);
    scene.fog = new THREE.Fog(0xf0f0f0, 40, 180);
    setLights(0.6, 1.2);

    document.body.style.backgroundColor = "#f0f0f0";
    triesText.style.color = "black";
    modeText.style.color = "black";
    interactPrompt.style.backgroundColor = "rgba(255,255,255,0.85)";
  }

  updateWorldMaterials(dark);
}

function setLights(ambientIntensity: number, sunIntensity: number) {
  for (let i = scene.children.length - 1; i >= 0; i--) {
    const obj = scene.children[i];
    if (obj instanceof THREE.Light) {
      scene.remove(obj);
    }
  }

  const ambient = new THREE.AmbientLight(0xffffff, ambientIntensity);
  const sun = new THREE.DirectionalLight(0xffffff, sunIntensity);
  sun.position.set(20, 20, 20);
  sun.castShadow = true;

  scene.add(ambient);
  scene.add(sun);
}

function updateWorldMaterials(dark: boolean) {
  scene.traverse((obj: THREE.Object3D) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat || !mat.color) return;

      mat.roughness = dark ? 0.9 : 0.5;
      mat.color.offsetHSL(0, 0, dark ? -0.25 : 0.25);
      mat.needsUpdate = true;
    }
  });
}

// Live response to OS switch
colorScheme.addEventListener("change", (e) => {
  isDarkMode = e.matches;
  applyTheme(isDarkMode);
});

// Movement keys
const keys: Record<string, boolean> = {};

// Start the game
function start() {
  applyTheme(isDarkMode);
  initScene();
  initPhysics();
  loadGameData();
  initUI();
  loadWorld();
  bindInput();
  animate();
}

function saveGameData() {
  localStorage.world0 = world0Complete;
  localStorage.world1 = world1Complete;
  localStorage.tries = tries;
  localStorage.inventory = inventory;
  localStorage.pickedItems = JSON.stringify(pickedItems);

  console.log(JSON.parse(localStorage.pickedItems));

  console.log(localStorage);
}

function resetGame() {
  localStorage.clear();
  location.reload();
}

function loadGameData() {
  if (localStorage.length == 0) return;
  world0Complete = JSON.parse(localStorage.world0);
  world1Complete = JSON.parse(localStorage.world1);
  tries = localStorage.tries;
  inventory = localStorage.inventory;
  pickedItems = JSON.parse(localStorage.pickedItems);

  console.log(localStorage);
}

function loadWorld() {
  if ((world0Complete && world1Complete) == true) {
    startWorld2();
    return;
  }
  if (world0Complete) {
    _createWorld1();
  }
  if (!world0Complete && !world1Complete) {
    _createWorld0();
  }
}

// Scene initalization
function initScene() {
  scene = new THREE.Scene();
  // scene.background = new THREE.Color(0x1a1a1a);
  // scene.fog = new THREE.Fog(0x1a1a1a, 50, 100);

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

  const instructionEl = document.createElement("div");
  instructionEl.style.position = "fixed";
  instructionEl.style.top = "20px";
  instructionEl.style.left = "20px";
  instructionEl.style.color = "white";
  instructionEl.style.fontSize = "20px";
  instructionEl.id = "instructions";
  instructionEl.innerText = t("instructions");
  document.body.appendChild(instructionEl);

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
  promptEl.textContent = t("interact");
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
  triesText.textContent = `${t("tries")}: ${tries}`;
  modeText.textContent ||= `${t("mode")}: ${t("normal")}`;
}

// Input binding
function bindInput() {
  // Key DOWN
  addEventListener("keydown", (e) => {
    // ----- Language switching (always allowed) -----

    if (e.code === "KeyU" && !world1Complete) undo();
    if (e.code === "Digit4") saveGameData();
    if (e.code === "Digit5") resetGame();
    if (e.code === "Digit6") setLanguage("en");
    if (e.code === "Digit7") setLanguage("zh");
    if (e.code === "Digit8") setLanguage("ar");

    const k = e.code;

    // ----- Movement input always tracked -----
    keys[k] = true;

    // ----- Do NOT block language switching -----
    if (!world0Complete) return;

    // ----- Gameplay controls -----
    if (k === "Space" && canShoot()) {
      charging = true;
    }

    if (k === "Digit1") {
      powerMultiplier = WEAK;
      modeText.textContent = `${t("mode")}: ${t("weak")}`;
    }

    if (k === "Digit2") {
      powerMultiplier = NORMAL;
      modeText.textContent = `${t("mode")}: ${t("normal")}`;
    }

    if (k === "Digit3") {
      powerMultiplier = STRONG;
      modeText.textContent = `${t("mode")}: ${t("strong")}`;
    }
  });

  // Key UP
  addEventListener("keyup", (e) => {
    keys[e.code] = false;

    if (!world1Complete) return;

    if (e.code === "Space") {
      shoot();
    }
  });
}

// Player movement
function updatePlayerMovement() {
  if (!player || world1Complete) {
    console.log("???");
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
let pickedItems: Item[] = [];

// Item functions
function createItem(
  pos: { x: number; y: number; z: number },
  size = 1,
  isPhysical = false,
) {
  for (const item of pickedItems) {
    if (item.position.x == pos.x) {
      return;
    }
  }
  for (const item of items) {
    if (
      item.position.x == pos.x && item.position.z == pos.z && !item.pickedUp
    ) {
      scene.add(item.mesh);
      return;
    }
  }

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
  pickedItems.push(item);
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

  undoStack.push(itemAction(item));

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
  if (world0Complete) return;

  const dx = player.position.x - WORLD1_TRIGGER.x;
  const dz = player.position.z - WORLD1_TRIGGER.z;

  if (dx * dx + dz * dz < WORLD1_TRIGGER.size * WORLD1_TRIGGER.size) {
    undoStack.push(enterRoomAction());
    world0Complete = true;
    saveGameData();
    clearScene();
    clearPhysics();
    _createWorld1();
  }
}

// Start World 2
const WORLD2_TRIGGER = { x: 0, z: -15, size: 5 };
let triggered = false;
function checkStartWorld2Trigger() {
  if (world1Complete) {
    return;
  }

  const dx = player.position.x - WORLD2_TRIGGER.x;
  const dz = player.position.z - WORLD2_TRIGGER.z;

  if (dx * dx + dz * dz < WORLD2_TRIGGER.size * WORLD2_TRIGGER.size) {
    if (inventory === 0 && !triggered) {
      alert(t("lose"));
      location.reload();
      triggered = true;
    } else if (triggered) {
      resetGame();
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

  // Rotate bomb fuse based on ball velocity (rolling effect)
  if (ballMesh && ballBody && world1Complete) {
    const vel = ballBody.getLinearVelocity();
    const speed = Math.sqrt(vel.x() ** 2 + vel.z() ** 2);

    // Rotate the entire bomb mesh based on velocity direction
    if (speed > 0.1) {
      const rotationSpeed = speed * 2;
      const velDir = new THREE.Vector2(vel.x(), vel.z()).normalize();

      // Rotate around axis perpendicular to movement
      ballMesh.rotateOnAxis(
        new THREE.Vector3(-velDir.y, 0, velDir.x),
        rotationSpeed * dt,
      );
    }
  }

  if (!world1Complete) {
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
        explodeBomb();
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
    alert(t("win"));
    gameEnded = true;
  }
}

// Explosion effect
function explodeBomb() {
  if (!ballMesh) return;

  // Create explosion particles
  const particleCount = 50;
  const particles: THREE.Mesh[] = [];

  for (let i = 0; i < particleCount; i++) {
    const size = Math.random() * 0.5 + 0.2;
    const geo = new THREE.SphereGeometry(size, 8, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: Math.random() > 0.5 ? 0xff4500 : 0xff8c00,
      emissive: 0xff4500,
      emissiveIntensity: 0.8,
    });
    const particle = new THREE.Mesh(geo, mat);

    particle.position.copy(ballMesh.position);

    // Random velocity
    const angle = Math.random() * Math.PI * 2;
    const elevation = Math.random() * Math.PI - Math.PI / 2;
    const speed = Math.random() * 15 + 5;

    particle.userData.velocity = new THREE.Vector3(
      Math.cos(angle) * Math.cos(elevation) * speed,
      Math.sin(elevation) * speed + 10,
      Math.sin(angle) * Math.cos(elevation) * speed,
    );

    scene.add(particle);
    particles.push(particle);
  }

  // Hide the bomb
  ballMesh.visible = false;

  // Flash effect
  const originalBg = scene.background;
  scene.background = new THREE.Color(0xffffff);

  // Animate particles
  let time = 0;
  const explosionInterval = setInterval(() => {
    time += 0.016;

    particles.forEach((particle) => {
      particle.position.add(
        particle.userData.velocity.clone().multiplyScalar(0.016),
      );
      particle.userData.velocity.y -= 30 * 0.016; // Gravity

      // Fade out
      const mat = particle.material as THREE.MeshStandardMaterial;
      mat.opacity = Math.max(0, 1 - time * 2);
      mat.transparent = true;

      // Shrink
      particle.scale.multiplyScalar(0.98);
    });

    if (time > 0.1) {
      scene.background = originalBg;
    }

    if (time > 1) {
      clearInterval(explosionInterval);
      particles.forEach((p) => scene.remove(p));

      setTimeout(() => {
        alert("💣💥");
        location.reload();
      }, 500);
    }
  }, 16);
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

// Clear scene and physics for world switch
function clearScene() {
  while (scene.children.length > 0) {
    const obj = scene.children.pop();
    if (obj) {
      scene.remove(obj);
    }
  }
}

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
    color: isDarkMode ? 0x333333 : 0xdddddd,
    roughness: isDarkMode ? 0.8 : 0.4,
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
  applyTheme(isDarkMode);
}

// World 1: Second Room
function _createWorld1() {
  // scene.background = new THREE.Color(0x1a1a1a);
  // scene.fog = new THREE.Fog(0x1a1a1a, 50, 100);
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
    color: isDarkMode ? 0x333333 : 0xdddddd,
    roughness: isDarkMode ? 0.8 : 0.4,
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
  world1Complete = true;
  saveGameData();
  clearScene();
  clearPhysics();
  addDefaultLights();
  // scene.background = new THREE.Color(0x1a1a1a);
  // scene.fog = new THREE.Fog(0x1a1a1a, 50, 100);

  powerFill.style.display = "block";
  triesText.style.display = "block";
  modeText.style.display = "block";

  _createWorld2();
  updateUI();
  applyTheme(isDarkMode);
}

function _createWorld2() {
  tries = inventory;
  HOLE = { x: 0, z: 11 };

  const ballSpawn = { x: 0, y: 2, z: 14 };

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

  // Ball (Bomb)
  const ballShape = new Ammo.btSphereShape(1);
  const ball = addBody(ballShape, 1, ballSpawn, scene, bodies, physicsWorld);
  ballMesh = ball.mesh;
  ballBody = ball.body;

  // Style as a bomb
  (ballMesh.material as THREE.MeshStandardMaterial).color.setHex(0x1a1a1a);
  (ballMesh.material as THREE.MeshStandardMaterial).metalness = 0.3;
  (ballMesh.material as THREE.MeshStandardMaterial).roughness = 0.7;

  // Add fuse (small cylinder on top)
  const fuseGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.6, 8);
  const fuseMat = new THREE.MeshStandardMaterial({
    color: 0x8b4513,
    roughness: 0.9,
  });
  const fuse = new THREE.Mesh(fuseGeo, fuseMat);
  fuse.position.set(0, 1.3, 0);
  ballMesh.add(fuse);

  // Add glowing tip to fuse
  const tipGeo = new THREE.SphereGeometry(0.15, 8, 8);
  const tipMat = new THREE.MeshStandardMaterial({
    color: 0xff4500,
    emissive: 0xff4500,
    emissiveIntensity: 1,
  });
  const tip = new THREE.Mesh(tipGeo, tipMat);
  tip.position.set(0, 1.6, 0);
  ballMesh.add(tip);

  // Box Walls
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
    { x: -12.5, z: 0 },
    scene,
    physicsWorld,
    0.5,
    restitution,
  );

  createBox(
    { width: 1, height: 10, depth: 24 },
    { x: -4.5, z: -5 },
    scene,
    physicsWorld,
    0.5,
    restitution,
  );

  createBox(
    { width: 1, height: 10, depth: 24 },
    { x: -12.5, z: -5 },
    scene,
    physicsWorld,
    0.5,
    restitution,
  );

  createBox(
    { width: 10, height: 10, depth: 1 },
    { x: 0, z: -16.5 },
    scene,
    physicsWorld,
    0.5,
    restitution,
  );

  createBox( // back wall
    { width: 26, height: 20, depth: 1 },
    { x: 0, z: -27.5 },
    scene,
    physicsWorld,
    0.5,
    restitution,
  );

  createBox(
    { width: 8, height: 10, depth: 1 },
    { x: 8, z: -3 },
    scene,
    physicsWorld,
    0.5,
    restitution,
  );

  createBox(
    { width: 10, height: 2, depth: 1 },
    { x: 0, z: -6 },
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

  createBox(
    { width: 18, height: 2, depth: 1 },
    { x: -4, z: 16.5 },
    scene,
    physicsWorld,
    0.5,
    restitution,
  );

  createBox(
    { width: 1, height: 7.25, depth: 13 },
    { x: 4.5, z: -10 },
    scene,
    physicsWorld,
    0.5,
    restitution,
  );

  createBox(
    { width: 1, height: 10, depth: 14.5 },
    { x: 12.5, z: -9.75 },
    scene,
    physicsWorld,
    0.5,
    restitution,
  );

  createBox(
    { width: 1, height: 20, depth: 10 },
    { x: 12.5, z: -22 },
    scene,
    physicsWorld,
    0.5,
    restitution,
  );

  createBox(
    { width: 1, height: 20, depth: 10 },
    { x: -12.5, z: -22 },
    scene,
    physicsWorld,
    0.5,
    restitution,
  );

  // Box Platforms

  createBox(
    { width: 9, height: 0, depth: 10 },
    { x: -8.5, z: 11 },
    scene,
    physicsWorld,
    0.001,
    restitution,
    0,
    0xA9A9A9,
  );

  createBox( // ramp
    { width: 9, height: 0, depth: 10 },
    { x: -8.5, z: 1.75 },
    scene,
    physicsWorld,
    2,
    0,
    25,
    0xA9A9A9,
  );

  createBox(
    { width: 9, height: 0, depth: 14.25 },
    { x: -8.5, z: -9.9 },
    scene,
    physicsWorld,
    4.1,
    restitution,
    0,
    0xA9A9A9,
  );

  createBox(
    { width: 26, height: 0, depth: 10 },
    { x: 0, z: -22 },
    scene,
    physicsWorld,
    4.1,
    restitution,
    0,
    0xA9A9A9,
  );

  createBox(
    { width: 9, height: 0, depth: 14.25 },
    { x: 8.5, z: -9.9 },
    scene,
    physicsWorld,
    4.1,
    restitution,
    0,
    0xA9A9A9,
  );

  // Box Other

  createBox(
    { width: 2, height: 1, depth: 2 },
    { x: 4.5, z: -22 },
    scene,
    physicsWorld,
    4.5,
    4,
    0,
    0xFF0000,
  );

  createBox(
    { width: 2, height: 1, depth: 2 },
    { x: -4.5, z: -22 },
    scene,
    physicsWorld,
    4.5,
    4,
    0,
    0xFF0000,
  );

  // Friction
  ballBody.setFriction(2.5);
  ballBody.setRollingFriction(1.2);
  ballBody.setDamping(0.6, 0.9);
}

// Undo system
interface UndoAction {
  undo: () => void;
}

const undoStack: UndoAction[] = [];

function itemAction(item: Item): UndoAction {
  return {
    undo: () => {
      const index = pickedItems.indexOf(item);
      if (index !== -1) {
        pickedItems.splice(index, 1);
      }

      createItem(
        {
          x: item.position.x,
          y: item.position.y,
          z: item.position.z,
        },
        1,
        true,
      );
      inventory--;
      tries--;
      updateUI();
      saveGameData();
    },
  };
}

function enterRoomAction(): UndoAction {
  return {
    undo: () => {
      world0Complete = false;
      saveGameData();
      clearScene();
      clearPhysics();
      _createWorld0();
    },
  };
}

function undo() {
  const action = undoStack.pop();
  if (action) {
    action.undo();
  }
}
