import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface BlockymodelViewerRuntime {
  setOrbit(enabled: boolean): void;
  setGridVisible(visible: boolean): void;
  setModelObject(object: THREE.Object3D | null): void;
  dispose(): void;
}

interface BlockymodelViewerRuntimeOptions {
  orbit?: boolean;
  showGrid?: boolean;
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
  const distance = (maxDimension / (2 * Math.tan(fovRadians / 2))) * 1.5;

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

  const render = () => {
    renderer.render(scene, camera);
  };

  controls.addEventListener("change", render);

  const resizeObserver = new ResizeObserver(() => {
    const next = getSize(host);
    renderer.setSize(next.width, next.height);
    camera.aspect = next.width / next.height;
    camera.updateProjectionMatrix();

    if (currentObject) {
      fitCameraToObject(camera, controls, currentObject);
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
    setModelObject(object: THREE.Object3D | null): void {
      if (currentObject) {
        scene.remove(currentObject);
      }

      currentObject = object;
      if (object) {
        scene.add(object);
        fitCameraToObject(camera, controls, object);
      } else {
        controls.target.set(0, 0, 0);
        controls.update();
        render();
      }
    },
    dispose(): void {
      resizeObserver.disconnect();
      controls.removeEventListener("change", render);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
