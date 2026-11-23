import { expect, test, vi } from "vitest";
import { enhancePixels } from "../src/utils/photoEnhancement";
import { drawEditedImage } from "../src/utils/imageEditor";

function grey(values: number[]) {
  return new Uint8ClampedArray(values.flatMap((value) => [value, value, value, 255]));
}

test("disabled enhancement preserves every byte and never changes the source", () => {
  const source = new Uint8ClampedArray([0, 17, 255, 87, 123, 99, 2, 255]);
  const original = source.slice();
  expect(enhancePixels(source, 2, 1, 0)).toEqual(original);
  expect(enhancePixels(source, 2, 1, Number.NaN)).toEqual(original);
  enhancePixels(source, 2, 1, 1);
  expect(source).toEqual(original);
});

test("subtle flat-area noise is reduced without destroying a strong edge", () => {
  const source = grey([100, 100, 100, 100, 112, 100, 100, 100, 100]);
  const result = enhancePixels(source, 3, 3, 1);
  expect(result[16]! - result[0]!).toBeLessThan(12);
  const edge = enhancePixels(grey([30, 30, 220, 220]), 4, 1, 1);
  expect(edge[8]! - edge[4]!).toBeGreaterThanOrEqual(190);
});

test("strength is bounded, output stays valid and alpha is preserved", () => {
  const source = new Uint8ClampedArray([0, 0, 0, 25, 255, 255, 255, 128]);
  const enhanced = enhancePixels(source, 2, 1, 1);
  expect(enhancePixels(source, 2, 1, 100)).toEqual(enhanced);
  expect(enhanced[3]).toBe(25);
  expect(enhanced[7]).toBe(128);
  expect(enhanced[0]).toBe(0);
  expect(enhanced[4]).toBe(255);
  expect(enhancePixels(grey([200]), 1, 1, 0.5)[0]).not.toBe(enhancePixels(grey([200]), 1, 1, 1)[0]);
});

test("preview/export crop applies enhancement only when requested", () => {
  const data = new Uint8ClampedArray(1080 * 1080 * 4).fill(200);
  const original = data.slice();
  const putImageData = vi.fn();
  const getImageData = vi.fn(() => ({ data }));
  const context = {
    translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), drawImage: vi.fn(),
    getImageData, putImageData,
  };
  const canvas = { getContext: () => context } as unknown as HTMLCanvasElement;
  const image = { naturalWidth: 600, naturalHeight: 1200 } as HTMLImageElement;
  const edits = { rotation: 90, zoom: 1.5, offsetX: 20, offsetY: 0, filter: "grayscale(1)" };
  drawEditedImage(canvas, image, edits, 320);
  expect(getImageData).not.toHaveBeenCalled();
  expect(context.rotate).toHaveBeenLastCalledWith(Math.PI / 2);
  expect(context.drawImage).toHaveBeenLastCalledWith(image, -300, -600);
  drawEditedImage(canvas, image, { ...edits, enhancement: 0.5 }, 320);
  expect(putImageData).toHaveBeenCalledOnce();
  expect(data).not.toEqual(original);
});
