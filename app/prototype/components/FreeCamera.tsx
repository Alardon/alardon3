"use client";

/**
 * FreeCamera.tsx
 * WASD movement + mouse-look.
 *
 * Mouse control modes:
 *   1. Click anywhere on canvas  → requestPointerLock → mouselook until Esc
 *   2. Hold RMB anywhere         → mouselook while held (fallback / no pointer lock needed)
 *
 * Scroll wheel adjusts movement speed.
 * Shift = sprint (×4).  Ctrl = slow (÷4).  Space/C/Q/E = altitude.
 */

import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { worldHeight } from "./WorldNoise";

const BASE_SPEED  = 20;    // m/s
const SPRINT_MULT = 4.0;
const SLOW_MULT   = 0.25;
const SENSITIVITY = 0.0020; // rad / px
const SMOOTHING   = 10;     // lerp factor per second
const MIN_HEIGHT  = 2.5;    // metres above terrain

export default function FreeCamera() {
  const { camera, gl } = useThree();

  const keys       = useRef<Record<string, boolean>>({});
  const deltaX     = useRef(0);
  const deltaY     = useRef(0);
  const locked     = useRef(false);
  const rmbHeld    = useRef(false);
  const speedMult  = useRef(1.0);
  const velocity   = useRef(new THREE.Vector3());
  const euler      = useRef(new THREE.Euler(0, 0, 0, "YXZ"));

  useEffect(() => {
    const canvas = gl.domElement;

    // ── Init euler from camera's current orientation ──────────────────────
    euler.current.setFromQuaternion(camera.quaternion, "YXZ");

    // ── Pointer Lock helpers ───────────────────────────────────────────────
    const requestLock = () => {
      if (!document.pointerLockElement) {
        canvas.requestPointerLock();
      }
    };

    const onLockChange = () => {
      locked.current = document.pointerLockElement === canvas;
    };

    const onLockError = () => {
      locked.current = false;
    };

    // ── Left-click to lock ─────────────────────────────────────────────────
    const onCanvasClick = () => requestLock();

    // ── RMB hold ──────────────────────────────────────────────────────────
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        rmbHeld.current = true;
        requestLock();
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) rmbHeld.current = false;
    };

    // ── Mouse move — must listen on document for pointer lock ──────────────
    const onMouseMove = (e: MouseEvent) => {
      if (locked.current || rmbHeld.current) {
        deltaX.current += e.movementX;
        deltaY.current += e.movementY;
      }
    };

    // ── Keys ──────────────────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      // Esc releases pointer lock (browser does this automatically, but track it)
      if (e.code === "Escape") locked.current = false;
    };
    const onKeyUp = (e: KeyboardEvent) => { keys.current[e.code] = false; };

    // ── Scroll speed ──────────────────────────────────────────────────────
    const onWheel = (e: WheelEvent) => {
      speedMult.current = Math.max(0.1, Math.min(10,
        speedMult.current * (e.deltaY > 0 ? 0.88 : 1.14),
      ));
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    // register
    canvas.addEventListener("click",       onCanvasClick);
    canvas.addEventListener("mousedown",   onMouseDown);
    window.addEventListener("mouseup",     onMouseUp);
    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown",     onKeyDown);
    window.addEventListener("keyup",       onKeyUp);
    canvas.addEventListener("wheel",       onWheel, { passive: true });
    canvas.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("pointerlockerror",  onLockError);

    return () => {
      canvas.removeEventListener("click",       onCanvasClick);
      canvas.removeEventListener("mousedown",   onMouseDown);
      window.removeEventListener("mouseup",     onMouseUp);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown",     onKeyDown);
      window.removeEventListener("keyup",       onKeyUp);
      canvas.removeEventListener("wheel",       onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("pointerlockerror",  onLockError);
    };
  }, [camera, gl]);

  // Reusable vectors (allocated once)
  const tmp      = useRef(new THREE.Vector3());
  const fwd      = useRef(new THREE.Vector3());
  const rgt      = useRef(new THREE.Vector3());
  const up       = useRef(new THREE.Vector3(0, 1, 0));
  const targetV  = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    const k = keys.current;

    // ── Mouse look ─────────────────────────────────────────────────────────
    if (deltaX.current !== 0 || deltaY.current !== 0) {
      euler.current.y -= deltaX.current * SENSITIVITY;
      euler.current.x  = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, euler.current.x - deltaY.current * SENSITIVITY),
      );
      camera.quaternion.setFromEuler(euler.current);
      deltaX.current = 0;
      deltaY.current = 0;
    }

    // ── Speed ──────────────────────────────────────────────────────────────
    const sprint = k["ShiftLeft"] || k["ShiftRight"];
    const slow   = k["ControlLeft"] || k["ControlRight"];
    const speed  = BASE_SPEED * speedMult.current
      * (sprint ? SPRINT_MULT : 1)
      * (slow   ? SLOW_MULT   : 1);

    // ── Movement axes ──────────────────────────────────────────────────────
    camera.getWorldDirection(fwd.current);
    fwd.current.y = 0;
    fwd.current.normalize();
    rgt.current.crossVectors(fwd.current, up.current).negate().normalize();

    targetV.current.set(0, 0, 0);
    if (k["KeyW"] || k["ArrowUp"])    targetV.current.addScaledVector(fwd.current,  speed);
    if (k["KeyS"] || k["ArrowDown"])  targetV.current.addScaledVector(fwd.current, -speed);
    if (k["KeyA"] || k["ArrowLeft"])  targetV.current.addScaledVector(rgt.current,  speed);
    if (k["KeyD"] || k["ArrowRight"]) targetV.current.addScaledVector(rgt.current, -speed);
    if (k["Space"])                   targetV.current.y += speed;
    if (k["KeyC"] || k["KeyQ"])       targetV.current.y -= speed;
    if (k["KeyE"])                    targetV.current.y += speed;

    // ── Smooth velocity ────────────────────────────────────────────────────
    velocity.current.lerp(targetV.current, Math.min(1, SMOOTHING * dt));

    // ── Apply ──────────────────────────────────────────────────────────────
    tmp.current.copy(velocity.current).multiplyScalar(dt);
    camera.position.add(tmp.current);

    // ── Terrain floor clamp ────────────────────────────────────────────────
    const ground = worldHeight(camera.position.x, camera.position.z);
    if (camera.position.y < ground + MIN_HEIGHT) {
      camera.position.y = ground + MIN_HEIGHT;
      if (velocity.current.y < 0) velocity.current.y = 0;
    }
  });

  return null;
}
