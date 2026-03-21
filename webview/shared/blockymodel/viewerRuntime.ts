import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type BlockymodelViewAngles = {
  roll: number;
  pitch: number;
  yaw: number;
};

export interface BlockymodelViewerRuntime {
  setOrbit(enabled: boolean): void;
  setGridVisible(visible: boolean): void;
  setScale(scale: number): void;
  setViewAngles(angles: Partial<BlockymodelViewAngles>): void;
  setModelObject(object: THREE.Object3D | null): void;
  dispose(): void;
}

interface BlockymodelViewerRuntimeOptions {
  orbit?: boolean;
  showGrid?: boolean;
  scale?: number;
  onViewAnglesChange?: (angles: BlockymodelViewAngles) => void;
}

function getSize(host: HTMLElement): { width: number; height: number } {
  const rect = host.getBoundingClientRect();
  return {
    width: Math.max(1, Math.floor(rect.width)),
    height: Math.max(1, Math.floor(rect.height)),
  };
}

function createCamera(width: number, height: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 5000);
  camera.position.set(35, 25, 35);
  return camera;
}

function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  scale: number,
): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    controls.target.set(0, 0, 0);
    controls.update();
    return;
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 1);
  const fovRadians = THREE.MathUtils.degToRad(camera.fov);
  const distance = ((maxDimension / (2 * Math.tan(fovRadians / 2))) * 1.5) / Math.max(scale, 0.01);

  camera.position.set(center.x + distance, center.y + distance * 0.55, center.z + distance);
  camera.near = Math.max(0.05, distance / 200);
  camera.far = distance * 200;
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
}

export function createBlockymodelViewerRuntime(
  host: HTMLElement,
  options: BlockymodelViewerRuntimeOptions = {},
): BlockymodelViewerRuntime {
  const { width, height } = getSize(host);
  const scene = new THREE.Scene();
  scene.background = null;

  const hemiLight = new THREE.HemisphereLight(0xfff8ee, 0x6f7a84, 0.85);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff3e0, 0.95);
  keyLight.position.set(40, 60, 30);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xcfe7ff, 0.45);
  fillLight.position.set(-25, 35, -40);
  scene.add(fillLight);

  const grid = new THREE.GridHelper(256, 64, 0x8f8f8f, 0xb7b7b7);
  grid.position.y = -0.01;
  grid.visible = options.showGrid ?? true;
  scene.add(grid);

  const camera = createCamera(width, height);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = Boolean(options.orbit);
  controls.enableDamping = false;

  let currentObject: THREE.Object3D | null = null;
  let currentScale = options.scale ?? 1;
  let hasCustomViewAngles = false;
  let currentViewAngles: BlockymodelViewAngles = {
    roll: 0,
    pitch: 0,
    yaw: 0,
  };

  const toDegrees = THREE.MathUtils.radToDeg;
  const toRadians = THREE.MathUtils.degToRad;

  const getCameraDistance = () => camera.position.distanceTo(controls.target);

  const syncViewAnglesFromCamera = () => {
    const offset = camera.position.clone().sub(controls.target);
    const horizontalDistance = Math.hypot(offset.x, offset.z);

    currentViewAngles = {
      roll: currentViewAngles.roll,
      pitch: toDegrees(Math.atan2(offset.y, horizontalDistance)),
      yaw: toDegrees(Math.atan2(offset.x, offset.z)),
    };

    options.onViewAnglesChange?.(currentViewAngles);
  };

  const applyRoll = () => {
    camera.lookAt(controls.target);
    if (currentViewAngles.roll === 0) {
      return;
    }

    const viewAxis = controls.target.clone().sub(camera.position).normalize();
    camera.quaternion.multiply(
      new THREE.Quaternion().setFromAxisAngle(viewAxis, toRadians(currentViewAngles.roll)),
    );
    camera.updateMatrixWorld();
  };

  const applyViewAngles = () => {
    const radius = getCameraDistance();
    const yaw = toRadians(currentViewAngles.yaw);
    const pitch = toRadians(currentViewAngles.pitch);
    const cosPitch = Math.cos(pitch);

    camera.position.set(
      controls.target.x + radius * Math.sin(yaw) * cosPitch,
      controls.target.y + radius * Math.sin(pitch),
      controls.target.z + radius * Math.cos(yaw) * cosPitch,
    );
    controls.update();
    render();
  };

  const render = () => {
    applyRoll();
    renderer.render(scene, camera);
  };

  const handleControlsChange = () => {
    syncViewAnglesFromCamera();
    render();
  };

  controls.addEventListener("change", handleControlsChange);

  const resizeObserver = new ResizeObserver(() => {
    const next = getSize(host);
    renderer.setSize(next.width, next.height);
    camera.aspect = next.width / next.height;
    camera.updateProjectionMatrix();

    if (currentObject) {
      fitCameraToObject(camera, controls, currentObject, currentScale);
      if (hasCustomViewAngles) {
        applyViewAngles();
        return;
      }
      syncViewAnglesFromCamera();
    } else {
      render();
    }
  });
  resizeObserver.observe(host);

  render();

  return {
    setOrbit(enabled: boolean): void {
      controls.enabled = enabled;
      render();
    },
    setGridVisible(visible: boolean): void {
      grid.visible = visible;
      render();
    },
    setScale(scale: number): void {
      currentScale = scale > 0 ? scale : 1;
      if (!currentObject) {
        render();
        return;
      }

      fitCameraToObject(camera, controls, currentObject, currentScale);
      if (hasCustomViewAngles) {
        applyViewAngles();
        return;
      }

      syncViewAnglesFromCamera();
      render();
    },
    setViewAngles(angles: Partial<BlockymodelViewAngles>): void {
      currentViewAngles = {
        roll: angles.roll ?? currentViewAngles.roll,
        pitch: angles.pitch ?? currentViewAngles.pitch,
        yaw: angles.yaw ?? currentViewAngles.yaw,
      };
      hasCustomViewAngles = true;
      applyViewAngles();
    },
    setModelObject(object: THREE.Object3D | null): void {
      if (currentObject) {
        scene.remove(currentObject);
      }

      currentObject = object;
      if (object) {
        scene.add(object);
        fitCameraToObject(camera, controls, object, currentScale);
        if (hasCustomViewAngles) {
          applyViewAngles();
          return;
        }
        syncViewAnglesFromCamera();
        render();
      } else {
        controls.target.set(0, 0, 0);
        controls.update();
        hasCustomViewAngles = false;
        currentViewAngles = {
          roll: 0,
          pitch: 0,
          yaw: 0,
        };
        options.onViewAnglesChange?.(currentViewAngles);
        render();
      }
    },
    dispose(): void {
      resizeObserver.disconnect();
      controls.removeEventListener("change", handleControlsChange);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
