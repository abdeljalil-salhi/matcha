/** Apply a symmetric 3-tap Gaussian PSF, separably, with clamped borders. */
function blur(input: Float32Array, output: Float32Array, scratch: Float32Array, width: number, height: number) {
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      scratch[row + x] = input[row + Math.max(0, x - 1)]! * 0.25
        + input[row + x]! * 0.5 + input[row + Math.min(width - 1, x + 1)]! * 0.25;
    }
  }
  for (let y = 0; y < height; y++) {
    const above = Math.max(0, y - 1) * width;
    const below = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x++) {
      output[y * width + x] = scratch[above + x]! * 0.25
        + scratch[y * width + x]! * 0.5 + scratch[below + x]! * 0.25;
    }
  }
}

/** Damped Richardson–Lucy with an assumed mild Gaussian blur, without AI.
 * Work in luminance to preserve colour; cap corrections to contain ringing.
 * Yield between iterations so sliders/cancel remain responsive on mobile.
 */
export async function deblurPixels(
  source: Uint8ClampedArray, width: number, height: number, strength: number,
  isCurrent: () => boolean = () => true,
): Promise<Uint8ClampedArray> {
  const amount = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
  const output = new Uint8ClampedArray(source);
  if (!amount || !isCurrent()) return output;
  const size = width * height;
  const observed = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    observed[i] = source[i * 4]! * 0.2126 + source[i * 4 + 1]! * 0.7152 + source[i * 4 + 2]! * 0.0722;
  }
  const estimate = observed.slice();
  const prediction = new Float32Array(size);
  const ratio = new Float32Array(size);
  const correction = new Float32Array(size);
  const scratch = new Float32Array(size);
  const iterations = 2 + Math.round(amount * 8);
  for (let iteration = 0; iteration < iterations; iteration++) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    if (!isCurrent()) return output;
    blur(estimate, prediction, scratch, width, height);
    for (let i = 0; i < size; i++) {
      ratio[i] = Math.max(0.5, Math.min(2, (observed[i]! + 0.01) / (prediction[i]! + 0.01)));
    }
    // The reflected PSF equals the PSF because the Gaussian is symmetric.
    blur(ratio, correction, scratch, width, height);
    for (let i = 0; i < size; i++) {
      estimate[i] = Math.max(0, Math.min(255, estimate[i]! * (1 + (correction[i]! - 1) * 0.8)));
    }
  }
  for (let i = 0; i < size; i++) {
    const difference = estimate[i]! - observed[i]!;
    // Suppress tiny corrections that would primarily emphasize noise.
    const detail = Math.sign(difference) * Math.max(0, Math.abs(difference) - 1.5);
    const delta = Math.max(-24, Math.min(24, detail)) * amount;
    for (let channel = 0; channel < 3; channel++) {
      output[i * 4 + channel] = source[i * 4 + channel]! + delta;
    }
  }
  return output;
}
