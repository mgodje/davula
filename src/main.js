import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";

let drumTopY = 0;
let drumCenter = new THREE.Vector3();
let drumRadius = 1.5;
let lastHitTime = 0;

let drumModel = null;
let lastTriggerTime = 0;

const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();

const centerSound = new Audio(`${import.meta.env.BASE_URL}audio/Center.m4a`);
const middleSound = new Audio(`${import.meta.env.BASE_URL}audio/Middle.m4a`);
const rimSound = new Audio(`${import.meta.env.BASE_URL}audio/Rim.m4a`);

function playSound(sound) {
  sound.currentTime = 0;
  sound.play();
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccfF);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

camera.position.set(0, 3.0, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;

document.querySelector("#app").appendChild(renderer.domElement);
document.querySelector("#app").appendChild(VRButton.createButton(renderer));

const player = new THREE.Group();
player.add(camera);
scene.add(player);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.update();

// white room
const roomMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  side: THREE.BackSide
});

const room = new THREE.Mesh(
  new THREE.BoxGeometry(20, 10, 20),
  roomMaterial
);

// lift room slightly to stop z-fighting with floor
room.position.y = 4.99;

scene.add(room);

// lighting
scene.add(new THREE.AmbientLight(0xffffff, 1.5));

const keyLight = new THREE.DirectionalLight(0xffffff, 2);
keyLight.position.set(5, 8, 5);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 1);
fillLight.position.set(-5, 4, -5);
scene.add(fillLight);

// Floor
const floorGeometry = new THREE.PlaneGeometry(20, 20);

const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0xe5e5e5,
  roughness: 0.9,
  metalness: 0.0
});

const floor = new THREE.Mesh(floorGeometry, floorMaterial);

floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;

floor.receiveShadow = true;

scene.add(floor);

// Controller visuals
const controllerModelFactory = new XRControllerModelFactory();

const controllerGrip1 = renderer.xr.getControllerGrip(0);
controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
player.add(controllerGrip1);

const controllerGrip2 = renderer.xr.getControllerGrip(1);
controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
player.add(controllerGrip2);

// raycasting
function createControllerRay() {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -5)
  ]);

  const material = new THREE.LineBasicMaterial({
    color: 0x000000
  });

  const line = new THREE.Line(geometry, material);
  line.name = "ray";
  line.scale.z = 1;

  return line;
}

const controller1 = renderer.xr.getController(0);
controller1.add(createControllerRay());
player.add(controller1);

const controller2 = renderer.xr.getController(1);
controller2.add(createControllerRay());
player.add(controller2);

// Load drum
const loader = new GLTFLoader();

loader.load(`${import.meta.env.BASE_URL}models/Davula.glb`, (gltf) => {
  const model = gltf.scene;

  model.scale.setScalar(10);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  model.position.sub(center);

  // hard code to sit on floor
  model.position.y += 2;

  const finalBox = new THREE.Box3().setFromObject(model);
  const finalSize = finalBox.getSize(new THREE.Vector3());

  drumCenter = finalBox.getCenter(new THREE.Vector3());
  drumTopY = finalBox.max.y;

  // Approximate radius from model width/depth
  drumRadius = Math.max(finalSize.x, finalSize.z) * 0.5;

  console.log("Drum center:", drumCenter);
  console.log("Drum top Y:", drumTopY);
  console.log("Drum radius:", drumRadius);

  drumModel = model;
  scene.add(model);

  console.log("GLB loaded successfully", gltf);
  },
  
  undefined,
  (error) => {
    console.error("GLB failed to load:", error);
  }
);

// VR movement
const clock = new THREE.Clock();
const moveSpeed = 2.0;
const turnSpeed = 1.8;
const deadzone = 0.15;

function applyDeadzone(value) {
  return Math.abs(value) > deadzone ? value : 0;
}

function movePlayer(delta) {
  const session = renderer.xr.getSession();
  if (!session) return;

  for (const source of session.inputSources) {
    if (!source.gamepad) continue;

    const handedness = source.handedness;
    const axes = source.gamepad.axes;

    const x = applyDeadzone(axes[2] ?? axes[0] ?? 0);
    const y = applyDeadzone(axes[3] ?? axes[1] ?? 0);

    if (handedness === "left") {
      // Left thumbstick: move around
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      const right = new THREE.Vector3();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      player.position.addScaledVector(forward, -y * moveSpeed * delta);
      player.position.addScaledVector(right, x * moveSpeed * delta);
    }

    if (handedness === "right") {
    // Right thumbstick X: rotate
    player.rotation.y -= x * turnSpeed * delta;

    // Right thumbstick Y: move up/down
    player.position.y += -y * moveSpeed * delta;
    }
  }
}

function checkDrumRayHits() {
  if (!drumModel) return;

  const session = renderer.xr.getSession();
  if (!session) return;

  const now = performance.now();

  for (const source of session.inputSources) {
    if (!source.gamepad) continue;

    const controllerIndex = source.handedness === "left" ? 0 : 1;
    const controller = renderer.xr.getController(controllerIndex);

    const trigger = source.gamepad.buttons[0];

    if (!trigger || !trigger.pressed) continue;

    // prevent repeated rapid-fire while holding trigger
    if (now - lastTriggerTime < 250) continue;

    tempMatrix.identity().extractRotation(controller.matrixWorld);

    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const hits = raycaster.intersectObject(drumModel, true);

    if (hits.length === 0) continue;

    const hit = hits[0];
    const point = hit.point;

    const dx = point.x - drumCenter.x;
    const dz = point.z - drumCenter.z;
    const distanceFromCenter = Math.sqrt(dx * dx + dz * dz);

    const normalizedDistance = distanceFromCenter / drumRadius;

    if (normalizedDistance < 0.33) {
      playSound(centerSound);
      console.log("CENTER ray hit");
    } else if (normalizedDistance < 0.72) {
      // was middle, now rim
      playSound(rimSound);
      console.log("RIM ray hit");
    } else {
      // was rim, now middle
      playSound(middleSound);
      console.log("MIDDLE ray hit");
    }

    lastTriggerTime = now;
  }
}

renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();

  controls.update();
  movePlayer(delta);
  checkDrumRayHits();

  renderer.render(scene, camera);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});