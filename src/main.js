import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";


// Server

const LOG_SERVER_URL = "https://lemon-safari-unpopular.ngrok-free.app/log";
// ============================================================
// SCENE
// ============================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

camera.position.set(0, 1.8, 6);

const renderer = new THREE.WebGLRenderer({
  antialias: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;

document.querySelector("#app").appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

// ============================================================
// PLAYER
// ============================================================

const player = new THREE.Group();

player.add(camera);
scene.add(player);

const controls = new OrbitControls(
  camera,
  renderer.domElement
);

controls.target.set(0, 1, -8);
controls.update();

// ============================================================
// ROOM
// ============================================================

const roomMaterial =
  new THREE.MeshStandardMaterial({
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

scene.add(
  new THREE.AmbientLight(
    0xffffff,
    0.05
  )
);

// ============================================================
// FLOOR
// ============================================================

const floorGeometry =
  new THREE.PlaneGeometry(
    20,
    20
  );

const floorMaterial =
  new THREE.MeshStandardMaterial({
    color: 0x050505,
    roughness: 0.9,
    metalness: 0.0
  });

const floor = new THREE.Mesh(
  floorGeometry,
  floorMaterial
);

floor.rotation.x =
  -Math.PI / 2;

floor.position.y = 0.01;

scene.add(floor);

// ============================================================
// AUDIO
// ============================================================

const centerSound =
  new Audio(
    `${import.meta.env.BASE_URL}audio/Center.m4a`
  );

const middleSound =
  new Audio(
    `${import.meta.env.BASE_URL}audio/Middle.m4a`
  );

const rimSound =
  new Audio(
    `${import.meta.env.BASE_URL}audio/Rim.m4a`
  );

function playSound(sound) {

  sound.currentTime = 0;

  sound.play().catch(
    (error) => {
      console.warn(
        "Audio playback failed:",
        error
      );
    }
  );
}

// ============================================================
// DRUM STATE
// ============================================================

let drumModel = null;

let drumTopY = 0;

let drumCenter =
  new THREE.Vector3();

let drumRadius = 1.5;

function setDrumVisible(
  visible
) {

  if (!drumModel) {
    return;
  }

  drumModel.visible =
    visible;

  if (
    drumModel.userData
      .drumLight
  ) {

    drumModel.userData
      .drumLight.visible =
      visible;
  }

  if (
    drumModel.userData
      .topLight
  ) {

    drumModel.userData
      .topLight.visible =
      visible;
  }
}

// ============================================================
// SIMULATION STATES
// ============================================================

const STATE = {

  WAITING_FOR_VR:
    "waiting_for_vr",

  START:
    "start",

  INTRO_1:
    "intro_1",

  INTRO_2:
    "intro_2",

  ACTIVE:
    "active",

  END_CONFIRM:
    "end_confirm",

  ENDED:
    "ended"
};

let simulationState =
  STATE.WAITING_FOR_VR;

let stateBeforeEndConfirm =
  STATE.ACTIVE;

let controlsEnabled = false;

let intro1Ready = false;

let intro2Ready = false;

// Quest right-controller B button.
// If B does not work on your headset,
// try changing this number.
const END_BUTTON_INDEX = 5;

// ============================================================
// LOGGING
// ============================================================

let simulationLogging =
  false;

let simulationStartPerf = 0;

let simulationStartTime =
  null;

const simulationLog = [];

// You can inspect this in DevTools:
window.davulaLog =
  simulationLog;

function roundNumber(
  value,
  digits = 4
) {

  return Number(
    value.toFixed(digits)
  );
}

function vectorToObject(
  vector
) {

  return {

    x:
      roundNumber(
        vector.x
      ),

    y:
      roundNumber(
        vector.y
      ),

    z:
      roundNumber(
        vector.z
      )
  };
}

function getHeadWorldPosition() {

  const position =
    new THREE.Vector3();

  if (
    renderer.xr.isPresenting
  ) {

    renderer.xr
      .getCamera(camera)
      .getWorldPosition(
        position
      );

  } else {

    camera.getWorldPosition(
      position
    );
  }

  return position;
}

function getWorldState() {

  return {

    playerPosition:
      vectorToObject(
        player.position
      ),

    headWorldPosition:
      vectorToObject(
        getHeadWorldPosition()
      ),

    playerRotationY:
      roundNumber(
        player.rotation.y
      )
  };
}

function logEvent(
  type,
  details = {}
) {

  if (
    !simulationLogging &&
    type !==
      "simulation_start"
  ) {

    return;
  }

  const now =
    new Date();

  const entry = {

    timestamp:
      now.toISOString(),

    localTime:
      now.toLocaleString(),

    elapsedMs:
      simulationLogging
        ? Math.round(
            performance.now() -
            simulationStartPerf
          )
        : 0,

    type,

    ...details
  };

  simulationLog.push(
    entry
  );

  console.log(
    "[DAVULA LOG]",
    entry
  );
}

function startSimulationLog(
  handedness
) {

  simulationLog.length = 0;

  simulationStartPerf =
    performance.now();

  simulationStartTime =
    new Date();

  simulationLogging =
    true;

  logEvent(
    "simulation_start",
    {

      action:
        "start_button_pressed",

      controller:
        handedness,

      ...getWorldState()
    }
  );
}

async function sendSimulationLogToLaptop() {

  const payload = {
    simulation: "Davula VR",

    startedAt: simulationStartTime
      ? simulationStartTime.toISOString()
      : null,

    endedAt: new Date().toISOString(),

    eventCount: simulationLog.length,

    events: simulationLog
  };

  console.log(
    "Sending Davula session log:",
    payload
  );

  try {

    const response = await fetch(
      LOG_SERVER_URL,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      throw new Error(
        `Server returned ${response.status}`
      );
    }

    const result = await response.json();

    console.log(
      "Log successfully saved on laptop:",
      result.filename
    );

    return true;

  } catch (error) {

    console.error(
      "Could not send log to laptop:",
      error
    );

    return false;
  }
}

// ============================================================
// CONTROLLERS
// ============================================================

const raycaster =
  new THREE.Raycaster();

const tempMatrix =
  new THREE.Matrix4();

const controllerModelFactory =
  new XRControllerModelFactory();

function createControllerRay() {

  const geometry =
    new THREE.BufferGeometry()
      .setFromPoints([
        new THREE.Vector3(
          0,
          0,
          0
        ),

        new THREE.Vector3(
          0,
          0,
          -8
        )
      ]);

  const material =
    new THREE.LineBasicMaterial({
      color:
        0xffffff
    });

  return new THREE.Line(
    geometry,
    material
  );
}

const controller1 =
  renderer.xr.getController(
    0
  );

controller1.add(
  createControllerRay()
);

player.add(
  controller1
);

const controller2 =
  renderer.xr.getController(
    1
  );

controller2.add(
  createControllerRay()
);

player.add(
  controller2
);

const controllerGrip1 =
  renderer.xr
    .getControllerGrip(
      0
    );

controllerGrip1.add(
  controllerModelFactory
    .createControllerModel(
      controllerGrip1
    )
);

player.add(
  controllerGrip1
);

const controllerGrip2 =
  renderer.xr
    .getControllerGrip(
      1
    );

controllerGrip2.add(
  controllerModelFactory
    .createControllerModel(
      controllerGrip2
    )
);

player.add(
  controllerGrip2
);

function getControllerForHand(
  handedness
) {

  return handedness ===
    "left"
    ? controller1
    : controller2;
}

function setControllerRay(
  controller
) {

  tempMatrix
    .identity()
    .extractRotation(
      controller.matrixWorld
    );

  raycaster.ray.origin
    .setFromMatrixPosition(
      controller.matrixWorld
    );

  raycaster.ray.direction
    .set(
      0,
      0,
      -1
    )
    .applyMatrix4(
      tempMatrix
    )
    .normalize();
}

// ============================================================
// VR UI
// ============================================================

let uiPanelGroup =
  null;

let uiButtons = [];

function disposeMaterial(
  material
) {

  if (!material) {
    return;
  }

  if (
    material.map
  ) {

    material.map.dispose();
  }

  material.dispose();
}

function clearUIPanel() {

  if (
    !uiPanelGroup
  ) {

    return;
  }

  camera.remove(
    uiPanelGroup
  );

  uiPanelGroup.traverse(
    (child) => {

      if (
        child.geometry
      ) {

        child.geometry
          .dispose();
      }

      if (
        child.material
      ) {

        if (
          Array.isArray(
            child.material
          )
        ) {

          child.material
            .forEach(
              disposeMaterial
            );

        } else {

          disposeMaterial(
            child.material
          );
        }
      }
    }
  );

  uiPanelGroup = null;

  uiButtons = [];
}

function wrapText(
  ctx,
  text,
  x,
  y,
  maxWidth,
  lineHeight
) {

  const paragraphs =
    text.split("\n");

  for (
    const paragraph
    of paragraphs
  ) {

    if (
      paragraph.trim() ===
      ""
    ) {

      y +=
        lineHeight *
        0.7;

      continue;
    }

    const words =
      paragraph.split(
        " "
      );

    let line = "";

    for (
      let i = 0;
      i < words.length;
      i++
    ) {

      const testLine =
        `${line}${words[i]} `;

      const testWidth =
        ctx.measureText(
          testLine
        ).width;

      if (
        testWidth >
          maxWidth &&
        line !== ""
      ) {

        ctx.fillText(
          line.trim(),
          x,
          y
        );

        line =
          `${words[i]} `;

        y +=
          lineHeight;

      } else {

        line =
          testLine;
      }
    }

    if (
      line.trim()
    ) {

      ctx.fillText(
        line.trim(),
        x,
        y
      );

      y +=
        lineHeight;
    }
  }

  return y;
}

function createPanelTexture(
  title,
  body
) {

  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width = 1600;

  canvas.height = 900;

  const ctx =
    canvas.getContext(
      "2d"
    );

  ctx.fillStyle =
    "rgba(0, 0, 0, 0.96)";

  ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.strokeStyle =
    "#aaccff";

  ctx.lineWidth = 10;

  ctx.strokeRect(
    30,
    30,
    canvas.width - 60,
    canvas.height - 60
  );

  ctx.fillStyle =
    "#ffffff";

  ctx.textAlign =
    "center";

  ctx.font =
    "bold 70px Arial";

  ctx.fillText(
    title,
    canvas.width / 2,
    125
  );

  ctx.font =
    "38px Arial";

  ctx.textAlign =
    "left";

  wrapText(
    ctx,
    body,
    140,
    220,
    1320,
    54
  );

  const texture =
    new THREE.CanvasTexture(
      canvas
    );

  texture.colorSpace =
    THREE.SRGBColorSpace;

  return texture;
}

function createButtonTexture(
  label,
  background =
    "#17324d"
) {

  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width = 768;

  canvas.height = 220;

  const ctx =
    canvas.getContext(
      "2d"
    );

  ctx.fillStyle =
    background;

  ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.strokeStyle =
    "#ffffff";

  ctx.lineWidth = 10;

  ctx.strokeRect(
    8,
    8,
    canvas.width - 16,
    canvas.height - 16
  );

  ctx.fillStyle =
    "#ffffff";

  ctx.font =
    "bold 54px Arial";

  ctx.textAlign =
    "center";

  ctx.textBaseline =
    "middle";

  ctx.fillText(
    label,
    canvas.width / 2,
    canvas.height / 2
  );

  const texture =
    new THREE.CanvasTexture(
      canvas
    );

  texture.colorSpace =
    THREE.SRGBColorSpace;

  return texture;
}

function addUIButton(
  group,
  {
    label,
    action,
    x = 0,
    y = -0.83,
    width = 1.7,
    height = 0.48,
    background =
      "#17324d"
  }
) {

  const material =
    new THREE.MeshBasicMaterial({
      map:
        createButtonTexture(
          label,
          background
        ),

      transparent:
        true,

      side:
        THREE.DoubleSide
    });

  const button =
    new THREE.Mesh(
      new THREE.PlaneGeometry(
        width,
        height
      ),
      material
    );

  button.position.set(
    x,
    y,
    0.025
  );

  button.userData.action =
    action;

  button.userData.label =
    label;

  group.add(
    button
  );

  uiButtons.push(
    button
  );
}

function showUIPanel({
  title,
  body,
  buttons = []
}) {

  clearUIPanel();

  const group =
    new THREE.Group();

  group.position.set(
    0,
    0,
    -3
  );

  const panelMaterial =
    new THREE.MeshBasicMaterial({
      map:
        createPanelTexture(
          title,
          body
        ),

      transparent:
        true,

      side:
        THREE.DoubleSide
    });

  const panel =
    new THREE.Mesh(
      new THREE.PlaneGeometry(
        4.8,
        2.7
      ),
      panelMaterial
    );

  group.add(
    panel
  );

  for (
    const buttonConfig
    of buttons
  ) {

    addUIButton(
      group,
      buttonConfig
    );
  }

  uiPanelGroup =
    group;

  camera.add(
    group
  );
}

// ============================================================
// START PANEL
// ============================================================

function showStartPanel() {

  showUIPanel({

    title:
      "Davula VR",

    body:
      "Welcome to the Davula VR experience. Press START to begin simulation.",

    buttons: [
      {
        label:
          "START SIMULATION",

        action:
          "start",

        width:
          2.2
      }
    ]
  });
}

// ============================================================
// INTRO PANEL 1
// ============================================================

function showIntro1() {

  const body =
    "The Davula is a traditional drum used in South West Asian and North African regions. It has an important place in ceremonial contexts. Its sound is part of a living performance tradition in which drumming supports ceremony, movement, and communal participation.";

  showUIPanel({

    title:
      "History of the Davula",

    body,

    buttons:
      intro1Ready
        ? [
            {
              label:
                "NEXT",

              action:
                "intro1_next"
            }
          ]
        : []
  });
}

// ============================================================
// INTRO PANEL 2
// ============================================================

function showIntro2() {

  const body =
    "In this VR experience, aim your controller ray at the drum and press the trigger to hear different sounds from the center, middle, rim, and body. Use the left thumbstick to move forward, backward, and side-to-side. Use the right thumbstick to turn and move vertically. During the simulation, press the B button on the right controller if you want to end the session.";

  showUIPanel({

    title:
      "How to Interact",

    body,

    buttons:
      intro2Ready
        ? [
            {
              label:
                "NEXT",

              action:
                "intro2_next"
            }
          ]
        : []
  });
}

// ============================================================
// END CONFIRMATION
// ============================================================

function showEndConfirmation() {

  showUIPanel({

    title:
      "End Simulation?",

    body:
      "Do you want to end the simulation? Choosing YES will stop interaction. Choosing NO will continue from where you left off.",

    buttons: [

      {
        label:
          "YES - END",

        action:
          "end_yes",

        x:
          -1.05,

        width:
          1.7,

        background:
          "#5a1d1d"
      },

      {
        label:
          "NO - CONTINUE",

        action:
          "end_no",

        x:
          1.05,

        width:
          1.9,

        background:
          "#17452c"
      }
    ]
  });
}

function showEndedPanel() {

  showUIPanel({

    title:
      "Simulation Ended",

    body:
      "The Davula VR simulation has ended.",
  });
}

function restorePanelForState(
  state
) {

  if (
    state ===
    STATE.INTRO_1
  ) {

    showIntro1();

  } else if (
    state ===
    STATE.INTRO_2
  ) {

    showIntro2();

  } else if (
    state ===
    STATE.START
  ) {

    showStartPanel();

  } else {

    clearUIPanel();
  }
}

// ============================================================
// UI ACTIONS
// ============================================================

function beginIntro1(
  handedness
) {

  startSimulationLog(
    handedness
  );

  logEvent(
    "button_press",
    {

      controller:
        handedness,

      buttonIndex:
        0,

      button:
        "trigger",

      context:
        "start_simulation",

      ...getWorldState()
    }
  );

  logEvent(
    "ui_action",
    {

      action:
        "start_simulation",

      controller:
        handedness,

      ...getWorldState()
    }
  );

  simulationState =
    STATE.INTRO_1;

  controlsEnabled =
    false;

  setDrumVisible(
    false
  );

  intro1Ready =
    false;

  showIntro1();

  setTimeout(
    () => {

      intro1Ready =
        true;

      logEvent(
        "panel_ready",
        {

          panel:
            "history_of_davula",

          actionAvailable:
            "next"
        }
      );

      if (
        simulationState ===
        STATE.INTRO_1
      ) {

        showIntro1();
      }

    },
    5000
  );
}

function advanceToIntro2(
  handedness
) {

  logEvent(
    "ui_action",
    {

      action:
        "intro_1_next",

      controller:
        handedness,

      ...getWorldState()
    }
  );

  simulationState =
    STATE.INTRO_2;

  intro2Ready =
    false;

  showIntro2();

  setTimeout(
    () => {

      intro2Ready =
        true;

      logEvent(
        "panel_ready",
        {

          panel:
            "how_to_interact",

          actionAvailable:
            "next"
        }
      );

      if (
        simulationState ===
        STATE.INTRO_2
      ) {

        showIntro2();
      }

    },
    5000
  );
}

function beginDrumExperience(
  handedness
) {

  logEvent(
    "ui_action",
    {

      action:
        "intro_2_next_enter_drum_scene",

      controller:
        handedness,

      ...getWorldState()
    }
  );

  simulationState =
    STATE.ACTIVE;

  controlsEnabled =
    true;

  clearUIPanel();

  setDrumVisible(
    true
  );
}

function openEndConfirmation(
  handedness
) {

  if (
    !simulationLogging
  ) {

    return;
  }

  if (
    simulationState ===
      STATE.END_CONFIRM ||
    simulationState ===
      STATE.ENDED
  ) {

    return;
  }

  stateBeforeEndConfirm =
    simulationState;

  logEvent(
    "end_simulation_requested",
    {

      controller:
        handedness,

      button:
        "B",

      buttonIndex:
        END_BUTTON_INDEX,

      previousState:
        stateBeforeEndConfirm,

      ...getWorldState()
    }
  );

  simulationState =
    STATE.END_CONFIRM;

  controlsEnabled =
    false;

  showEndConfirmation();
}

function cancelEndSimulation(
  handedness
) {

  logEvent(
    "end_simulation_cancelled",
    {

      controller:
        handedness,

      action:
        "no_continue",

      returningToState:
        stateBeforeEndConfirm,

      ...getWorldState()
    }
  );

  simulationState =
    stateBeforeEndConfirm;

  controlsEnabled =
    simulationState ===
    STATE.ACTIVE;

  restorePanelForState(
    simulationState
  );
}

async function confirmEndSimulation(
  handedness
) {

  logEvent(
    "end_simulation_confirmed",
    {

      controller:
        handedness,

      action:
        "yes_end",

      ...getWorldState()
    }
  );

  logEvent(
    "simulation_end",
    {

      reason:
        "user_confirmed_end",

      ...getWorldState()
    }
  );

  simulationState =
    STATE.ENDED;

  controlsEnabled =
    false;

  setDrumVisible(
    false
  );

  showEndedPanel();

  const saved = await sendSimulationLogToLaptop();

  if (saved) {
    console.log("Session log successfully saved to laptop.");
  } else {
    console.error("Session log could not be saved to laptop.");
  }

  simulationLogging = false;
}

function handleUIButtonAction(
  action,
  handedness
) {

  if (
    action === "start" &&
    simulationState ===
      STATE.START
  ) {

    beginIntro1(
      handedness
    );

    return;
  }

  if (
    action ===
      "intro1_next" &&
    simulationState ===
      STATE.INTRO_1 &&
    intro1Ready
  ) {

    advanceToIntro2(
      handedness
    );

    return;
  }

  if (
    action ===
      "intro2_next" &&
    simulationState ===
      STATE.INTRO_2 &&
    intro2Ready
  ) {

    beginDrumExperience(
      handedness
    );

    return;
  }

  if (
    action ===
      "end_yes" &&
    simulationState ===
      STATE.END_CONFIRM
  ) {

    confirmEndSimulation(
      handedness
    );

    return;
  }

  if (
    action ===
      "end_no" &&
    simulationState ===
      STATE.END_CONFIRM
  ) {

    cancelEndSimulation(
      handedness
    );
  }
}

function tryPressUIButton(
  source
) {

  if (
    !uiButtons.length
  ) {

    return false;
  }

  const controller =
    getControllerForHand(
      source.handedness
    );

  setControllerRay(
    controller
  );

  const hits =
    raycaster.intersectObjects(
      uiButtons,
      false
    );

  if (
    !hits.length
  ) {

    return false;
  }

  const button =
    hits[0].object;

  const action =
    button.userData.action;

  if (
    simulationLogging
  ) {

    logEvent(
      "ui_button_trigger",
      {

        controller:
          source.handedness,

        action,

        label:
          button.userData.label,

        ...getWorldState()
      }
    );
  }

  handleUIButtonAction(
    action,
    source.handedness
  );

  return true;
}

// ============================================================
// LOAD DAVULA
// ============================================================

const loader =
  new GLTFLoader();

loader.load(

  `${import.meta.env.BASE_URL}models/Davula.glb`,

  (gltf) => {

    const model =
      gltf.scene;

    model.scale.setScalar(
      10
    );

    let box =
      new THREE.Box3()
        .setFromObject(
          model
        );

    const center =
      box.getCenter(
        new THREE.Vector3()
      );

    model.position.x -=
      center.x;

    model.position.z -=
      center.z;

    // Keep drum 8 units in front
    model.position.z -= 8;

    box =
      new THREE.Box3()
        .setFromObject(
          model
        );

    model.position.y +=
      0.01 -
      box.min.y;

    model.traverse(
      (child) => {

        if (
          child.isMesh &&
          child.material
        ) {

          const oldMaterial =
            child.material;

          child.material =
            new THREE.MeshStandardMaterial({

              map:
                oldMaterial.map ||
                null,

              color:
                oldMaterial.color ||
                new THREE.Color(
                  0xffffff
                ),

              roughness:
                0.5,

              metalness:
                0.0,

              emissive:
                new THREE.Color(
                  0xaaccff
                ),

              emissiveIntensity:
                0.9,

              emissiveMap:
                oldMaterial.map ||
                null
            });

          child.material
            .needsUpdate =
            true;
        }
      }
    );

    drumModel =
      model;

    const shouldShowDrum =
      simulationState === STATE.ACTIVE;

    drumModel.visible =
      shouldShowDrum;

    const finalBox =
      new THREE.Box3()
        .setFromObject(model);

    const finalSize =
      finalBox.getSize(
        new THREE.Vector3()
      );

    drumCenter =
      finalBox.getCenter(
        new THREE.Vector3()
      );

    drumTopY =
      finalBox.max.y;

    drumRadius =
      Math.max(
        finalSize.x,
        finalSize.z
      ) * 0.5;

    scene.add(model);

    // Drum glow
    const drumLight =
      new THREE.PointLight(
        0xaaccff,
        5,
        12,
        2
      );

    drumLight.position.copy(
      drumCenter
    );

    drumLight.position.y +=
      finalSize.y * 0.35;

    drumLight.visible =
      shouldShowDrum;

    scene.add(
      drumLight
    );

    const topLight =
      new THREE.PointLight(
        0xaaccff,
        2.5,
        8,
        2
      );

    topLight.position.copy(
      drumCenter
    );

    topLight.position.y =
      drumTopY + 0.5;

    topLight.visible =
      shouldShowDrum;

    scene.add(
      topLight
    );

    drumModel.userData.drumLight =
      drumLight;

    drumModel.userData.topLight =
      topLight;

    // If we're not in VR, show the desktop preview.
    if (!renderer.xr.isPresenting) {
      setDrumVisible(true);
    }

    // If the user is already in the ACTIVE simulation,
    // make absolutely sure the model is visible.
    if (simulationState === STATE.ACTIVE) {
      setDrumVisible(true);
    }

    console.log(
      "GLB loaded successfully",
      gltf
    );
  }
);

// ============================================================
// MOVEMENT
// ============================================================

const clock =
  new THREE.Clock();

const moveSpeed =
  2.0;

const turnSpeed =
  1.8;

const deadzone =
  0.15;

const stickSmoothing =
  12;

const smoothedLeftStick =
  new THREE.Vector2();

const smoothedRightStick =
  new THREE.Vector2();

function applyDeadzone(
  value
) {

  return Math.abs(
    value
  ) > deadzone
    ? value
    : 0;
}

function getThumbstickAxes(
  source
) {

  const axes =
    source.gamepad
      ?.axes ||
    [];

  return {

    x:
      applyDeadzone(
        axes[2] ??
        axes[0] ??
        0
      ),

    y:
      applyDeadzone(
        axes[3] ??
        axes[1] ??
        0
      )
  };
}

function movePlayer(
  delta
) {

  if (
    simulationState !==
    STATE.ACTIVE
  ) {

    return;
  }

  if (
    !controlsEnabled
  ) {

    return;
  }

  const session =
    renderer.xr
      .getSession();

  if (
    !session
  ) {

    return;
  }

  const smoothingFactor =
    1 -
    Math.exp(
      -stickSmoothing *
      delta
    );

  for (
    const source
    of session.inputSources
  ) {

    if (
      !source.gamepad
    ) {

      continue;
    }

    const {
      x,
      y
    } =
      getThumbstickAxes(
        source
      );

    // ========================================================
    // LEFT STICK
    // Move forward/back + strafe
    // ========================================================

    if (
      source.handedness ===
      "left"
    ) {

      smoothedLeftStick.x +=
        (
          x -
          smoothedLeftStick.x
        ) *
        smoothingFactor;

      smoothedLeftStick.y +=
        (
          y -
          smoothedLeftStick.y
        ) *
        smoothingFactor;

      const sx =
        smoothedLeftStick.x;

      const sy =
        smoothedLeftStick.y;

      if (
        Math.abs(sx) <
          0.001 &&
        Math.abs(sy) <
          0.001
      ) {

        continue;
      }

      const beforePosition =
        player.position.clone();

      const forward =
        new THREE.Vector3();

      camera.getWorldDirection(
        forward
      );

      forward.y = 0;

      forward.normalize();

      const right =
        new THREE.Vector3();

      right
        .crossVectors(
          forward,
          new THREE.Vector3(
            0,
            1,
            0
          )
        )
        .normalize();

      // IMPORTANT:
      // push forward = move forward
      // pull backward = move backward
      player.position
        .addScaledVector(
          forward,
          -sy *
          moveSpeed *
          delta
        );

      player.position
        .addScaledVector(
          right,
          sx *
          moveSpeed *
          delta
        );

      if (
        !beforePosition.equals(
          player.position
        )
      ) {

        logEvent(
          "movement",
          {

            controller:
              "left",

            movementType:
              "horizontal_locomotion",

            stick: {

              x:
                roundNumber(
                  sx
                ),

              y:
                roundNumber(
                  sy
                )
            },

            fromPlayerPosition:
              vectorToObject(
                beforePosition
              ),

            ...getWorldState()
          }
        );
      }
    }

    // ========================================================
    // RIGHT STICK
    // Turn + move vertically
    // ========================================================

    if (
      source.handedness ===
      "right"
    ) {

      smoothedRightStick.x +=
        (
          x -
          smoothedRightStick.x
        ) *
        smoothingFactor;

      smoothedRightStick.y +=
        (
          y -
          smoothedRightStick.y
        ) *
        smoothingFactor;

      const sx =
        smoothedRightStick.x;

      const sy =
        smoothedRightStick.y;

      if (
        Math.abs(sx) <
          0.001 &&
        Math.abs(sy) <
          0.001
      ) {

        continue;
      }

      const beforePosition =
        player.position.clone();

      const beforeRotationY =
        player.rotation.y;

      player.rotation.y -=
        sx *
        turnSpeed *
        delta;

      player.position.y +=
        -sy *
        moveSpeed *
        delta;

      if (
        !beforePosition.equals(
          player.position
        ) ||
        beforeRotationY !==
          player.rotation.y
      ) {

        logEvent(
          "movement",
          {

            controller:
              "right",

            movementType:
              "turn_and_vertical_locomotion",

            stick: {

              x:
                roundNumber(
                  sx
                ),

              y:
                roundNumber(
                  sy
                )
            },

            fromPlayerPosition:
              vectorToObject(
                beforePosition
              ),

            fromPlayerRotationY:
              roundNumber(
                beforeRotationY
              ),

            ...getWorldState()
          }
        );
      }
    }
  }
}

// ============================================================
// PHYSICAL HEADSET MOVEMENT LOGGING
// ============================================================

const lastLoggedHeadPosition =
  new THREE.Vector3();

let hasHeadSample =
  false;

let lastHeadLogTime =
  0;

function logTrackedHeadMovement() {

  if (
    !simulationLogging
  ) {

    return;
  }

  if (
    !renderer.xr.isPresenting
  ) {

    return;
  }

  const now =
    performance.now();

  const current =
    getHeadWorldPosition();

  if (
    !hasHeadSample
  ) {

    lastLoggedHeadPosition
      .copy(
        current
      );

    lastHeadLogTime =
      now;

    hasHeadSample =
      true;

    return;
  }

  // Only log meaningful motion.
  const moved =
    current.distanceTo(
      lastLoggedHeadPosition
    ) >= 0.01;

  // Max approximately 20
  // physical tracking logs/sec.
  if (
    moved &&
    now -
      lastHeadLogTime >=
      50
  ) {

    logEvent(
      "tracked_movement",
      {

        movementType:
          "physical_headset_movement",

        fromHeadWorldPosition:
          vectorToObject(
            lastLoggedHeadPosition
          ),

        toHeadWorldPosition:
          vectorToObject(
            current
          ),

        ...getWorldState()
      }
    );

    lastLoggedHeadPosition
      .copy(
        current
      );

    lastHeadLogTime =
      now;
  }
}

// ============================================================
// DRUM RAYCAST
// ============================================================

function handleDrumTrigger(
  source
) {

  if (
    simulationState !==
    STATE.ACTIVE
  ) {

    return;
  }

  if (
    !drumModel ||
    !drumModel.visible
  ) {

    return;
  }

  const controller =
    getControllerForHand(
      source.handedness
    );

  setControllerRay(
    controller
  );

  const hits =
    raycaster.intersectObject(
      drumModel,
      true
    );

  if (
    hits.length ===
    0
  ) {

    logEvent(
      "trigger_action",
      {

        controller:
          source.handedness,

        result:
          "no_drum_hit",

        ...getWorldState()
      }
    );

    return;
  }

  const hit =
    hits[0];

  const point =
    hit.point;

  const topThreshold =
    drumTopY -
    0.15;

  let region;

  let soundName;

  let sound;

  // ========================================================
  // BODY
  // ========================================================

  if (
    point.y <
    topThreshold
  ) {

    region =
      "body";

    soundName =
      "Rim.m4a";

    sound =
      rimSound;

  } else {

    const dx =
      point.x -
      drumCenter.x;

    const dz =
      point.z -
      drumCenter.z;

    const distanceFromCenter =
      Math.sqrt(
        dx * dx +
        dz * dz
      );

    const normalizedDistance =
      distanceFromCenter /
      drumRadius;

    // ======================================================
    // CENTER
    // ======================================================

    if (
      normalizedDistance <
      0.33
    ) {

      region =
        "center";

      soundName =
        "Center.m4a";

      sound =
        centerSound;

    }

    // ======================================================
    // MIDDLE
    // ======================================================

    else if (
      normalizedDistance <
      0.72
    ) {

      region =
        "middle";

      soundName =
        "Middle.m4a";

      sound =
        middleSound;

    }

    // ======================================================
    // RIM
    // ======================================================

    else {

      region =
        "rim";

      soundName =
        "Rim.m4a";

      sound =
        rimSound;
    }
  }

  playSound(
    sound
  );

  logEvent(
    "drum_hit",
    {

      controller:
        source.handedness,

      region,

      soundPlayed:
        soundName,

      hitWorldCoordinates:
        vectorToObject(
          point
        ),

      drumCenterWorldCoordinates:
        vectorToObject(
          drumCenter
        ),

      ...getWorldState()
    }
  );
}

// ============================================================
// BUTTON LOGGING
// ============================================================

const previousButtonStates =
  new Map();

function getButtonLabel(
  handedness,
  index
) {

  if (
    index === 0
  ) {

    return "trigger";
  }

  if (
    index === 1
  ) {

    return "squeeze/grip";
  }

  if (
    index === 2
  ) {

    return "touchpad";
  }

  if (
    index === 3
  ) {

    return "thumbstick_click";
  }

  if (
    index === 4
  ) {

    return handedness ===
      "right"
      ? "A"
      : "X";
  }

  if (
    index === 5
  ) {

    return handedness ===
      "right"
      ? "B"
      : "Y";
  }

  return `button_${index}`;
}

function processControllerButtons() {

  const session =
    renderer.xr
      .getSession();

  if (
    !session
  ) {

    return;
  }

  for (
    const source
    of session.inputSources
  ) {

    if (
      !source.gamepad
    ) {

      continue;
    }

    const hand =
      source.handedness ||
      "none";

    const buttons =
      source.gamepad.buttons;

    if (
      !previousButtonStates
        .has(hand)
    ) {

      previousButtonStates.set(
        hand,
        buttons.map(
          (button) =>
            button.pressed
        )
      );

      continue;
    }

    const previous =
      previousButtonStates.get(
        hand
      );

    for (
      let i = 0;
      i < buttons.length;
      i++
    ) {

      const pressed =
        buttons[i].pressed;

      const wasPressed =
        previous[i] ??
        false;

      if (
        pressed !==
        wasPressed
      ) {

        const label =
          getButtonLabel(
            hand,
            i
          );

        // ===================================================
        // LOG ALL BUTTON PRESSES / RELEASES
        // ===================================================

        if (
          simulationLogging
        ) {

          logEvent(
            pressed
              ? "button_press"
              : "button_release",
            {

              controller:
                hand,

              buttonIndex:
                i,

              button:
                label,

              value:
                roundNumber(
                  buttons[i]
                    .value ??
                  0
                ),

              ...getWorldState()
            }
          );
        }

        if (
          pressed
        ) {

          // ================================================
          // RIGHT B BUTTON = END SIMULATION
          // ================================================

          if (
            hand ===
              "right" &&
            i ===
              END_BUTTON_INDEX &&
            simulationLogging
          ) {

            openEndConfirmation(
              hand
            );
          }

          // ================================================
          // TRIGGER = UI BUTTON OR DRUM HIT
          // ================================================

          if (
            i === 0
          ) {

            const pressedUI =
              tryPressUIButton(
                source
              );

            if (
              !pressedUI &&
              simulationLogging
            ) {

              handleDrumTrigger(
                source
              );
            }
          }
        }
      }

      previous[i] =
        pressed;
    }
  }
}

// ============================================================
// XR SESSION START
// ============================================================

renderer.xr.addEventListener(
  "sessionstart",
  () => {

    controlsEnabled =
      false;

    simulationState =
      STATE.START;

    simulationLogging =
      false;

    simulationLog.length =
      0;

    previousButtonStates
      .clear();

    hasHeadSample =
      false;

    intro1Ready =
      false;

    intro2Ready =
      false;

    setDrumVisible(
      false
    );

    showStartPanel();

    console.log(
      "VR session started. Waiting for START SIMULATION."
    );
  }
);

// ============================================================
// XR SESSION END
// ============================================================

renderer.xr.addEventListener(
  "sessionend",
  async () => {

    clearUIPanel();

    controlsEnabled = false;

    if (
      simulationLogging &&
      simulationState !== STATE.ENDED
    ) {

      logEvent(
        "simulation_end",
        {
          reason: "xr_session_closed",
          ...getWorldState()
        }
      );

      // Send log to laptop instead of downloading on Quest
      await sendSimulationLogToLaptop();

      simulationLogging = false;
    }

    simulationState =
      STATE.WAITING_FOR_VR;

    setDrumVisible(true);
  }
);

// ============================================================
// RENDER LOOP
// ============================================================

renderer.setAnimationLoop(
  () => {

    const delta =
      Math.min(
        clock.getDelta(),
        0.05
      );

    controls.update();

    processControllerButtons();

    movePlayer(
      delta
    );

    logTrackedHeadMovement();

    renderer.render(
      scene,
      camera
    );
  }
);

// ============================================================
// RESIZE
// ============================================================

window.addEventListener(
  "resize",
  () => {

    camera.aspect =
      window.innerWidth /
      window.innerHeight;

    camera
      .updateProjectionMatrix();

    renderer.setSize(
      window.innerWidth,
      window.innerHeight
    );
  }
);