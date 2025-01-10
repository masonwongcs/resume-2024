import React, { Suspense, useEffect, useRef } from 'react';

import { UseCanvas } from '@14islands/r3f-scroll-rig';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { useHomeStore } from '@/store';

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

export function WebGLBackground({ hovered }: WebGLBackgroundProps) {
  const frequency = 1.2;
  const { immersiveModeOn } = useHomeStore();
  const noOfRings = new Date().getFullYear() - 1993;
  const rings = generateRings(frequency, 1, noOfRings, 0.5, 0.2, 1, 0.05);
  const groupRef = useRef<THREE.Group>(null);
  const viewport = useThree((s) => s.viewport);
  const isMobile = viewport.width * viewport.factor < 700;

  useFrame(() => {
    if (!groupRef.current) return;

    // Target positions
    const targetX = immersiveModeOn ? 0 : 6;
    const targetY = 0;
    const targetZ = immersiveModeOn ? 0 : -5;
    const targetScaleFactor = isMobile ? 1.2 : 1.5;

    // Smooth interpolation
    groupRef.current.position.x += (targetX - groupRef.current.position.x) * 0.05;
    groupRef.current.position.y += (targetY - groupRef.current.position.y) * 0.05;
    groupRef.current.position.z += (targetZ - groupRef.current.position.z) * 0.05;

    const targetScaleX = immersiveModeOn ? targetScaleFactor : 1;
    const targetScaleY = immersiveModeOn ? targetScaleFactor : 1;
    const targetScaleZ = immersiveModeOn ? targetScaleFactor : 1;

    groupRef.current.scale.x += (targetScaleX - groupRef.current.scale.x) * 0.05;
    groupRef.current.scale.y += (targetScaleY - groupRef.current.scale.y) * 0.05;
    groupRef.current.scale.z += (targetScaleZ - groupRef.current.scale.z) * 0.05;
  });

  return (
    <Suspense fallback="">
      <UseCanvas
        camera={{
          position: [0, 0, 15],
          fov: 10
        }}
      >
        <scene>
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 5, 5]} intensity={0.8} />
          <directionalLight position={[-5, -5, -5]} intensity={0.4} />
          <pointLight position={[0, 0, 5]} intensity={0.5} />

          <group ref={groupRef} position={[6, 0, -5]} rotation={[-Math.PI / 6, -Math.PI / 4, -Math.PI / 2]}>
            {rings.map((ring, index) => (
              <Ring key={index} {...ring} index={index} totalRings={noOfRings} />
            ))}
          </group>
        </scene>
      </UseCanvas>
    </Suspense>
  );
}

