const luminance = (red: number, green: number, blue: number) =>
  red * 0.2126 + green * 0.7152 + blue * 0.0722;

/** Adaptive local enhancement; never invents detail or changes the source. */
export function enhancePixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  strength: number,
): Uint8ClampedArray {
  const amount = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
  const output = new Uint8ClampedArray(source);
  if (amount === 0) return output;

  // Ignore extreme outliers when measuring contrast and exposure.
  const histogram = new Uint32Array(256);
  let count = 0;
  for (let index = 0; index < source.length; index += 4) {
    if (source[index + 3] === 0) continue;
    const light = Math.round(luminance(source[index]!, source[index + 1]!, source[index + 2]!));
    histogram[light] = histogram[light]! + 1;
    count++;
  }
  if (!count) return output;
  const percentile = (fraction: number) => {
    let cumulative = 0;
    const target = Math.max(1, Math.ceil(count * fraction));
    for (let value = 0; value < 256; value++) {
      cumulative += histogram[value]!;
      if (cumulative >= target) return value;
    }
    return 255;
  };
  const low = percentile(0.02);
  const high = percentile(0.98);
  const middle = percentile(0.5);
  const pivot = (low + high) / 2;
  const gain = 1.06 + Math.max(0, 180 - (high - low)) / 180 * 0.29;
  const exposure = middle < 105 ? Math.min(18, (105 - middle) * 0.35)
    : middle > 175 ? -Math.min(12, (middle - 175) * 0.25) : 0;

  // Only blend similar neighbours, so noise is softened without blurring edges.
  const smooth = new Float32Array(source.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const original = source[index + channel]!;
        let total = original * 4;
        let weight = 4;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if ((!dx && !dy) || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
            const neighbour = source[((y + dy) * width + x + dx) * 4 + channel]!;
            if (Math.abs(neighbour - original) <= 18) {
              total += neighbour;
              weight++;
            }
          }
        }
        smooth[index + channel] = original + (total / weight - original) * amount * 0.6;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const light = luminance(smooth[index]!, smooth[index + 1]!, smooth[index + 2]!);
      const toneWeight = 4 * (light / 255) * (1 - light / 255);
      const corrected = Math.max(0, Math.min(255, pivot + (light - pivot) * gain + exposure * toneWeight));
      const toneDelta = (corrected - light) * amount;
      for (let channel = 0; channel < 3; channel++) {
        let total = 0;
        let localMin = 255;
        let localMax = 0;
        let weight = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = Math.max(0, Math.min(width - 1, x + dx * 2));
            const ny = Math.max(0, Math.min(height - 1, y + dy * 2));
            const kernel = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
            const neighbour = smooth[(ny * width + nx) * 4 + channel]!;
            localMin = Math.min(localMin, neighbour);
            localMax = Math.max(localMax, neighbour);
            total += neighbour * kernel;
            weight += kernel;
          }
        }
        const pixel = smooth[index + channel]!;
        // A wider sharpening radius makes enlarged soft edges visibly clearer.
        // Suppress sharpening in flat/noisy areas and cap halos at strong edges.
        const detail = localMax - localMin > 24
          ? Math.max(-24, Math.min(24, pixel - total / weight)) : 0;
        output[index + channel] = pixel + toneDelta + detail * amount * 1.8;
      }
    }
  }
  return output;
}
