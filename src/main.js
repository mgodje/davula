import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

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
document.body.appendChild(VRButton.createButton(renderer));

const player = new THREE.Group();
player.add(camera);
scene.add(player);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.update();

const roomMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  side: THREE.BackSide
});

const room = new THREE.Mesh(
  new THREE.BoxGeometry(20, 10, 20),
  roomMaterial
);

room.position.y = 4.99;
scene.add(room);

scene.add(new THREE.AmbientLight(0xffffff, 1.5));

const keyLight = new THREE.DirectionalLight(0xffffff, 2);
keyLight.position.set(5, 8, 5);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 1);
fillLight.position.set(-5, 4, -5);
scene.add(fillLight);

const floorGeometry = new THREE.PlaneGeometry(20, 20);

const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0xe5e5e5,
  roughness: 0.9,
  metalness: 0.0
});

const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0.01;
scene.add(floor);

const centerSound = new Audio(`${import.meta.env.BASE_URL}audio/Center.m4a`);
const middleSound = new Audio(`${import.meta.env.BASE_URL}audio/Middle.m4a`);
const rimSound = new Audio(`${import.meta.env.BASE_URL}audio/Rim.m4a`);

function playSound(sound) {
  sound.currentTime = 0;
  sound.play();
}

let drumModel = null;
let drumTopY = 0;
let drumCenter = new THREE.Vector3();
let drumRadius = 1.5;
let lastTriggerTime = 0;

const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();

const controllerModelFactory = new XRControllerModelFactory();

function createControllerRay() {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -5)
  ]);

  const material = new THREE.LineBasicMaterial({
    color: 0x000000
  });

  return new THREE.Line(geometry, material);
}

const controller1 = renderer.xr.getController(0);
controller1.add(createControllerRay());
player.add(controller1);

const controller2 = renderer.xr.getController(1);
controller2.add(createControllerRay());
player.add(controller2);

const controllerGrip1 = renderer.xr.getControllerGrip(0);
controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
player.add(controllerGrip1);

const controllerGrip2 = renderer.xr.getControllerGrip(1);
controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
player.add(controllerGrip2);

const loader = new GLTFLoader();

loader.load(
  `${import.meta.env.BASE_URL}models/Davula.glb`,
  (gltf) => {
    const model = gltf.scene;

    model.scale.setScalar(10);

    let box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());

    model.position.x -= center.x;
    model.position.z -= center.z;

    box = new THREE.Box3().setFromObject(model);
    model.position.y += 0.01 - box.min.y;

    drumModel = model;

    const finalBox = new THREE.Box3().setFromObject(model);
    const finalSize = finalBox.getSize(new THREE.Vector3());

    drumCenter = finalBox.getCenter(new THREE.Vector3());
    drumTopY = finalBox.max.y;
    drumRadius = Math.max(finalSize.x, finalSize.z) * 0.5;

    scene.add(model);

    console.log("GLB loaded successfully", gltf);
  },
  undefined,
  (error) => {
    console.error("GLB failed to load:", error);
  }
);

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
      player.rotation.y -= x * turnSpeed * delta;
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
    if (now - lastTriggerTime < 250) continue;

    tempMatrix.identity().extractRotation(controller.matrixWorld);

    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const hits = raycaster.intersectObject(drumModel, true);

    if (hits.length === 0) continue;

    const hit = hits[0];
    const point = hit.point;

    const topThreshold = drumTopY - 0.15;

    if (point.y < topThreshold) {
      playSound(rimSound);
      console.log("BODY hit -> RIM sound");
    } else {
      const dx = point.x - drumCenter.x;
      const dz = point.z - drumCenter.z;
      const distanceFromCenter = Math.sqrt(dx * dx + dz * dz);
      const normalizedDistance = distanceFromCenter / drumRadius;

      if (normalizedDistance < 0.33) {
        playSound(centerSound);
        console.log("CENTER hit");
      } else if (normalizedDistance < 0.72) {
        playSound(rimSound);
        console.log("RIM hit");
      } else {
        playSound(middleSound);
        console.log("MIDDLE hit");
      }
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