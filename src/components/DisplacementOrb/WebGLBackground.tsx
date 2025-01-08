import React, { Suspense, useEffect, useRef, useState } from 'react';

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
  index: number;
  totalRings: number;
}

interface RingData extends RingProps {
  key?: number;
}

const generateRings = (
  frequency: number,
  startRadius: number = 1,
  count: number = 12,
  radiusStep: number = 0.5,
  phaseStep: number = 0.2,
  startAmplitude: number = 1,
  amplitudeDecay: number = 0.05
): RingData[] => {
  return Array.from({ length: count }, (_, index) => ({
    radius: startRadius + index * radiusStep,
    frequency,
    phase: index * phaseStep,
    amplitude: Math.max(0.1, startAmplitude - index * amplitudeDecay),
    index,
    totalRings: count
  }));
};

function Ring({ radius, frequency, phase, amplitude, index, totalRings }: RingProps) {
  const ringRef = useRef<THREE.Mesh>(null);
  const startTime = useRef(0);
  const [isAnimating, setIsAnimating] = useState(true);

  // Calculate opacity based on ring position
  const calculateOpacity = () => {
    const fadeStartPoint = Math.floor(totalRings * 0.8); // Start fading at 80% of total rings
    if (index < fadeStartPoint) {
      return 0.4; // Base opacity for first 80% of rings
    } else {
      const fadeProgress = (index - fadeStartPoint) / (totalRings - fadeStartPoint - 1);
      return 0.4 * (1 - fadeProgress * 0.8); // Gradually reduce to 20% opacity for last rings
    }
  };

  useEffect(() => {
    startTime.current = performance.now();
    const timeout = setTimeout(() => {
      setIsAnimating(false);
    }, 2000); // Animation duration

    return () => clearTimeout(timeout);
  }, []);

  useFrame(({ clock }) => {
    if (!ringRef.current) return;

    const time = clock.getElapsedTime();
    const animationProgress = Math.min((performance.now() - startTime.current) / 2000, 1);

    // Smooth easing function
    const easeOutExpo = isAnimating ? 1 - Math.pow(2, -10 * animationProgress) : 1;

    // Rotation animation
    ringRef.current.rotation.x = Math.sin(time * frequency + phase) * amplitude * 0.5;
    ringRef.current.rotation.y = Math.sin(time * frequency * 1.7 + phase) * amplitude * 0.4;
    ringRef.current.rotation.z = Math.sin(time * frequency * 1.5 + phase) * amplitude * 0.3;

    // Combine scale-in with breathing effect
    const breathingScale = 1 + Math.sin(time * frequency * 0.7) * 0.05;
    const currentScale = easeOutExpo * breathingScale;
    ringRef.current.scale.set(currentScale, currentScale, currentScale);
  });

  return (
    <mesh ref={ringRef}>
      <torusGeometry args={[radius, 0.1, 16, 100]} />
      <meshStandardMaterial color="#ffffff" transparent opacity={calculateOpacity()} metalness={0.9} roughness={0.1} />
    </mesh>
  );
}

export function WebGLBackground({ hovered }: WebGLBackgroundProps) {
  const frequency = 1.2;
  const noOfRings = new Date().getFullYear() - 1993;
  const rings = generateRings(
    frequency, // base frequency
    1, // start radius
    noOfRings, // number of rings
    0.5, // radius step
    0.2, // phase step
    1, // start amplitude
    0.05 // amplitude decay
  );

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
          <group position={[6, 0, -5]} rotation={[-Math.PI / 6, -Math.PI / 4, -Math.PI / 2]}>
            {rings.map((ring, index) => (
              <Ring
                key={index}
                radius={ring.radius}
                frequency={ring.frequency}
                phase={ring.phase}
                amplitude={ring.amplitude}
                index={index}
                totalRings={noOfRings}
              />
            ))}
          </group>
        </scene>
      </UseCanvas>
    </Suspense>
  );
}
