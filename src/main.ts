import * as THREE from "https://esm.sh/three@0.181.2";
import { OrbitControls } from "https://esm.sh/three@0.181.2/examples/jsm/controls/OrbitControls.js";

// Ammo.js is loaded from CDN in index.html
// deno-lint-ignore no-explicit-any
declare const Ammo: any;

// Types
interface RigidBodyData {
  mesh: THREE.Mesh;
}

// Scene variables
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let clock: THREE.Clock;

// Physics variables
// deno-lint-ignore no-explicit-any
let physicsWorld: any;
// deno-lint-ignore no-explicit-any
const rigidBodies: any[] = [];
// deno-lint-ignore no-explicit-any
let tmpTrans: any;

// Constants
const GRAVITY = -9.82;

// Player / power UI state
// deno-lint-ignore no-explicit-any
let playerRigidBody: any = null;
let _playerMesh: THREE.Mesh | null = null;

const POWER_MAX = 100;
const POWER_RATE = 40; // units per second
const OVERPOWER_THRESHOLD = 85; // above this causes left/right random offset
let power = 0;
let isCharging = false;
let overcharged = false;

// DOM elements we'll create
let powerFillEl: HTMLElement | null = null;

function start() {
  console.log("Start function called");
  initScene();
  console.log("Scene initialized");
  initPhysics();
  console.log("Physics initialized");
  createBodies();
  console.log("Bodies created");
  // Attach input handlers and create UI
  addInputListeners();
  animate();
  console.log("Animation started");
}

function initScene() {
  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);
  scene.fog = new THREE.Fog(0x1a1a1a, 50, 100);

  // Camera setup
  const width = globalThis.innerWidth;
  const height = globalThis.innerHeight;
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  camera.position.set(0, 10, 20);
  camera.lookAt(0, 0, 0);

  // Renderer setup
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.appendChild(renderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(20, 20, 20);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.left = -50;
  directionalLight.shadow.camera.right = 50;
  directionalLight.shadow.camera.top = 50;
  directionalLight.shadow.camera.bottom = -50;
  scene.add(directionalLight);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Clock for delta time
  clock = new THREE.Clock();

  // Handle window resize
  globalThis.addEventListener("resize", onWindowResize);
}

function initPhysics() {
  // Physics configuration
  const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
  const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
  const broadphase = new Ammo.btDbvtBroadphase();
  const solver = new Ammo.btSequentialImpulseConstraintSolver();

  // Create physics world
  physicsWorld = new Ammo.btDiscreteDynamicsWorld(
    dispatcher,
    broadphase,
    solver,
    collisionConfiguration,
  );
  physicsWorld.setGravity(new Ammo.btVector3(0, GRAVITY, 0));

  // For transformations
  tmpTrans = new Ammo.btTransform();
}

function createBodies() {
  // --- Ground with hole ---
  const groundY = 0;
  const size = 40; // full ground size
  const holeSize = 4; // size of the hole

  // Create THREE shape with hole
  const shape = new THREE.Shape();
  shape.moveTo(-size / 2, -size / 2);
  shape.lineTo(size / 2, -size / 2);
  shape.lineTo(size / 2, size / 2);
  shape.lineTo(-size / 2, size / 2);
  shape.lineTo(-size / 2, -size / 2);

  const hs = holeSize / 2;

  // define hole position
  const holeX = 10;  // move 5 units right
  const holeZ = 10; // move 3 units forward

  // create a new Path for the hole
  const holePath = new THREE.Path();
  holePath.moveTo(-hs + holeX, -hs + holeZ);
  holePath.lineTo(hs + holeX, -hs + holeZ);
  holePath.lineTo(hs + holeX, hs + holeZ);
  holePath.lineTo(-hs + holeX, hs + holeZ);
  holePath.lineTo(-hs + holeX, -hs + holeZ);

  // add the new hole
  shape.holes.push(holePath);


  // Extrude geometry for 3D ground
  const extrudeSettings = { depth: 1, bevelEnabled: false };
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, groundY, 0);

  const material = new THREE.MeshStandardMaterial({ color: 0x3a3a3a });
  const groundMesh = new THREE.Mesh(geometry, material);
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // --- Ammo Physics ---
  const triangleMesh = new Ammo.btTriangleMesh();
  const vertices = geometry.attributes.position.array;
  for (let i = 0; i < vertices.length; i += 9) {
    const v0 = new Ammo.btVector3(
      vertices[i],
      vertices[i + 1],
      vertices[i + 2],
    );
    const v1 = new Ammo.btVector3(
      vertices[i + 3],
      vertices[i + 4],
      vertices[i + 5],
    );
    const v2 = new Ammo.btVector3(
      vertices[i + 6],
      vertices[i + 7],
      vertices[i + 8],
    );
    triangleMesh.addTriangle(v0, v1, v2, true);
  }
  const groundShape = new Ammo.btBvhTriangleMeshShape(triangleMesh, true, true);
  createRigidBody(groundShape, 0, { x: 0, y: 0, z: 0 });

  // --- Player ball ---
  const radius = 1;
  const sphereShape = new Ammo.btSphereShape(radius);
  const sphereBody = createRigidBody(sphereShape, 1, { x: 0, y: 2, z: 6 });

  // Color the ball
  (sphereBody.mesh.material as THREE.MeshStandardMaterial).color.set(0x888888);
  scene.add(sphereBody.mesh);
  playerRigidBody = sphereBody.rigidBody;
  _playerMesh = sphereBody.mesh;

  // Set friction and damping for the ball
  playerRigidBody.setFriction(1.0);
  playerRigidBody.setDamping(0.05, 0.92);
}

