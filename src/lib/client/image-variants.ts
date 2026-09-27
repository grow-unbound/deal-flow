'use client';

import pica from 'pica';
import {
  ENTITY_VARIANT_CONFIG,
  VARIANT_SIZES,
  buildOriginalKey,
  buildVariantKey,
  type VariantName,
} from '@/lib/image-entity-config';

export type GeneratedVariant = {
  name: 'original' | VariantName;
  blob: Blob;
  contentType: string;
  key: string;
};

// Crop the source canvas to exactly the target aspect ratio (centre crop),
// optionally compositing it onto white first to flatten transparency.
function cropToAspect(
  src: HTMLCanvasElement,
  targetW: number,
  targetH: number,
  flattenOnWhite: boolean,
): HTMLCanvasElement {
  const srcW = src.width;
  const srcH = src.height;
  const targetAspect = targetW / targetH;
  const sourceAspect = srcW / srcH;

  let cropW: number, cropH: number, cropX: number, cropY: number;
  if (sourceAspect > targetAspect) {
    // Source is wider — crop the sides
    cropH = srcH;
    cropW = Math.round(srcH * targetAspect);
    cropX = Math.round((srcW - cropW) / 2);
    cropY = 0;
  } else {
    // Source is taller — crop top/bottom
    cropW = srcW;
    cropH = Math.round(srcW / targetAspect);
    cropX = 0;
    cropY = Math.round((srcH - cropH) / 2);
  }

  const canvas = document.createElement('canvas');
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext('2d')!;

  if (flattenOnWhite) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cropW, cropH);
  }
  ctx.drawImage(src, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return canvas;
}

// Load a File into a canvas at its natural dimensions.
function loadImageToCanvas(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for processing.'));
    };
    img.src = url;
  });
}

// Resize a canvas to exact target dimensions using Pica Lanczos3.
async function resizeCanvas(
  picaInstance: ReturnType<typeof pica>,
  src: HTMLCanvasElement,
  targetW: number,
  targetH: number,
  flattenOnWhite: boolean,
): Promise<Blob> {
  const cropped = cropToAspect(src, targetW, targetH, flattenOnWhite);

  const dest = document.createElement('canvas');
  dest.width = targetW;
  dest.height = targetH;

  if (flattenOnWhite) {
    const ctx = dest.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
  }

  const resized = await picaInstance.resize(cropped, dest, {
    filter: 'lanczos3',
  });

  return picaInstance.toBlob(resized, 'image/webp', 0.85);
}

export async function generateEntityVariants(
  file: File,
  entityType: string,
  entityId: string,
  tenantId?: string,
  sharedPica?: ReturnType<typeof pica>,
): Promise<GeneratedVariant[]> {
  const config = ENTITY_VARIANT_CONFIG[entityType];
  if (!config) throw new Error(`Unknown entity type: ${entityType}`);

  const baseKey = config.buildBaseKey(entityId, tenantId);
  const picaInstance = sharedPica ?? pica();
  const srcCanvas = await loadImageToCanvas(file);

  // White-flatten the source canvas once if needed, before generating all variants
  let workCanvas = srcCanvas;
  if (config.flattenOnWhite) {
    const flatCanvas = document.createElement('canvas');
    flatCanvas.width = srcCanvas.width;
    flatCanvas.height = srcCanvas.height;
    const ctx = flatCanvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, flatCanvas.width, flatCanvas.height);
    ctx.drawImage(srcCanvas, 0, 0);
    workCanvas = flatCanvas;
  }

  const results: GeneratedVariant[] = [];

  // Original — store as-is (preserve source format and resolution)
  const originalKey = buildOriginalKey(baseKey, file.type);
  results.push({
    name: 'original',
    blob: file,
    contentType: file.type,
    key: originalKey,
  });

  // Resize variants in parallel
  const variantResults = await Promise.all(
    config.variants.map(async (variant: VariantName) => {
      const size = VARIANT_SIZES[variant];
      const blob = await resizeCanvas(picaInstance, workCanvas, size, size, config.flattenOnWhite);
      return {
        name: variant,
        blob,
        contentType: 'image/webp',
        key: buildVariantKey(baseKey, variant),
      } satisfies GeneratedVariant;
    }),
  );

  results.push(...variantResults);
  return results;
}
