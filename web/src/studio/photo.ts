/** Photo intake: file, drop or camera. EXIF orientation is applied, large photos are downscaled in memory only. */
export interface LoadedPhoto { canvas: HTMLCanvasElement; width: number; height: number; name: string }

const MAX_SIDE = 1600;
const MAX_BYTES = 25 * 1024 * 1024;
export const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];

export class PhotoError extends Error {
  constructor(readonly code: 'type' | 'size' | 'decode') { super(code); }
}

export async function loadPhotoFile(file: File): Promise<LoadedPhoto> {
  if (!ACCEPT.includes(file.type)) throw new PhotoError('type');
  if (file.size > MAX_BYTES) throw new PhotoError('size');
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new PhotoError('decode'); }
  return fromBitmap(bmp, file.name);
}

function fromBitmap(bmp: ImageBitmap, name: string): LoadedPhoto {
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return { canvas, width: w, height: h, name };
}

export async function loadPhotoUrl(url: string, name: string): Promise<LoadedPhoto> {
  const blob = await fetch(url).then(r => r.blob());
  return loadPhotoFile(new File([blob], name, { type: blob.type || 'image/jpeg' }));
}

export interface CameraSession { video: HTMLVideoElement; snap: () => LoadedPhoto; stop: () => void }

export async function openCamera(): Promise<CameraSession> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-camera');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
  const video = document.createElement('video');
  video.playsInline = true; video.muted = true; video.srcObject = stream;
  await video.play();
  return {
    video,
    snap() {
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(video, 0, 0);
      const k = Math.min(1, MAX_SIDE / Math.max(c.width, c.height));
      if (k < 1) {
        const d = document.createElement('canvas');
        d.width = Math.round(c.width * k); d.height = Math.round(c.height * k);
        d.getContext('2d', { willReadFrequently: true })!.drawImage(c, 0, 0, d.width, d.height);
        return { canvas: d, width: d.width, height: d.height, name: 'camera.jpg' };
      }
      return { canvas: c, width: c.width, height: c.height, name: 'camera.jpg' };
    },
    stop() { stream.getTracks().forEach(t => t.stop()); },
  };
}