interface BodyConfig {
  x: number;
  y: number;
  z: number;
}

function createRigidBody(
  // deno-lint-ignore no-explicit-any
  shape: any,
  mass: number,
  position: BodyConfig,
) {
  // Create mesh
  let geometry: THREE.BufferGeometry;
  let material: THREE.Material;

  // If the shape is a box, try to read its half-extents so the visual
  // mesh matches the physics shape. This prevents tiny visual planes while
  // physics uses a large collision box.
  try {
    if (shape instanceof Ammo.btBoxShape) {
      // btBoxShape stores half extents; use them to build the Three mesh
      const halfExt = shape.getHalfExtentsWithMargin();
      const hx = halfExt.x ? halfExt.x() : 1;
      const hy = halfExt.y ? halfExt.y() : 1;
      const hz = halfExt.z ? halfExt.z() : 1;
      geometry = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
      material = new THREE.MeshStandardMaterial({
        color: Math.random() * 0xffffff,
        roughness: 0.7,
      });
    } else if (shape instanceof Ammo.btSphereShape) {
      geometry = new THREE.SphereGeometry(1, 32, 32);
      material = new THREE.MeshStandardMaterial({
        color: Math.random() * 0xffffff,
        roughness: 0.7,
      });
    } else {
      geometry = new THREE.BoxGeometry(2, 2, 2);
      material = new THREE.MeshStandardMaterial({ color: 0x888888 });
    }
  } catch (_err) {
    // Fallback if shape introspection fails
    geometry = new THREE.BoxGeometry(2, 2, 2);
    material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(position.x, position.y, position.z);

  // Create physics body
  const transform = new Ammo.btTransform();
  transform.setIdentity();
  transform.setOrigin(new Ammo.btVector3(position.x, position.y, position.z));

  const motionState = new Ammo.btDefaultMotionState(transform);

  // Calculate local inertia for dynamic bodies
  const localInertia = new Ammo.btVector3(0, 0, 0);
  if (mass > 0) {
    try {
      shape.calculateLocalInertia(mass, localInertia);
    } catch (_e) {
      // ignore if shape doesn't support it
    }
  }

  const rbInfo = new Ammo.btRigidBodyConstructionInfo(
    mass,
    motionState,
    shape,
    localInertia,
  );
  const rigidBody = new Ammo.btRigidBody(rbInfo);

  // Make dynamic bodies active and set some reasonable friction/restitution
  if (mass > 0) {
    try {
      rigidBody.setFriction(0.6);
      rigidBody.setRestitution(0.05);
      if (rigidBody.activate) rigidBody.activate();
    } catch (_e) {
      // ignore
    }
  }

  // Add to physics world
  physicsWorld.addRigidBody(rigidBody);

  // Store reference for updates
  rigidBody.mesh = mesh;
  rigidBodies.push(rigidBody);

  return { mesh, rigidBody };
}

function animate() {
  requestAnimationFrame(animate);

  // Always advance the clock and get delta time
  const deltaTime = clock.getDelta();

  // Update physics only if physicsWorld exists
  if (physicsWorld) {
    physicsWorld.stepSimulation(deltaTime, 10);

    // Update rigid body meshes
    rigidBodies.forEach((rigidBody) => {
      const motionState = rigidBody.getMotionState();
      if (motionState) {
        motionState.getWorldTransform(tmpTrans);
        const origin = tmpTrans.getOrigin();
        const rotation = tmpTrans.getRotation();

        rigidBody.mesh.position.set(origin.x(), origin.y(), origin.z());
        rigidBody.mesh.quaternion.set(
          rotation.x(),
          rotation.y(),
          rotation.z(),
          rotation.w(),
        );
      }
    });
  }

  // If player is charging, accumulate power and optionally nudge the ball forward
  if (isCharging) {
    power += POWER_RATE * deltaTime;
    if (power > POWER_MAX) power = POWER_MAX;
    overcharged = power >= OVERPOWER_THRESHOLD;
    updatePowerUI();
  }

  // Stabilize small velocities to avoid jitter when object is effectively stopped
  if (physicsWorld) {
    rigidBodies.forEach((rigidBody) => {
      try {
        const lv = rigidBody.getLinearVelocity();
        if (lv) {
          const vx = lv.x();
          const vy = lv.y();
          const vz = lv.z();
          const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
          if (speed < 0.03) {
            // zero tiny velocities to prevent drifting
            rigidBody.setLinearVelocity(new Ammo.btVector3(0, 0, 0));
            rigidBody.setAngularVelocity(new Ammo.btVector3(0, 0, 0));
          }
        }
      } catch (_e) {
        // ignore bodies that don't support velocities
      }
    });
  }

  // Update controls
  controls.update();

  // Render
  renderer.render(scene, camera);
}

function onWindowResize() {
  const width = globalThis.innerWidth;
  const height = globalThis.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function createPowerUI() {
  // container
  const container = document.createElement("div");
  container.id = "power-ui";

  const fill = document.createElement("div");
  fill.id = "power-fill";
  container.appendChild(fill);

  const label = document.createElement("div");
  label.id = "power-label";
  label.textContent = "Power";

  document.body.appendChild(container);
  document.body.appendChild(label);

  powerFillEl = fill;
  updatePowerUI();
}

function updatePowerUI() {
  if (!powerFillEl) return;
  const pct = Math.max(0, Math.min(1, power / POWER_MAX));
  powerFillEl.style.height = `${pct * 100}%`;
  if (overcharged) powerFillEl.classList.add("power-over");
  else powerFillEl.classList.remove("power-over");
}

function startCharging() {
  if (isCharging) return;
  isCharging = true;
  power = 0;
  overcharged = false;
  updatePowerUI();
}

function stopCharging() {
  if (!isCharging) return;
  isCharging = false;
  overcharged = power >= OVERPOWER_THRESHOLD;

  // Apply final impulse based on accumulated power
  if (playerRigidBody && physicsWorld) {
    // Use camera forward direction projected on XZ plane so the shot goes
    // where the camera is looking.
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    camDir.y = 0;
    if (camDir.lengthSq() < 1e-5) camDir.set(0, 0, -1);
    camDir.normalize();

    const forwardScalar = (power / POWER_MAX) * 60.0;

    // Overcharge: add a random lateral component perpendicular to camera dir
    let lateralScalar = 0;
    if (overcharged) {
      lateralScalar = (Math.random() * 2.0) * (Math.random() < 0.5 ? -1 : 1);
    }

    const lateralDir = new THREE.Vector3(-camDir.z, 0, camDir.x).normalize();

    const impulseX = camDir.x * forwardScalar + lateralDir.x * lateralScalar;
    const impulseZ = camDir.z * forwardScalar + lateralDir.z * lateralScalar;
    const impulseY = 0.15 * (power / POWER_MAX);

    const impulseVec = new Ammo.btVector3(impulseX, impulseY, impulseZ);

    // Wake up the body before applying force
    playerRigidBody.activate(true);

    // Now apply the impulse
    playerRigidBody.applyCentralImpulse(impulseVec);
  }

  // Reset power slowly for UI
  setTimeout(() => {
    power = 0;
    overcharged = false;
    updatePowerUI();
  }, 120);
}

function addInputListeners() {
  // Create UI if not present
  if (!document.getElementById("power-ui")) createPowerUI();

  globalThis.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).code === "Space") {
      e.preventDefault();
      if (!isCharging) startCharging();
    }
  });

  globalThis.addEventListener("keyup", (e) => {
    if ((e as KeyboardEvent).code === "Space") {
      e.preventDefault();
      stopCharging();
    }
  });
}

// Start the application
console.log("Main.ts loaded, waiting for Ammo...");

let ammoWaitAttempts = 0;
const maxAmmoWaitAttempts = 100; // ~10 seconds at 100ms intervals

function waitForAmmo() {
  // deno-lint-ignore no-explicit-any
  const AmmoLib = (globalThis as any).Ammo;

  ammoWaitAttempts++;
  console.log(
    `Attempt ${ammoWaitAttempts}: Ammo=${typeof AmmoLib}`,
  );

  if (
    AmmoLib &&
    (typeof AmmoLib === "function" || typeof AmmoLib === "object")
  ) {
    console.log("Ammo found! Type:", typeof AmmoLib);
    if (typeof AmmoLib === "function") {
      console.log("Ammo is a function, calling it...");
      AmmoLib().then(start).catch((err: unknown) => {
        console.error("Failed to initialize Ammo:", err);
      });
    } else {
      // Already initialized
      console.log("Ammo is already an object, starting...");
      start();
    }
  } else if (ammoWaitAttempts < maxAmmoWaitAttempts) {
    setTimeout(waitForAmmo, 100);
  } else {
    console.error("Ammo.js failed to load after timeout");
  }
}

// Wait a bit for the script to load
setTimeout(waitForAmmo, 1000);
