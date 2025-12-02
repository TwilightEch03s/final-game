declare namespace Ammo {
  class btCollisionShape {
    calculateLocalInertia(mass: number, inertia: btVector3): void;
  }

  class btDiscreteDynamicsWorld {
    setGravity(gravity: btVector3): void;
    stepSimulation(timeStep: number, maxSubSteps?: number): void;
    removeRigidBody(body: btRigidBody): void;
  }

  class btSphereShape extends btCollisionShape {
    constructor(radius: number);
  }

  class btBoxShape extends btCollisionShape {}
  class btCompoundShape extends btCollisionShape {}

  class btRigidBody {
    getMotionState(): btDefaultMotionState | null;
    getLinearVelocity(): btVector3;
    activate(forceActivation?: boolean): void;
    applyCentralImpulse(impulse: btVector3): void;
    setFriction(friction: number): void;
    setRollingFriction(friction: number): void;
    setDamping(linear: number, angular: number): void;
  }

  class btRigidBodyConstructionInfo {}

  class btDefaultMotionState {
    getWorldTransform(transform: btTransform): void;
  }

  class btTransform {
    setIdentity(): void;
    setOrigin(origin: btVector3): void;
    getOrigin(): btVector3;
  }

  class btVector3 {
    constructor(x: number, y: number, z: number);
    x(): number;
    y(): number;
    z(): number;
  }

  class btQuaternion {
    setRotation(axis: btVector3, angle: number): void;
  }

  class btDefaultCollisionConfiguration {}
  class btCollisionDispatcher {
    constructor(config: btDefaultCollisionConfiguration);
  }
  class btDbvtBroadphase {}
  class btSequentialImpulseConstraintSolver {}

  function destroy(obj: unknown): void;
}

export default Ammo;
