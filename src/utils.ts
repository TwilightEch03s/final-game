import * as THREE from "https://esm.sh/three@0.181.2";

// deno-lint-ignore no-explicit-any
declare const Ammo: any;

interface RectSize {
  width: number;
  height: number;
}

interface Position {
  x: number;
  y: number;
}

export function createHole(
  planeSize: RectSize,
  planePosition: Position,
  holeSize: RectSize,
  holePosition: Position,
  scene: THREE.Scene,
  // deno-lint-ignore no-explicit-any
  physicsWorld: any,
  elevation: number = 0,
  rotation: number = 0,
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
  mesh.rotation.x = -Math.PI / 2 + degreesToRadians(rotation);
  mesh.position.y = elevation;

  // Ammo compound shape
  const compound = new Ammo.btCompoundShape();
  const transform = new Ammo.btTransform();
  transform.setIdentity();

  const top = new Ammo.btBoxShape(
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
      (planePosition.y + holePosition.y - planeSize.height - holeSize.height) /
        2,
      elevation,
    ),
  );
  compound.addChildShape(transform, top);

  const bottom = new Ammo.btBoxShape(
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
      (planeSize.height + holeSize.height + planePosition.y + holePosition.y) /
        2,
      elevation,
    ),
  );
  compound.addChildShape(transform, bottom);

  const left = new Ammo.btBoxShape(
    new Ammo.btVector3(
      ((holePosition.x - planePosition.x) +
        (planeSize.width - holeSize.width)) / 2,
      holeSize.height,
      0.1,
    ),
  );
  transform.setOrigin(
    new Ammo.btVector3(
      (planePosition.x + holePosition.x - planeSize.width - holeSize.width) / 2,
      holePosition.y,
      elevation,
    ),
  );

  compound.addChildShape(transform, left);

  const right = new Ammo.btBoxShape(
    new Ammo.btVector3(
      ((planeSize.width - holeSize.width) -
        (holePosition.x - planePosition.x)) / 2,
      holeSize.height,
      0.1,
    ),
  );
  transform.setOrigin(
    new Ammo.btVector3(
      (planePosition.x + holePosition.x + holeSize.width + planeSize.width) / 2,
      holePosition.y,
      elevation,
    ),
  );
  compound.addChildShape(transform, right);

  // Rigid body creation, rotated flat
  const rbTransform = new Ammo.btTransform();
  rbTransform.setIdentity();

  const quat = new Ammo.btQuaternion();
  quat.setRotation(
    new Ammo.btVector3(1, 0, 0),
    -Math.PI / 2 + degreesToRadians(rotation),
  );
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

export function addWalls(
  size: number,
  scene: THREE.Scene,
  // deno-lint-ignore no-explicit-any
  bodies: any,
  // deno-lint-ignore no-explicit-any
  physicsWorld: any,
) {
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

    const wall = addBody(shape, 0, { x, y, z }, scene, bodies, physicsWorld);
    wall.mesh.visible = false;
  });
}

export function addBody(
  shape: Ammo.btCollisionShape,
  mass: number,
  // deno-lint-ignore no-explicit-any
  pos: any,
  scene: THREE.Scene,
  // deno-lint-ignore no-explicit-any
  bodies: any,
  // deno-lint-ignore no-explicit-any
  physicsWorld: any,
) {
  const mesh = shape instanceof Ammo.btSphereShape
    ? new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0x999999 }),
    )
    : new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.5, 1.5),
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
  //body.setRestitution(0.8);

  physicsWorld.addRigidBody(body);
  bodies.push({ body, mesh });

  return { body, mesh };
}

function degreesToRadians(degrees: number) {
  return degrees * (Math.PI / 180);
}
