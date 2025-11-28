declare namespace Ammo {
  class btCollisionShape {
    calculateLocalInertia(mass: number, inertia: btVector3): void;
  }
  class btDiscreteDynamicsWorld {}

  class btSphereShape extends btCollisionShape {}
  class btBoxShape extends btCollisionShape {}
  class btCompoundShape extends btCollisionShape {}

  class btRigidBody {}
  class btRigidBodyConstructionInfo {}
  class btDefaultMotionState {}
  class btTransform {
    setIdentity(): void;
    setOrigin(origin: btVector3): void;
  }
  class btVector3 {
    constructor(x: number, y: number, z: number);
  }
  class btQuaternion {
    setRotation(axis: btVector3, angle: number): void;
  }
}
