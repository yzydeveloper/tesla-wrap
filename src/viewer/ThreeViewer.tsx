import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three-stdlib';
import { useEditorStore } from '../editor/state/useEditorStore';
import { carModels } from '../data/carModels';
import { getObjUrl } from '../utils/assets';
import type { Stage as StageType } from 'konva/lib/Stage';

interface ThreeViewerProps {
  isOpen: boolean;
  onClose: () => void;
  stageRef: React.RefObject<StageType | null>;
}

export const ThreeViewer = ({ isOpen, onClose, stageRef }: ThreeViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshRef = useRef<THREE.Group | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { currentModelId, layers, baseColor } = useEditorStore();
  const currentModel = carModels.find((m) => m.id === currentModelId) || carModels[0];

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    // Initialize scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x4a4b4c); // Tesla black (#4A4B4C)
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 1, 3);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Load OBJ model
    const loader = new OBJLoader();
    const objUrl = getObjUrl(currentModel.folderName);
    loader.load(
      objUrl,
      (object) => {
        // Find the body mesh (material with lowest numeric suffix or first mesh)
        let bodyMesh: THREE.Mesh | null = null;
        let lowestSuffix = Infinity;

        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const material = child.material;
            if (material instanceof THREE.MeshStandardMaterial) {
              const name = material.name || '';
              const match = name.match(/(\d+)$/);
              const suffix = match ? parseInt(match[1]) : 0;
              if (suffix < lowestSuffix) {
                lowestSuffix = suffix;
                bodyMesh = child;
              }
            } else if (!bodyMesh) {
              bodyMesh = child;
            }
          }
        });

        // If no body mesh found, use first mesh
        if (!bodyMesh) {
          object.traverse((child) => {
            if (child instanceof THREE.Mesh && !bodyMesh) {
              bodyMesh = child;
            }
          });
        }

        // Apply wrap texture to body mesh
        if (bodyMesh && stageRef.current) {
          const stage = stageRef.current;
          const canvas = stage.toCanvas({ pixelRatio: 1 });

          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.flipY = true;
          texture.needsUpdate = true;
          textureRef.current = texture;

          const material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.7,
            metalness: 0.3,
          });

          (bodyMesh as THREE.Mesh).material = material;
        }

        // Center and scale the model
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim;

        object.scale.multiplyScalar(scale);
        object.position.sub(center.multiplyScalar(scale));

        scene.add(object);
        meshRef.current = object;
        setLoading(false);
      },
      undefined,
      (err) => {
        console.error('Failed to load OBJ:', err);
        setError('Failed to load 3D model');
        setLoading(false);
      }
    );

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      // Update texture if canvas changed
      if (textureRef.current && stageRef.current) {
        const stage = stageRef.current;
        const canvas = stage.toCanvas({ pixelRatio: 1 });
        textureRef.current.image = canvas;
        textureRef.current.needsUpdate = true;
      }

      // Rotate model slowly
      if (meshRef.current) {
        meshRef.current.rotation.y += 0.005;
      }

      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      if (textureRef.current) {
        textureRef.current.dispose();
      }
    };
  }, [isOpen, currentModel.folderName, stageRef]);

  // Update texture when layers change
  useEffect(() => {
    if (textureRef.current && stageRef.current && isOpen) {
      const stage = stageRef.current;
      const canvas = stage.toCanvas({ pixelRatio: 1 });
      textureRef.current.image = canvas;
      textureRef.current.needsUpdate = true;
    }
  }, [layers, baseColor, isOpen, stageRef]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center">
      <div className="bg-tesla-black rounded-lg shadow-2xl w-[90vw] h-[90vh] flex flex-col">
        <div className="p-4 border-b border-tesla-dark flex items-center justify-between">
          <h2 className="text-xl font-semibold text-tesla-light">3D Preview</h2>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-tesla-dark hover:bg-tesla-gray rounded text-tesla-light"
          >
            Close
          </button>
        </div>
        <div ref={containerRef} className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-tesla-gray">Loading 3D model...</div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-tesla-red">{error}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

