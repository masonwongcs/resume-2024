import React, { Suspense, useRef } from 'react';

import { UseCanvas } from '@14islands/r3f-scroll-rig';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface WebGLBackgroundProps {
  hovered: boolean;
}

interface RingProps {
  radius: number;
  frequency: number;
  phase: number;
  amplitude: number;
}

interface RingData extends RingProps {
  key?: number;
}

function Ring({ radius, frequency, phase, amplitude }: RingProps) {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ringRef.current) return;

    const time = clock.getElapsedTime();

    // Increased frequency for faster animation
    ringRef.current.rotation.x = Math.sin(time * frequency + phase) * amplitude * 0.5;
    ringRef.current.rotation.y = Math.sin(time * frequency * 1.7 + phase) * amplitude * 0.4;
    ringRef.current.rotation.z = Math.sin(time * frequency * 1.5 + phase) * amplitude * 0.3;

    // Slightly faster breathing effect
    const scale = 1 + Math.sin(time * frequency * 0.7) * 0.05;
    ringRef.current.scale.set(scale, scale, scale);
  });

  return (
    <mesh ref={ringRef}>
      <torusGeometry args={[radius, 0.1, 16, 100]} />
      <meshStandardMaterial color="#ffffff" transparent opacity={0.4} metalness={0.9} roughness={0.1} />
    </mesh>
  );
}

export function WebGLBackground({ hovered }: WebGLBackgroundProps) {
  const frequency = 1.2;
  const rings: RingData[] = [
    { radius: 1, frequency: frequency, phase: 0, amplitude: 1 },
    { radius: 1.5, frequency: frequency, phase: 0.2, amplitude: 0.95 },
    { radius: 2, frequency: frequency, phase: 0.4, amplitude: 0.9 },
    { radius: 2.5, frequency: frequency, phase: 0.6, amplitude: 0.85 },
    { radius: 3, frequency: frequency, phase: 0.8, amplitude: 0.8 },
    { radius: 3.5, frequency: frequency, phase: 1.0, amplitude: 0.75 },
    { radius: 4, frequency: frequency, phase: 1.2, amplitude: 0.7 },
    { radius: 4.5, frequency: frequency, phase: 1.4, amplitude: 0.65 },
    { radius: 5, frequency: frequency, phase: 1.6, amplitude: 0.6 },
    { radius: 5.5, frequency: frequency, phase: 1.8, amplitude: 0.55 },
    { radius: 6, frequency: frequency, phase: 2.0, amplitude: 0.5 },
    { radius: 6.5, frequency: frequency, phase: 2.2, amplitude: 0.45 }
  ];

  return (
    <Suspense fallback="">
      <UseCanvas
        camera={{
          position: [0, 0, 15],
          fov: 10
        }}
      >
        <scene>
          {/* Lights */}
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 5, 5]} intensity={0.8} />
          <directionalLight position={[-5, -5, -5]} intensity={0.4} />
          <pointLight position={[0, 0, 5]} intensity={0.5} />

          {/* Ring group */}
          {/*rotation={[Math.PI / 6, Math.PI / 6, 0]}*/}
          <group position={[6, 0, -5]} rotation={[-Math.PI / 6, -Math.PI / 4, -Math.PI / 2]}>
            {rings.map((ring, index) => (
              <Ring
                key={index}
                radius={ring.radius}
                frequency={ring.frequency}
                phase={ring.phase}
                amplitude={ring.amplitude}
              />
            ))}
          </group>
        </scene>
      </UseCanvas>
    </Suspense>
  );
}
