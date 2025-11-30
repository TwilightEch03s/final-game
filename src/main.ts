import * as THREE from "https://esm.sh/three@0.181.2";
import { OrbitControls } from "https://esm.sh/three@0.181.2/examples/jsm/controls/OrbitControls.js";
import { addBody, addWalls, createHole } from "./utils.ts";

// Ammo.js is loaded from CDN in index.html
// deno-lint-ignore no-explicit-any
declare const Ammo: any;

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let clock: THREE.Clock;

// deno-lint-ignore no-explicit-any
let physicsWorld: any;
// deno-lint-ignore no-explicit-any
let tmpTrans: any;

// deno-lint-ignore no-explicit-any
const bodies: { body: any; mesh: THREE.Mesh }[] = [];

// deno-lint-ignore no-explicit-any
let ballBody: any;
let ballMesh: THREE.Mesh;

const GRAVITY = -9.82;
const POWER_MAX = 100;
const POWER_RATE = 40;
const OVERPOWER = 85;

let power = 0;
let charging = false;
let overcharged = false;
let powerLocked = false;

let powerMultiplier = 1.0;
const WEAK = 0.6;
const STRONG = 1.6;

const tries = 3;
let gameEnded = false;

const HOLE = { x: 10, z: 10 };

let powerFill: HTMLElement;
let triesText: HTMLElement;
let modeText: HTMLElement;

/* ---------------------- START ---------------------- */

function start() {
  initScene();
  initPhysics();
  createWorld();
  initUI();
  bindInput();
  animate();
}

/* ---------------------- SCENE ---------------------- */

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

/* ---------------------- PHYSICS ---------------------- */

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

/* ---------------------- WORLD ---------------------- */

function createWorld() {
  const size = 25;

  // Ground
  const _groundHole = createHole(
    { width: size, height: size },
    { x: 0, y: 0 },
    {
      width: 3,
      height: 3,
    },
    { x: 10, y: 10 },
    scene,
    physicsWorld,
  );

  // Hole trigger (optional)
  const hole = addBody(
    new Ammo.btBoxShape(new Ammo.btVector3(1.5, 1.5, 1.5)),
    0,
    { x: HOLE.x, y: -2, z: HOLE.z },
    scene,
    bodies,
    physicsWorld,
  );
  hole.mesh.visible = false;

  // Invisible walls
  addWalls(size, scene, bodies, physicsWorld);

  // Ball
  const ballShape = new Ammo.btSphereShape(1);
  const ball = addBody(
    ballShape,
    1,
    { x: 0, y: 2, z: 6 },
    scene,
    bodies,
    physicsWorld,
  );
  ballMesh = ball.mesh;
  ballBody = ball.body;

  // ✅ HIGH FRICTION & DAMPING
  ballBody.setFriction(2.5);
  ballBody.setRollingFriction(1.2);
  ballBody.setDamping(0.6, 0.9);
}
/* ---------------------- WALLS ---------------------- */

/* ---------------------- UI ---------------------- */

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
  triesEl.style.fontSize = "20px";
  triesEl.style.color = "white";
  document.body.appendChild(triesEl);

  const modeEl = document.createElement("div");
  modeEl.style.position = "fixed";
  modeEl.style.bottom = "20px";
  modeEl.style.right = "20px";
  modeEl.style.fontSize = "18px";
  modeEl.style.color = "white";
  document.body.appendChild(modeEl);

  powerFill = fill;
  triesText = triesEl;
  modeText = modeEl;

  updateUI();
}

/* ---------------------- INPUT ---------------------- */

function bindInput() {
  addEventListener("keydown", (e) => {
    const k = (e as KeyboardEvent).code;

    // Only let player charge if ball is nearly stopped
    if (k === "Space") charging = true;

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
    if ((e as KeyboardEvent).code === "Space") shoot();
  });
}

/* ---------------------- POWER ---------------------- */

function canShoot(): boolean {
  if (!ballBody) return false;

  const vel = ballBody.getLinearVelocity();
  const speed = Math.sqrt(vel.x() ** 2 + vel.y() ** 2 + vel.z() ** 2);

  return speed < 0.05 && !gameEnded;
}

function shoot() {
  if (!charging || !ballBody || gameEnded) return;
  charging = false;
  overcharged = power >= OVERPOWER;
  powerLocked = true;

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  if (dir.lengthSq() < 0.001) dir.set(0, 0, -1);
  dir.normalize();

  let lateral = 0;
  if (overcharged) {
    lateral = (Math.random() * 2) * (Math.random() < 0.5 ? -1 : 1);
  }

  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const strength = (power / POWER_MAX) * 120 * powerMultiplier;

  const impulse = new Ammo.btVector3(
    dir.x * strength + side.x * lateral,
    0.15 * (power / POWER_MAX),
    dir.z * strength + side.z * lateral,
  );

  ballBody.activate(true);
  ballBody.applyCentralImpulse(impulse);
}

/* ---------------------- LOOP ---------------------- */

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  physicsWorld.stepSimulation(dt, 10);

  bodies.forEach((o) => {
    const ms = o.body.getMotionState();
    if (ms) {
      ms.getWorldTransform(tmpTrans);
      const p = tmpTrans.getOrigin();
      o.mesh.position.set(p.x(), p.y(), p.z());
    }
  });

  // Accumulate power only while charging
  if (charging && !powerLocked) {
    power = Math.min(POWER_MAX, power + POWER_RATE * dt);
    updateUI();
  }

  // If ball has stopped, unlock power and reset bar
  if (powerLocked && canShoot()) {
    powerLocked = false;
    power = 0;
    overcharged = false;
    updateUI();
  }

  if (ballMesh && !gameEnded) checkWin();

  controls.update();
  renderer.render(scene, camera);
}

/* ---------------------- WIN ---------------------- */

function checkWin() {
  const dx = ballMesh.position.x - HOLE.x;
  const dz = ballMesh.position.z - HOLE.z;
  if (Math.sqrt(dx * dx + dz * dz) < 2.5 && ballMesh.position.y < -2) {
    gameEnded = true;
    alert("🎉 HOLE IN ONE!");
  }
}

/* ---------------------- UI UPDATE ---------------------- */

function updateUI() {
  powerFill.style.height = `${(power / POWER_MAX) * 100}%`;
  triesText.textContent = `Tries: ${tries}`;
  modeText.textContent ||= "Mode: NORMAL";
}

/* ---------------------- BOOT ---------------------- */

function waitForAmmo() {
  // deno-lint-ignore no-explicit-any
  if ((window as any).Ammo) {
    // deno-lint-ignore no-explicit-any
    const lib = (window as any).Ammo;
    typeof lib === "function" ? lib().then(start) : start();
  } else setTimeout(waitForAmmo, 100);
}

waitForAmmo();
