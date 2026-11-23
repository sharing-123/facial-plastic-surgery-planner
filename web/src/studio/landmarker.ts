import type { FaceLandmarker as FL } from '@mediapipe/tasks-vision';
import type { LandmarkLike } from '../face/geometry';

let landmarker: Promise<FL> | null = null;

/** MediaPipe Face Landmarker (478 points), run in the browser from files served by this site. The photo never leaves the device. */
export function getLandmarker(): Promise<FL> {
  if (!landmarker) {
    landmarker = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      const make = (delegate: 'GPU' | 'CPU') => FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate },
        runningMode: 'IMAGE', numFaces: 1, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
        minFaceDetectionConfidence: 0.4, minFacePresenceConfidence: 0.4,
      });
      // the wasm runtime prints INFO lines through console.error; keep real errors, demote the informational ones
      const origError = console.error;
      console.error = (...a: unknown[]) => { if (typeof a[0] === 'string' && a[0].startsWith('INFO:')) console.info(...a); else origError(...a); };
      try { return await make('GPU'); } catch { return await make('CPU'); }
    })();
    landmarker.catch(() => { landmarker = null; });
  }
  return landmarker;
}

export interface Detection { landmarks: LandmarkLike[]; faces: number }

export async function detectFace(src: HTMLCanvasElement | HTMLImageElement | ImageBitmap): Promise<Detection> {
  const lm = await getLandmarker();
  const res = lm.detect(src as HTMLImageElement);
  const face = res.faceLandmarks?.[0];
  if (!face || face.length < 468) return { landmarks: [], faces: 0 };
  return { landmarks: face.map(p => ({ x: p.x, y: p.y, z: p.z })), faces: res.faceLandmarks.length };
}

let videoLandmarker: Promise<FL> | null = null;

/** A second landmarker in VIDEO mode (it tracks between frames); one instance per page, created on first use. */
export function getVideoLandmarker(): Promise<FL> {
  if (!videoLandmarker) {
    videoLandmarker = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      const make = (delegate: 'GPU' | 'CPU') => FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate },
        runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
        minFaceDetectionConfidence: 0.4, minFacePresenceConfidence: 0.4, minTrackingConfidence: 0.4,
      });
      try { return await make('GPU'); } catch { return await make('CPU'); }
    })();
    videoLandmarker.catch(() => { videoLandmarker = null; });
  }
  return videoLandmarker;
}

let tsOffset = 0, tsLast = 0;
/** Starts a new clip: the timestamps of the shared video landmarker must keep increasing, so each clip continues after the last. */
export function startVideoSession(): void { tsOffset = tsLast + 1000; }

/** Landmarks in pixels for one video frame; tsMs is the time inside the current clip. */
export async function detectVideoFrame(src: HTMLCanvasElement | HTMLVideoElement, tsMs: number): Promise<Array<[number, number]> | null> {
  const lm = await getVideoLandmarker();
  const w = src instanceof HTMLVideoElement ? src.videoWidth : src.width, h = src instanceof HTMLVideoElement ? src.videoHeight : src.height;
  tsLast = tsMs + tsOffset;
  const res = lm.detectForVideo(src as HTMLCanvasElement, tsLast);
  const face = res.faceLandmarks?.[0];
  if (!face || face.length < 468) return null;
  return face.map(p => [p.x * w, p.y * h] as [number, number]);
}
