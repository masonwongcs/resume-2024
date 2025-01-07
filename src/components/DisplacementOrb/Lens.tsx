import { useRef, useState } from 'react';

import { MeshTransmissionMaterial, useFBO, useGLTF } from '@react-three/drei';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { easing } from 'maath';
import * as THREE from 'three';

interface LensProps {
  hovered?: boolean;
  children: React.ReactNode;
  damping?: number;
  scale?: number | [number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material;
  [key: string]: any;
}

interface GLTFResult {
  nodes: {
    Cylinder: THREE.Mesh;
  };
  materials: Record<string, THREE.Material>;
}

export function Lens({ children, damping = 0.14, hovered = false, ...props }: LensProps) {
  const ref = useRef<THREE.Mesh>(null);
  const { nodes } = useGLTF('glb/lens-transformed2.glb') as any;
  const buffer = useFBO();
  const viewport = useThree((state) => state.viewport);
  const [scene] = useState(() => new THREE.Scene());
  const baseScale = Math.min(viewport.width, viewport.height) * 0.14;

  useFrame((state, delta) => {
    if (!ref.current) return;

    const viewport = state.viewport.getCurrentViewport(state.camera, [0, 0, 1]);

    // Update position
    easing.damp3(
      ref.current.position,
      [(state.pointer.x * viewport.width) / 2, (state.pointer.y * viewport.height) / 2, 1],
      damping,
      delta
    );

    // Update scale based on hover state
    const targetScale = hovered ? baseScale : 0;
    easing.damp(ref.current.scale, 'x', targetScale, 0.2, delta);
    easing.damp(ref.current.scale, 'y', targetScale, 0.2, delta);
    easing.damp(ref.current.scale, 'z', targetScale, 0.2, delta);

    // Render to buffer
    state.gl.setRenderTarget(buffer);
    state.gl.setClearColor('#ecedef');
    state.gl.render(scene, state.camera);
    state.gl.setRenderTarget(null);
  });

  return (
    <>
      {createPortal(children, scene)}
      <mesh scale={[viewport.width, viewport.height, 1]} dispose={null}>
        <planeGeometry />
        <meshBasicMaterial map={buffer.texture} />
      </mesh>
      <mesh ref={ref} rotation-x={Math.PI / 2} geometry={nodes.Cylinder.geometry} dispose={null} scale={0} {...props}>
        <MeshTransmissionMaterial
          buffer={buffer.texture}
          ior={1.14}
          thickness={1.4}
          anisotropy={0.14}
          chromaticAberration={0.14}
          distortion={0.14}
          distortionScale={1.4}
          temporalDistortion={0.14}
        />
      </mesh>
    </>
  );
}

useGLTF.preload('glb/lens-transformed2.glb');
