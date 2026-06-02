import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

// Spawn in front of where the drum will be
camera.position.set(0, 1.8, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;

document.querySelector("#app").appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const player = new THREE.Group();
player.add(camera);
scene.add(player);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.update();

// Black room
const roomMaterial = new THREE.MeshStandardMaterial({
  color: 0x000000,
  roughness: 1,
  metalness: 0,
  side: THREE.BackSide
});

const room = new THREE.Mesh(
  new THREE.BoxGeometry(20, 10, 20),
  roomMaterial
);

room.position.y = 4.99;
scene.add(room);

// Very low ambient so room is dark but not impossible to see
scene.add(new THREE.AmbientLight(0xffffff, 0.05));

// Black floor
const floorGeometry = new THREE.PlaneGeometry(20, 20);

const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0x050505,
  roughness: 0.9,
  metalness: 0.0
});

const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0.01;
scene.add(floor);

// Audio
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

let introPanel = null;
let canContinue = false;
let experienceStarted = false;
let introCreated = false;

const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();

const controllerModelFactory = new XRControllerModelFactory();

function createControllerRay() {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -5)
  ]);

  const material = new THREE.LineBasicMaterial({
    color: 0xffffff
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

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + " ";
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;

    if (testWidth > maxWidth && i > 0) {
      ctx.fillText(line, x, y);
      line = words[i] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }

  ctx.fillText(line, x, y);
  return y + lineHeight;
}

function createIntroPanel() {
  if (introPanel) {
    camera.remove(introPanel);

    if (introPanel.material.map) introPanel.material.map.dispose();
    introPanel.material.dispose();
    introPanel.geometry.dispose();

    introPanel = null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 800;

  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "rgba(0, 0, 0, 0.95)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#aaccff";
  ctx.lineWidth = 10;
  ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";

  ctx.font = "bold 72px Arial";
  ctx.fillText("Davula Drum", canvas.width / 2, 120);

  ctx.font = "38px Arial";

  let y = 220;

  y = wrapText(
    ctx,
    "The davula is a traditional drum used in ceremonial, cultural, and musical settings.",
    canvas.width / 2,
    y,
    1100,
    52
  );

  y += 25;

  y = wrapText(
    ctx,
    "In this VR experience, aim your controller at the drum and press the trigger to hear different sounds from the center, middle, rim, and body.",
    canvas.width / 2,
    y,
    1100,
    52
  );

  ctx.font = "bold 42px Arial";
  ctx.fillStyle = canContinue ? "#ffffff" : "#777777";
  ctx.fillText(
    canContinue ? "Press trigger to continue" : "Please read...",
    canvas.width / 2,
    690
  );

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide
  });

  const geometry = new THREE.PlaneGeometry(4.2, 2.4);
  introPanel = new THREE.Mesh(geometry, material);

  // Panel sits directly in front of the user's VR camera
  introPanel.position.set(0, 0, -3);

  camera.add(introPanel);
}

function startIntroTimerOnce() {
  if (introCreated) return;

  introCreated = true;
  createIntroPanel();

  setTimeout(() => {
    canContinue = true;
    createIntroPanel();
  }, 10000);
}

const loader = new GLTFLoader();

loader.load(
  `${import.meta.env.BASE_URL}models/Davula.glb`,
  (gltf) => {
    const model = gltf.scene;

    model.scale.setScalar(10);

    let box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());

  model.position.x -= center.x;

    // move drum 4 meters in front of player
    model.position.z -= center.z;
    model.position.z -= 8;

    box = new THREE.Box3().setFromObject(model);
    model.position.y += 0.01 - box.min.y;

    // Make drum emit light visually
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const oldMaterial = child.material;

        child.material = new THREE.MeshStandardMaterial({
          map: oldMaterial.map || null,
          color: oldMaterial.color || new THREE.Color(0xffffff),
          roughness: 0.5,
          metalness: 0.0,
          emissive: new THREE.Color(0xaaccff),
          emissiveIntensity: 0.9,
          emissiveMap: oldMaterial.map || null
        });

        child.material.needsUpdate = true;
      }
    });

    drumModel = model;
    drumModel.visible = false;

    const finalBox = new THREE.Box3().setFromObject(model);
    const finalSize = finalBox.getSize(new THREE.Vector3());

    drumCenter = finalBox.getCenter(new THREE.Vector3());
    drumTopY = finalBox.max.y;
    drumRadius = Math.max(finalSize.x, finalSize.z) * 0.5;

    scene.add(model);

    // Actual light coming from the drum
    const drumLight = new THREE.PointLight(0xaaccff, 5, 12, 2);
    drumLight.position.copy(drumCenter);
    drumLight.position.y += finalSize.y * 0.35;
    drumLight.visible = false;
    scene.add(drumLight);

    // Soft top glow
    const topLight = new THREE.PointLight(0xaaccff, 2.5, 8, 2);
    topLight.position.copy(drumCenter);
    topLight.position.y = drumTopY + 0.5;
    topLight.visible = false;
    scene.add(topLight);

    drumModel.userData.drumLight = drumLight;
    drumModel.userData.topLight = topLight;

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
  if (!experienceStarted) return;

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

function checkIntroContinue() {
  if (experienceStarted || !canContinue) return;

  const session = renderer.xr.getSession();
  if (!session) return;

  for (const source of session.inputSources) {
    if (!source.gamepad) continue;

    const trigger = source.gamepad.buttons[0];

    if (trigger && trigger.pressed) {
      experienceStarted = true;

      if (introPanel) {
        camera.remove(introPanel);

        if (introPanel.material.map) introPanel.material.map.dispose();
        introPanel.material.dispose();
        introPanel.geometry.dispose();

        introPanel = null;
      }

      if (drumModel) {
        drumModel.visible = true;

        if (drumModel.userData.drumLight) {
          drumModel.userData.drumLight.visible = true;
        }

        if (drumModel.userData.topLight) {
          drumModel.userData.topLight.visible = true;
        }
      }

      console.log("Experience started");
      break;
    }
  }
}

function checkDrumRayHits() {
  if (!experienceStarted) return;
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
        playSound(middleSound);
        console.log("MIDDLE hit");
      } else {
        playSound(rimSound);
        console.log("RIM hit");
      }
    }

    lastTriggerTime = now;
  }
}

renderer.xr.addEventListener("sessionstart", () => {
  // Start the intro only after entering VR
  startIntroTimerOnce();
});

renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();

  controls.update();
  movePlayer(delta);
  checkIntroContinue();
  checkDrumRayHits();

  renderer.render(scene, camera);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});