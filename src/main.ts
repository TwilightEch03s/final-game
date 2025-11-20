import AmmoLib from "https://esm.sh/ammo.js";
import * as THREE from "https://esm.sh/three@0.181.2";

console.log("test");
console.log("Ammol.js loaded", AmmoLib);

const hello = document.createElement("h1");
hello.id = "test";
hello.textContent = "Hello World!";
document.body.append(hello);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  globalThis.innerWidth / globalThis.innerHeight,
  0.1,
  1000,
);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(globalThis.innerWidth, globalThis.innerHeight);
document.body.appendChild(renderer.domElement);

renderer.render(scene, camera);