const Ring = ({ radius, frequency, phase, amplitude, index, totalRings }: RingProps) => {
  const ringRef = useRef<THREE.Mesh>(null);
  const startTime = useRef(performance.now());
  const audioScaleRef = useRef(1);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isInitializingRef = useRef(false);
  const { immersiveModeOn } = useHomeStore();

  const initializeAudio = async () => {
    if (isInitializingRef.current || analyzerRef.current) return;

    isInitializingRef.current = true;

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 48000
      });
      await audioContext.resume();
      audioContextRef.current = audioContext;

      // Check if mediaDevices is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('Audio input is not supported on this device/browser');
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 2.0;
        gainRef.current = gainNode;

        const analyzerNode = audioContext.createAnalyser();
        analyzerNode.fftSize = 2048;
        analyzerNode.smoothingTimeConstant = 0.8;
        analyzerNode.minDecibels = -90;
        analyzerNode.maxDecibels = -10;

        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(analyzerNode);
        oscillator.start();

        streamRef.current = null;
        sourceRef.current = oscillator; // Now TypeScript knows this is valid
        analyzerRef.current = analyzerNode;
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        streamRef.current = stream;

        const sourceNode = audioContext.createMediaStreamSource(stream);
        sourceRef.current = sourceNode;

        const gainNode = audioContext.createGain();
        gainNode.gain.value = 2.0;
        gainRef.current = gainNode;

        const analyzerNode = audioContext.createAnalyser();
        analyzerNode.fftSize = 2048;
        analyzerNode.smoothingTimeConstant = 0.8;
        analyzerNode.minDecibels = -90;
        analyzerNode.maxDecibels = -10;

        sourceNode.connect(gainNode);
        gainNode.connect(analyzerNode);
        analyzerRef.current = analyzerNode;
      } catch (err) {
        console.warn('Unable to access audio input:', err);
        // Fallback to oscillator
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 2.0;
        gainRef.current = gainNode;

        const analyzerNode = audioContext.createAnalyser();
        analyzerNode.fftSize = 2048;
        analyzerNode.smoothingTimeConstant = 0.8;
        analyzerNode.minDecibels = -90;
        analyzerNode.maxDecibels = -10;

        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(analyzerNode);
        oscillator.start();

        streamRef.current = null;
        sourceRef.current = oscillator; // Now TypeScript knows this is valid
        analyzerRef.current = analyzerNode;
      }
    } catch (error) {
      console.error('Error initializing audio:', error);
    } finally {
      isInitializingRef.current = false;
    }
  };

  const calculateOpacity = () => {
    const fadeStartPoint = Math.floor(totalRings * 0.8);
    if (index < fadeStartPoint) {
      return 0.4;
    } else {
      const fadeProgress = (index - fadeStartPoint) / (totalRings - fadeStartPoint - 1);
      return 0.4 * (1 - fadeProgress * 0.8);
    }
  };

  useFrame(({ clock }) => {
    if (!ringRef.current) return;

    const time = clock.getElapsedTime();
    const animationProgress = Math.min((performance.now() - startTime.current) / 2000, 1);
    const easeOutExpo = 1 - Math.pow(2, -10 * animationProgress);

    // Get audio data for this specific ring only if immersive mode is on
    let energy = 0;
    if (immersiveModeOn && analyzerRef.current) {
      const bufferLength = analyzerRef.current.frequencyBinCount;
      const dataArray = new Float32Array(bufferLength);
      analyzerRef.current.getFloatFrequencyData(dataArray);

      const bandIndex = Math.floor((index / totalRings) * (bufferLength / 4));
      const value = dataArray[bandIndex];

      const normalizedValue =
        (value - analyzerRef.current.minDecibels) / (analyzerRef.current.maxDecibels - analyzerRef.current.minDecibels);

      const threshold = 0.0005;
      energy = normalizedValue > threshold ? Math.max(0, Math.min(1, (normalizedValue - threshold) * 1.2)) : 0;

      const targetScale = 1 + energy * 1.2;
      const lerpSpeed = 0.1;
      audioScaleRef.current += (targetScale - audioScaleRef.current) * lerpSpeed;
    }

    // Apply animations with or without audio influence based on immersive mode
    const audioRotationInfluence = immersiveModeOn ? energy * 0.1 : 0;
    ringRef.current.rotation.x = Math.sin(time * frequency + phase) * amplitude * (0.5 + audioRotationInfluence);
    ringRef.current.rotation.y = Math.sin(time * frequency * 1.7 + phase) * amplitude * (0.4 + audioRotationInfluence);
    ringRef.current.rotation.z = Math.sin(time * frequency * 1.5 + phase) * amplitude * (0.3 + audioRotationInfluence);

    const breathingScale = 1 + Math.sin(time * frequency * 0.7) * 0.05;
    const currentScale = easeOutExpo * breathingScale * (immersiveModeOn ? audioScaleRef.current : 1);
    ringRef.current.scale.setScalar(currentScale);
  });

  // Handle audio initialization and cleanup based on immersive mode
  useEffect(() => {
    const handleAudioChange = async () => {
      if (immersiveModeOn) {
        // Initialize audio when immersive mode is turned on
        await initializeAudio();
      } else {
        // Cleanup audio when immersive mode is turned off
        if (audioContextRef.current?.state !== 'closed') {
          try {
            await audioContextRef.current?.close();
          } catch (error) {
            console.warn('AudioContext already closed');
          }
          audioContextRef.current = null;
        }

        // Stop and cleanup media stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        // Disconnect nodes if they exist
        if (sourceRef.current) {
          try {
            sourceRef.current.disconnect();
          } catch (error) {
            console.warn('Source already disconnected');
          }
          sourceRef.current = null;
        }

        if (gainRef.current) {
          try {
            gainRef.current.disconnect();
          } catch (error) {
            console.warn('Gain node already disconnected');
          }
          gainRef.current = null;
        }

        if (analyzerRef.current) {
          try {
            analyzerRef.current.disconnect();
          } catch (error) {
            console.warn('Analyzer already disconnected');
          }
          analyzerRef.current = null;
        }

        // Reset audio scale
        audioScaleRef.current = 1;
      }
    };

    handleAudioChange();

    // Cleanup on unmount or when immersive mode changes
    return () => {
      if (audioContextRef.current?.state !== 'closed') {
        try {
          audioContextRef.current?.close();
        } catch (error) {
          console.warn('AudioContext already closed');
        }
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Safely disconnect nodes
      try {
        sourceRef.current?.disconnect();
        gainRef.current?.disconnect();
        analyzerRef.current?.disconnect();
      } catch (error) {
        console.warn('Some audio nodes already disconnected');
      }
    };
  }, [immersiveModeOn]);

  return (
    <mesh ref={ringRef}>
      <torusGeometry args={[radius, 0.1, 16, 100]} />
      <meshStandardMaterial color="#ffffff" transparent opacity={calculateOpacity()} metalness={0.9} roughness={0.1} />
    </mesh>
  );
};

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
