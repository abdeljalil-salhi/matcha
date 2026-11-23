/** Local, conservative noise reduction and sharpening; never invents detail. */
export function enhancePixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  strength: number,
): Uint8ClampedArray {
  const amount = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
  const output = new Uint8ClampedArray(source);
  if (amount === 0) return output;

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
      for (let channel = 0; channel < 3; channel++) {
        let total = 0;
        let weight = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = Math.max(0, Math.min(width - 1, x + dx));
            const ny = Math.max(0, Math.min(height - 1, y + dy));
            const kernel = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
            total += smooth[(ny * width + nx) * 4 + channel]! * kernel;
            weight += kernel;
          }
        }
        const pixel = smooth[index + channel]!;
        // Limit edge amplification to avoid strong halos around faces.
        const detail = Math.max(-12, Math.min(12, pixel - total / weight));
        const sharpened = pixel + detail * amount * 0.65;
        output[index + channel] = (sharpened - 128) * (1 + amount * 0.04) + 128 + amount * 2;
      }
    }
  }
  return output;
}
