import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202025);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

camera.position.set(0, 1.6, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;

document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const player = new THREE.Group();
player.add(camera);
scene.add(player);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.update();

scene.add(new THREE.AmbientLight(0xffffff, 0.8));

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 5);
scene.add(light);

const grid = new THREE.GridHelper(10, 10);
grid.position.y = 0;
scene.add(grid);

// Controller visuals
const controllerModelFactory = new XRControllerModelFactory();

const controllerGrip1 = renderer.xr.getControllerGrip(0);
controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
player.add(controllerGrip1);

const controllerGrip2 = renderer.xr.getControllerGrip(1);
controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
player.add(controllerGrip2);

// Load drum
const loader = new GLTFLoader();

loader.load("/models/Davula.glb", (gltf) => {
  const model = gltf.scene;

  model.scale.setScalar(10);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);

  model.position.y += 2;

  scene.add(model);

  console.log("GLB loaded", gltf);
});

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
      // Right thumbstick: smooth turn
      player.rotation.y -= x * turnSpeed * delta;
    }
  }
}

renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();

  controls.update();
  movePlayer(delta);

  renderer.render(scene, camera);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});