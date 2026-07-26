"use client";

/**
 * FreeCamera.tsx
 * WASD/QE movement + mouse-look (hold RMB or click-to-lock pointer).
 * Scroll wheel adjusts speed. Shift = sprint. Space/C = up/down.
 * Terrain-follows: camera stays at least MIN_HEIGHT above ground.
 */

import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { worldHeight } from "./WorldNoise";

const BASE_SPEED   = 18;   // m/s
const SPRINT_MULT  = 4.0;
const SLOW_MULT    = 0.25;
const SENSITIVITY  = 0.0022;  // rad per pixel
const SMOOTHING    = 8.0;     // lerp factor per second
const MIN_HEIGHT   = 3.0;     // metres above terrain

export default function FreeCamera() {
  const { camera, gl } = useThree();

  // Key state
  const keys = useRef<Record<string, boolean>>({});
  // Mouse delta accumulated per frame
  const mouseDelta = useRef({ x: 0, y: 0 });
  // Pointer lock state
  const locked     = useRef(false);
  // RMB held (no pointer-lock needed for pan)
  const rmbHeld    = useRef(false);
  // Speed multiplier (scroll wheel)
  const speedMult  = useRef(1.0);
  // Smooth velocity
  const velocity   = useRef(new THREE.Vector3());
  // Euler (yaw, pitch)
  const euler      = useRef(new THREE.Euler(0, 0, 0, "YXZ"));

  useEffect(() => {
    const canvas = gl.domElement;

    const onKey = (e: KeyboardEvent) => {
      keys.current[e.code] = e.type === "keydown";
    };

    const onMouseMove = (e: MouseEvent) => {
      if (locked.current) {
        mouseDelta.current.x += e.movementX;
        mouseDelta.current.y += e.movementY;
      } else if (rmbHeld.current) {
        mouseDelta.current.x += e.movementX;
        mouseDelta.current.y += e.movementY;
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        rmbHeld.current = true;
        // Try pointer lock for smoother control
        canvas.requestPointerLock?.().catch(() => {});
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        rmbHeld.current = false;
        if (!locked.current) document.exitPointerLock?.();
      }
    };

    const onLockChange = () => {
      locked.current = document.pointerLockElement === canvas;
    };

    const onWheel = (e: WheelEvent) => {
      speedMult.current = Math.max(0.2, Math.min(8.0,
        speedMult.current * (e.deltaY > 0 ? 0.9 : 1.11)
      ));
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup",   onKey);
    window.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown",   onMouseDown);
    window.addEventListener("mouseup",     onMouseUp);
    document.addEventListener("pointerlockchange", onLockChange);
    canvas.addEventListener("wheel",       onWheel, { passive: true });
    canvas.addEventListener("contextmenu", onContextMenu);

    // Set initial camera orientation
    euler.current.setFromQuaternion(camera.quaternion, "YXZ");

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup",   onKey);
      window.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown",   onMouseDown);
      window.removeEventListener("mouseup",     onMouseUp);
      document.removeEventListener("pointerlockchange", onLockChange);
      canvas.removeEventListener("wheel",       onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }, [camera, gl]);

  const tmpVec = useRef(new THREE.Vector3());
  const fwdVec = useRef(new THREE.Vector3());
  const rgtVec = useRef(new THREE.Vector3());
  const upVec  = useRef(new THREE.Vector3(0, 1, 0));
  const targetVel = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    const k = keys.current;
    const speed = BASE_SPEED * speedMult.current
      * (k["ShiftLeft"] || k["ShiftRight"] ? SPRINT_MULT : 1)
      * (k["ControlLeft"] ? SLOW_MULT : 1);

    // ── Mouse look ─────────────────────────────────────────────────────────
    if (mouseDelta.current.x !== 0 || mouseDelta.current.y !== 0) {
      euler.current.y -= mouseDelta.current.x * SENSITIVITY;
      euler.current.x -= mouseDelta.current.y * SENSITIVITY;
      euler.current.x  = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, euler.current.x));
      camera.quaternion.setFromEuler(euler.current);
      mouseDelta.current.x = 0;
      mouseDelta.current.y = 0;
    }

    // ── Compute movement axes ───────────────────────────────────────────────
    // Forward = camera direction projected to XZ
    camera.getWorldDirection(fwdVec.current);
    fwdVec.current.y = 0;
    fwdVec.current.normalize();
    rgtVec.current.crossVectors(fwdVec.current, upVec.current).negate().normalize();

    targetVel.current.set(0, 0, 0);

    if (k["KeyW"] || k["ArrowUp"])    targetVel.current.addScaledVector(fwdVec.current,  speed);
    if (k["KeyS"] || k["ArrowDown"])  targetVel.current.addScaledVector(fwdVec.current, -speed);
    if (k["KeyA"] || k["ArrowLeft"])  targetVel.current.addScaledVector(rgtVec.current,  speed);
    if (k["KeyD"] || k["ArrowRight"]) targetVel.current.addScaledVector(rgtVec.current, -speed);
    if (k["Space"])                   targetVel.current.y += speed;
    if (k["KeyC"] || k["KeyQ"])       targetVel.current.y -= speed;
    // E = up (alternative)
    if (k["KeyE"])                    targetVel.current.y += speed;

    // Smooth velocity
    const alpha = Math.min(1, SMOOTHING * dt);
    velocity.current.lerp(targetVel.current, alpha);

    // Apply movement
    tmpVec.current.copy(velocity.current).multiplyScalar(dt);
    camera.position.add(tmpVec.current);

    // ── Terrain floor clamp ─────────────────────────────────────────────────
    const terrainY = worldHeight(camera.position.x, camera.position.z);
    const minY     = terrainY + MIN_HEIGHT;
    if (camera.position.y < minY) camera.position.y = minY;
  });

  return null;
}
