export interface ImageEdits {
  rotation: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  filter: string;
}

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export const PHOTO_FILTERS = [
  { id: "original", label: "Original", css: "none" },
  { id: "sunlit", label: "Sunlit", css: "saturate(1.18) contrast(1.06) brightness(1.04)" },
  { id: "soft", label: "Soft", css: "brightness(1.06) contrast(0.92) saturate(0.95)" },
  { id: "mono", label: "Mono", css: "grayscale(1) contrast(1.08)" },
] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image could not be opened."));
    image.src = url;
  });
}

export function clampEdits<T extends ImageEdits>(
  edits: T,
  width: number,
  height: number,
  viewportSize: number,
): T {
  const size = Math.max(1, viewportSize);
  const zoom = clamp(edits.zoom, 1, 2);
  const scale = (size / Math.min(width, height)) * zoom;
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const swapped = Math.abs(edits.rotation % 180) === 90;
  const displayedWidth = swapped ? scaledHeight : scaledWidth;
  const displayedHeight = swapped ? scaledWidth : scaledHeight;
  const maxX = Math.max(0, (displayedWidth - size) / 2);
  const maxY = Math.max(0, (displayedHeight - size) / 2);

  return {
    ...edits,
    zoom,
    offsetX: clamp(edits.offsetX, -maxX, maxX),
    offsetY: clamp(edits.offsetY, -maxY, maxY),
  };
}

async function encode(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function renderEditedImage(
  file: File,
  edits: ImageEdits,
  viewportSize: number,
): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const safeEdits = clampEdits(edits, image.naturalWidth, image.naturalHeight, viewportSize);
    const output = 1080;
    const canvas = document.createElement("canvas");
    canvas.width = output;
    canvas.height = output;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image editing is not supported in this browser.");

    const ratio = output / Math.max(1, viewportSize);
    const scale = (output / Math.min(image.naturalWidth, image.naturalHeight)) * safeEdits.zoom;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.filter = safeEdits.filter;
    context.translate(
      output / 2 + safeEdits.offsetX * ratio,
      output / 2 + safeEdits.offsetY * ratio,
    );
    context.rotate((safeEdits.rotation * Math.PI) / 180);
    context.scale(scale, scale);
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

    let blob: Blob | null = null;
    for (const quality of [0.9, 0.78, 0.65]) {
      blob = await encode(canvas, quality);
      if (!blob || blob.size <= MAX_PHOTO_BYTES) break;
    }
    if (!blob) throw new Error("Unable to save that image.");

    const base = file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "photo";
    return new File([blob], `${base}-edited.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
