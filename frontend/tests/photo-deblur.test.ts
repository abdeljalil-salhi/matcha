import { expect, test, vi } from "vitest";
import { deblurPixels } from "../src/utils/photoDeblur";

function pixels(values: number[]) {
  return new Uint8ClampedArray(values.flatMap((value) => [value, value, value, 255]));
}

function simulateBlur(source: number[], width: number, height: number) {
  return source.map((_, index) => {
    let sum = 0;
    const x = index % width;
    const y = Math.floor(index / width);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = Math.max(0, Math.min(width - 1, x + dx));
        const ny = Math.max(0, Math.min(height - 1, y + dy));
        sum += source[ny * width + nx]! * (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1) / 16;
      }
    }
    return sum;
  });
}

test("restoration reduces reconstruction error on a known mild Gaussian blur", async () => {
  const width = 32;
  const original = Array.from({ length: width * width }, (_, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    return x >= 8 && x < 24 && y >= 8 && y < 24 ? 190 : 55;
  });
  const blurred = pixels(simulateBlur(original, width, width));
  const restored = await deblurPixels(blurred, width, width, 1);
  const error = (data: Uint8ClampedArray) => original.reduce((sum, value, i) => sum + (data[i * 4]! - value) ** 2, 0);
  expect(error(restored)).toBeLessThan(error(blurred) * 0.85);
  expect(blurred).toEqual(pixels(simulateBlur(original, width, width)));
});

test("zero strength and cancelled work leave the image unchanged", async () => {
  const source = pixels([40, 80, 140, 180]);
  expect(await deblurPixels(source, 4, 1, 0)).toEqual(source);
  expect(await deblurPixels(source, 4, 1, Number.NaN)).toEqual(source);
  const current = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
  expect(await deblurPixels(source, 4, 1, 1, current)).toEqual(source);
  expect(current).toHaveBeenCalledTimes(2);
});

test("flat images stay flat and noise corrections are bounded with alpha preserved", async () => {
  const flat = pixels(Array(25).fill(128));
  expect(await deblurPixels(flat, 5, 5, 1)).toEqual(flat);
  const source = pixels(Array.from({ length: 25 }, (_, i) => 100 + (i % 2 ? 4 : -4)));
  source[3] = 90;
  const result = await deblurPixels(source, 5, 5, 1);
  for (let i = 0; i < result.length; i += 4) {
    expect(Math.abs(result[i]! - source[i]!)).toBeLessThanOrEqual(24);
    expect(result[i + 3]).toBe(source[i + 3]);
    expect(result[i]).toBe(result[i + 1]);
    expect(result[i]).toBe(result[i + 2]);
  }
});
