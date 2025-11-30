import * as THREE from "https://esm.sh/three@0.181.2";
import { OrbitControls } from "https://esm.sh/three@0.181.2/examples/jsm/controls/OrbitControls.js";

// Ammo.js is loaded from CDN in index.html
// deno-lint-ignore no-explicit-any
declare const Ammo: any;

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let clock: THREE.Clock;

let physicsWorld: any;
let tmpTrans: any;

const bodies: { body: any; mesh: THREE.Mesh }[] = [];

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

let tries = 3;
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
  const size = 40;

  // Ground
  const ground = createHole({ width: 20, height: 20 }, { x: 6, y: 5 }, {
    width: 5,
    height: 5,
  }, { x: 5, y: 0 });
  /*const ground = new THREE.Mesh(
    new THREE.BoxGeometry(size, 1, size),
    new THREE.MeshStandardMaterial({ color: 0x333333 }),
  );
  ground.position.y = -0.5;
  scene.add(ground);

  addBody(new Ammo.btBoxShape(new Ammo.btVector3(size / 2, 0.5, size / 2)), 0, {
    x: 0,
    y: -0.5,
    z: 0,
  });*/

  // Invisible walls
  //addWalls(size / 2);

  // Ball
  const ballShape = new Ammo.btSphereShape(1);
  const ball = addBody(ballShape, 1, { x: 0, y: 2, z: 6 });
  ballMesh = ball.mesh;
  ballBody = ball.body;

  // ✅ HIGH FRICTION & DAMPING
  ballBody.setFriction(2.5);
  ballBody.setRollingFriction(1.2);
  ballBody.setDamping(0.6, 0.9);

  // Hole trigger (optional)
  const hole = addBody(
    new Ammo.btBoxShape(new Ammo.btVector3(1.5, 1.5, 1.5)),
    0,
    { x: HOLE.x, y: -2, z: HOLE.z },
  );
  hole.mesh.visible = false;
}

interface RectSize {
  width: number;
  height: number;
}

interface Position {
  x: number;
  y: number;
}

