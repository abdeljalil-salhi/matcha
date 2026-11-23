import { expect, test } from "vitest";
import { clahePixels } from "../src/utils/photoContrast";

function image(width: number, height: number, sample: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      data.set([sample(x, y), sample(x, y), sample(x, y), 255], index);
    }
  }
  return data;
}

test("local contrast improves in both shadowed and bright regions", () => {
  const source = image(64, 64, (x) => (x < 32 ? 60 : 160) + (x % 8) * 2);
  const original = source.slice();
  const result = clahePixels(source, 64, 64, 1);
  const range = (data: Uint8ClampedArray, start: number) => data[(start + 7) * 4]! - data[start * 4]!;
  expect(range(result, 16)).toBeGreaterThan(range(source, 16) + 3);
  expect(range(result, 40)).toBeGreaterThan(range(source, 40) + 3);
  expect(source).toEqual(original);
});

test("flat regions and faint flat-field noise remain unchanged", () => {
  const flat = image(64, 64, () => 110);
  expect(clahePixels(flat, 64, 64, 1)).toEqual(flat);
  const noise = image(64, 64, (x, y) => 110 + ((x + y) % 2 ? 1 : -1));
  expect(clahePixels(noise, 64, 64, 1)).toEqual(noise);
});

test("tile interpolation does not create abrupt seams in a smooth gradient", () => {
  const source = image(256, 32, (x) => x);
  const result = clahePixels(source, 256, 32, 1);
  for (let x = 1; x < 256; x++) {
    expect(Math.abs(result[x * 4]! - result[(x - 1) * 4]!)).toBeLessThanOrEqual(8);
  }
});

test("strength can be disabled and colour differences and alpha are preserved", () => {
  const source = image(64, 64, (x) => 80 + x % 8 * 3);
  for (let index = 0; index < source.length; index += 4) {
    source[index] = source[index]! + 35;
    source[index + 2] = source[index + 2]! - 15;
    source[index + 3] = 170;
  }
  expect(clahePixels(source, 64, 64, 0)).toEqual(source);
  expect(clahePixels(source, 64, 64, Number.NaN)).toEqual(source);
  const result = clahePixels(source, 64, 64, 0.5);
  expect(result).not.toEqual(source);
  for (let i = 0; i < source.length; i += 4) {
    expect(result[i]! - result[i + 1]!).toBe(35);
    expect(result[i + 1]! - result[i + 2]!).toBe(15);
    expect(result[i + 3]).toBe(170);
  }
});
