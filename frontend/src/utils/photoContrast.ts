/** Contrast-limited adaptive histogram equalization on luminance only.
 * Tile-centre interpolation prevents hard boundaries; flat tiles stay unchanged.
 */
export function clahePixels(
  source: Uint8ClampedArray, width: number, height: number, strength: number,
): Uint8ClampedArray {
  const amount = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
  const output = new Uint8ClampedArray(source);
  if (!amount) return output;
  const columns = Math.min(8, width);
  const rows = Math.min(8, height);
  const maps: Float32Array[] = [];
  const light = (index: number) => Math.round(source[index]! * 0.2126 + source[index + 1]! * 0.7152 + source[index + 2]! * 0.0722);
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < columns; tx++) {
      const histogram = new Uint32Array(256);
      let count = 0;
      let low = 255;
      let high = 0;
      for (let y = Math.floor(ty * height / rows); y < Math.floor((ty + 1) * height / rows); y++) {
        for (let x = Math.floor(tx * width / columns); x < Math.floor((tx + 1) * width / columns); x++) {
          const index = (y * width + x) * 4;
          if (!source[index + 3]) continue;
          const value = light(index);
          histogram[value] = histogram[value]! + 1;
          low = Math.min(low, value);
          high = Math.max(high, value);
          count++;
        }
      }
      const map = new Float32Array(256);
      if (!count || high - low <= 2) {
        for (let value = 0; value < 256; value++) map[value] = value;
      } else {
        const limit = Math.max(1, Math.ceil(2 * count / 256));
        let excess = 0;
        for (let value = 0; value < 256; value++) {
          excess += Math.max(0, histogram[value]! - limit);
          histogram[value] = Math.min(histogram[value]!, limit);
        }
        const share = Math.floor(excess / 256);
        const remainder = excess % 256;
        for (let value = 0; value < 256; value++) histogram[value] = histogram[value]! + share;
        // Spread the remainder over the entire range, without favouring shadows.
        for (let i = 0; i < remainder; i++) {
          const value = Math.floor((i + 0.5) * 256 / remainder);
          histogram[value] = histogram[value]! + 1;
        }
        let cumulative = 0;
        for (let value = 0; value < 256; value++) {
          cumulative += histogram[value]!;
          map[value] = cumulative * 255 / count;
        }
      }
      maps.push(map);
    }
  }
  for (let y = 0; y < height; y++) {
    const gy = (y + 0.5) * rows / height - 0.5;
    const top = Math.max(0, Math.min(rows - 1, Math.floor(gy)));
    const bottom = Math.max(0, Math.min(rows - 1, Math.floor(gy) + 1));
    const fy = gy - Math.floor(gy);
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      if (!source[index + 3]) continue;
      const gx = (x + 0.5) * columns / width - 0.5;
      const left = Math.max(0, Math.min(columns - 1, Math.floor(gx)));
      const right = Math.max(0, Math.min(columns - 1, Math.floor(gx) + 1));
      const fx = gx - Math.floor(gx);
      const value = light(index);
      const upper = maps[top * columns + left]![value]! * (1 - fx) + maps[top * columns + right]![value]! * fx;
      const lower = maps[bottom * columns + left]![value]! * (1 - fx) + maps[bottom * columns + right]![value]! * fx;
      const target = upper * (1 - fy) + lower * fy;
      const adjustment = Math.max(-48, Math.min(48, target - value)) * amount * 0.75;
      const red = source[index]!;
      const green = source[index + 1]!;
      const blue = source[index + 2]!;
      // Preserve chroma differences and keep all channels inside the gamut.
      const delta = Math.max(-Math.min(red, green, blue), Math.min(255 - Math.max(red, green, blue), adjustment));
      output[index] = red + delta;
      output[index + 1] = green + delta;
      output[index + 2] = blue + delta;
    }
  }
  return output;
}