function createHole(
  planeSize: RectSize,
  planePosition: Position,
  holeSize: RectSize,
  holePosition: Position,
) {
  // Three.js visual mesh
  const outer = new THREE.Shape();
  outer.moveTo(
    -planeSize.width + planePosition.x,
    -planeSize.height + planePosition.y,
  );
  outer.lineTo(
    planeSize.width + planePosition.x,
    -planeSize.height + planePosition.y,
  );
  outer.lineTo(
    planeSize.width + planePosition.x,
    planeSize.height + planePosition.y,
  );
  outer.lineTo(
    -planeSize.width + planePosition.x,
    planeSize.height + planePosition.y,
  );
  outer.lineTo(
    -planeSize.width + planePosition.x,
    -planeSize.height + planePosition.y,
  );

  const hole = new THREE.Path();
  hole.moveTo(
    -holeSize.width + holePosition.x,
    -holeSize.height + holePosition.y,
  );
  hole.lineTo(
    holeSize.width + holePosition.x,
    -holeSize.height + holePosition.y,
  );
  hole.lineTo(
    holeSize.width + holePosition.x,
    holeSize.height + holePosition.y,
  );
  hole.lineTo(
    -holeSize.width + holePosition.x,
    holeSize.height + holePosition.y,
  );
  hole.lineTo(
    -holeSize.width + holePosition.x,
    -holeSize.height + holePosition.y,
  );

  outer.holes.push(hole);

  const geometry = new THREE.ShapeGeometry(outer);
  const material = new THREE.MeshStandardMaterial({
    color: 0x999999,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  mesh.rotation.x = -Math.PI / 2;

  // Ammo compound shape
  const compound = new Ammo.btCompoundShape();
  const transform = new Ammo.btTransform();
  transform.setIdentity();

  console.log(
    planeSize.width,
    ((holePosition.y - planePosition.y) +
      (planeSize.height - holeSize.height)) / 2,
  );

  console.log("x, y");
  console.log(
    planePosition.x,
    -(planePosition.y + holePosition.y) / 2 +
      planeSize.height -
      (planeSize.height - holeSize.height) / 2,
  );
  let top = new Ammo.btBoxShape(
    new Ammo.btVector3(
      planeSize.width,
      ((holePosition.y - planePosition.y) +
        (planeSize.height - holeSize.height)) / 2,
      0.1,
    ),
  );

  transform.setOrigin(
    new Ammo.btVector3(
      planePosition.x,
      -(-(planePosition.y + holePosition.y) / 2 +
        planeSize.height -
        (planeSize.height - holeSize.height) / 2),
      0,
    ),
  );
  compound.addChildShape(transform, top);

  let topGeo = new THREE.BoxGeometry(
    planeSize.width * 2,
    (holePosition.y - planePosition.y) + (planeSize.height - holeSize.height),
    0.1,
  );
  let topWireframe = new THREE.WireframeGeometry(topGeo);
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
  const topLine = new THREE.LineSegments(topWireframe, lineMaterial);
  topLine.position.set(
    planePosition.x,
    0,
    -(planePosition.y + holePosition.y) / 2 +
      planeSize.height -
      (planeSize.height - holeSize.height) / 2,
  );
  topLine.rotation.x = Math.PI / 2;
  scene.add(topLine);

  console.log(
    planeSize.width,
    ((planeSize.height - holeSize.height) -
      (holePosition.y - planePosition.y)) / 2,
  );

  console.log("x, y");
  console.log(
    planePosition.x,
    -(planeSize.height + ((planePosition.y + holePosition.y) / 2) -
      (planeSize.height - holeSize.height) / 2),
  );
  let bottom = new Ammo.btBoxShape(
    new Ammo.btVector3(
      planeSize.width,
      ((planeSize.height - holeSize.height) -
        (holePosition.y - planePosition.y)) / 2,
      0.1,
    ),
  );
  transform.setOrigin(
    new Ammo.btVector3(
      planePosition.x,
      -(-(planeSize.height + ((planePosition.y + holePosition.y) / 2) -
        (planeSize.height - holeSize.height) / 2)),
      0,
    ),
  );
  compound.addChildShape(transform, bottom);

  let bottomGeo = new THREE.BoxGeometry(
    planeSize.width * 2,
    (planeSize.height - holeSize.height) - (holePosition.y - planePosition.y),
    0.1,
  );
  let bottomWireframe = new THREE.WireframeGeometry(bottomGeo);
  const bottomLine = new THREE.LineSegments(bottomWireframe);
  bottomLine.position.set(
    planePosition.x,
    0,
    -(planeSize.height + ((planePosition.y + holePosition.y) / 2) -
      (planeSize.height - holeSize.height) / 2),
  );
  bottomLine.rotation.x = Math.PI / 2;
  scene.add(bottomLine);

  let left = new Ammo.btBoxShape(
    new Ammo.btVector3(
      ((holePosition.x - planePosition.x) +
        (planeSize.width - holeSize.width)) / 2,
      holeSize.height,
      0.1,
    ),
  );
  transform.setOrigin(
    new Ammo.btVector3(
      (planePosition.x / 2) - (planeSize.width - (holePosition.x / 2) -
        (planeSize.width - holeSize.width) / 2),
      -holePosition.y,
      0,
    ),
  );
  compound.addChildShape(transform, left);

  let leftGeo = new THREE.BoxGeometry(
    (holePosition.x - planePosition.x) + (planeSize.width - holeSize.width),
    holeSize.height * 2,
    0.1,
  );
  let leftWireFrame = new THREE.WireframeGeometry(leftGeo);
  const lineMaterial2 = new THREE.LineBasicMaterial({ color: 0x00ff00 });
  const leftLine = new THREE.LineSegments(leftWireFrame, lineMaterial2);
  leftLine.position.set(
    (planePosition.x / 2) - (planeSize.width - (holePosition.x / 2) -
      (planeSize.width - holeSize.width) / 2),
    0,
    -holePosition.y,
  );
  leftLine.rotation.x = Math.PI / 2;
  scene.add(leftLine);

  let right = new Ammo.btBoxShape(
    new Ammo.btVector3(
      ((planeSize.width - holeSize.width) -
        (holePosition.x - planePosition.x)) / 2,
      holeSize.height,
      0.1,
    ),
  );
  transform.setOrigin(
    new Ammo.btVector3(
      (planePosition.x / 2) + (holePosition.x / 2) + planeSize.width -
        (planeSize.width - holeSize.width) / 2,
      -holePosition.y,
      0,
    ),
  );
  compound.addChildShape(transform, right);

  let rightGeo = new THREE.BoxGeometry(
    (planeSize.width - holeSize.width) - (holePosition.x - planePosition.x),
    holeSize.height * 2,
    0.1,
  );
  let rightWireFrame = new THREE.WireframeGeometry(rightGeo);
  const lineMaterial3 = new THREE.LineBasicMaterial({ color: 0x0000ff });
  const rightLine = new THREE.LineSegments(rightWireFrame, lineMaterial3);
  rightLine.position.set(
    (planePosition.x / 2) + (holePosition.x / 2) + planeSize.width -
      (planeSize.width - holeSize.width) / 2,
    0,
    -holePosition.y,
  );
  rightLine.rotation.x = Math.PI / 2;
  scene.add(rightLine);

  // Rigid body creation, rotated flat
  const rbTransform = new Ammo.btTransform();
  rbTransform.setIdentity();

  const quat = new Ammo.btQuaternion();
  quat.setRotation(new Ammo.btVector3(1, 0, 0), -Math.PI / 2);
  rbTransform.setRotation(quat);
  rbTransform.setOrigin(new Ammo.btVector3(0, 0, 0));

  const motionState = new Ammo.btDefaultMotionState(rbTransform);
  const localInertia = new Ammo.btVector3(0, 0, 0);
  const rbInfo = new Ammo.btRigidBodyConstructionInfo(
    0,
    motionState,
    compound,
    localInertia,
  );
  const body = new Ammo.btRigidBody(rbInfo);

  physicsWorld.addRigidBody(body);
  return body;
}

/* ---------------------- WALLS ---------------------- */

function addWalls(size: number) {
  const h = 5;
  const t = 1;

  const walls = [
    [-size - t / 2, h / 2, 0],
    [size + t / 2, h / 2, 0],
    [0, h / 2, size + t / 2],
    [0, h / 2, -size - t / 2],
  ];

  walls.forEach(([x, y, z]) => {
    const shape = Math.abs(x) > Math.abs(z)
      ? new Ammo.btBoxShape(new Ammo.btVector3(t / 2, h / 2, size))
      : new Ammo.btBoxShape(new Ammo.btVector3(size, h / 2, t / 2));

    const wall = addBody(shape, 0, { x, y, z });
    wall.mesh.visible = false;
  });
}

/* ---------------------- BODY ---------------------- */

function addBody(shape: Ammo.btCollisionShape, mass: number, pos: any) {
  const mesh = shape instanceof Ammo.btSphereShape
    ? new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0x999999 }),
    )
    : new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({ color: 0x666666 }),
    );

  mesh.position.set(pos.x, pos.y, pos.z);
  scene.add(mesh);

  const transform = new Ammo.btTransform();
  transform.setIdentity();
  transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));

  const motion = new Ammo.btDefaultMotionState(transform);
  const inertia = new Ammo.btVector3(0, 0, 0);
  if (mass) shape.calculateLocalInertia(mass, inertia);

  const body = new Ammo.btRigidBody(
    new Ammo.btRigidBodyConstructionInfo(mass, motion, shape, inertia),
  );

  physicsWorld.addRigidBody(body);
  bodies.push({ body, mesh });

  return { body, mesh };
}

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
  if ((window as any).Ammo) {
    const lib = (window as any).Ammo;
    typeof lib === "function" ? lib().then(start) : start();
  } else setTimeout(waitForAmmo, 100);
}

waitForAmmo();
