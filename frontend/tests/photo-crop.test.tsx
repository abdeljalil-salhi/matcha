import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "../src/api";
import { PhotoManager } from "../src/components/profile/PhotoManager";
import * as editor from "../src/utils/imageEditor";

vi.mock("../src/context/ToastContext", () => ({ useToast: () => ({ notify: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());

async function openCrop(width: number, height: number, file = new File(["fixture"], "photo.jpg", { type: "image/jpeg" })) {
  let resize: ResizeObserverCallback = () => {};
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:crop-test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(editor, "loadImage").mockResolvedValue({ naturalWidth: width, naturalHeight: height } as HTMLImageElement);
  const { container } = render(<PhotoManager photos={[]} onChanged={vi.fn()} />);
  await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement,
    file);
  const image = await screen.findByRole("img", { name: "Photo crop preview" }) as HTMLImageElement;
  const crop = image.parentElement!;
  crop.setPointerCapture = vi.fn();
  crop.hasPointerCapture = vi.fn().mockReturnValue(false);
  return { image, crop, resize: () => act(() => resize([], {} as ResizeObserver)) };
}

function drag(crop: HTMLElement, x: number, y: number) {
  fireEvent.pointerDown(crop, { clientX: 0, clientY: 0 });
  fireEvent.pointerMove(crop, { clientX: x, clientY: y });
  fireEvent.pointerUp(crop);
}

test.each([
  [600, 1200, "100%", "200%", 0, -160],
  [1200, 600, "200%", "100%", -160, 0],
  [600, 600, "100%", "100%", 0, 0],
])("%s × %s preview retains the full image when panned", async (width, height, cssWidth, cssHeight, x, y) => {
  const { image, crop } = await openCrop(width as number, height as number);
  expect(image.style.width).toBe(cssWidth);
  expect(image.style.height).toBe(cssHeight);
  drag(crop, -1000, -1000);
  expect(image.style.transform).toContain(`translate(${x}px, ${y}px)`);
  expect(image.style.transform).toContain("translate(-50%, -50%)");
  drag(crop, 2000, 2000);
  expect(image.style.transform).toContain(`translate(${Math.abs(x as number)}px, ${Math.abs(y as number)}px)`);
});

test("rotation, zoom and reset retain matching pan bounds", async () => {
  const { image, crop } = await openCrop(600, 1200);
  await userEvent.click(screen.getByRole("button", { name: "Rotate right" }));
  drag(crop, 1000, 1000);
  expect(image.style.transform).toContain("translate(160px, 0px) rotate(90deg)");
  fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
  drag(crop, 1000, 1000);
  expect(image.style.transform).toContain("translate(480px, 160px) rotate(90deg) scale(2)");
  fireEvent.change(screen.getByRole("slider"), { target: { value: "1" } });
  expect(image.style.transform).toContain("translate(160px, 0px)");
  await userEvent.click(screen.getByRole("button", { name: "Reset edits" }));
  expect(image.style.transform).toContain("translate(0px, 0px) rotate(0deg) scale(1)");
});

test("narrowing the crop window reclamps offsets to keep the image covering it", async () => {
  const { image, crop, resize } = await openCrop(600, 1200);
  drag(crop, 0, -1000);
  Object.defineProperty(crop, "clientWidth", { configurable: true, value: 200 });
  resize();
  expect(image.style.transform).toContain("translate(0px, -100px)");
});


test.each(["encoding", "upload"])("%s errors are readable inside the editor and allow retry", async (failure) => {
  const { image } = await openCrop(600, 1200);
  await userEvent.click(screen.getByRole("button", { name: "Rotate right" }));
  const edits = image.style.transform;
  const encoded = new File(["encoded"], "edited.jpg", { type: "image/jpeg" });
  const renderImage = vi.spyOn(editor, "renderEditedImage").mockResolvedValue(encoded);
  const upload = vi.spyOn(api.profile, "uploadPhoto").mockResolvedValue({ id: 42, is_primary: true });
  const message = failure === "encoding" ? "Unable to save that image." : "The service is temporarily busy. Try again in a moment.";
  if (failure === "encoding") renderImage.mockRejectedValueOnce(new Error(message));
  else upload.mockRejectedValueOnce(new Error(message));
  await userEvent.click(screen.getByRole("button", { name: "Apply & upload" }));
  const dialog = screen.getByRole("dialog", { name: "Edit your photo" });
  const alert = within(dialog).getByRole("alert");
  expect(alert.textContent).toBe(message);
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(document.activeElement).toBe(alert);
  expect(image.style.transform).toBe(edits);
  if (failure === "encoding") expect(upload).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole("button", { name: "Apply & upload" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(upload).toHaveBeenLastCalledWith(encoded);
});

test.each(["Cancel", "Close dialog"])("%s preserves the upload error on the gallery", async (button) => {
  await openCrop(600, 1200);
  vi.spyOn(editor, "renderEditedImage").mockRejectedValue(new Error("Unable to save that image."));
  await userEvent.click(screen.getByRole("button", { name: "Apply & upload" }));
  expect(within(screen.getByRole("dialog")).getByRole("alert")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: button }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("alert").textContent).toBe("Unable to save that image.");
});


test.each([6, 10])("a %s MiB source photo opens in the editor", async (mib) => {
  const file = new File([new Uint8Array(mib * 1024 * 1024)], "large.jpg", { type: "image/jpeg" });
  const { image } = await openCrop(600, 1200, file);
  expect(image).toBeTruthy();
});

test("a source photo exceeding 10 MiB is rejected before opening the editor", async () => {
  const { container } = render(<PhotoManager photos={[]} onChanged={vi.fn()} />);
  const file = new File([new Uint8Array(editor.MAX_PHOTO_BYTES + 1)], "large.jpg", { type: "image/jpeg" });
  await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file);
  expect(screen.getByRole("alert").textContent).toBe("Images must be 10 MiB or smaller.");
  expect(screen.queryByRole("dialog")).toBeNull();
});


test("enhancement is opt-in, compares the same crop, and uploads the selected strength", async () => {
  const drawPreview = vi.spyOn(editor, "drawEditedImage").mockResolvedValue(undefined);
  const { image } = await openCrop(600, 1200);
  const toggle = screen.getByRole("checkbox", { name: "Enhance photo" });
  expect((toggle as HTMLInputElement).checked).toBe(false);
  expect(screen.queryByRole("slider", { name: "Enhancement strength" })).toBeNull();
  await userEvent.click(toggle);
  expect(screen.queryByRole("checkbox", { name: "Reduce blur" })).toBeNull();
  expect(screen.queryByText("Adjust strength")).toBeNull();
  expect(screen.queryByText(/Compare before uploading/)).toBeNull();
  fireEvent.change(screen.getByRole("slider", { name: "Enhancement strength" }), { target: { value: "0.8" } });
  await waitFor(() => expect((screen.getByRole("button", { name: "Show before" }) as HTMLButtonElement).disabled).toBe(false));
  expect(drawPreview).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ enhancement: 0.8 }), 320, expect.any(Function));
  const crop = image.style.transform;
  await userEvent.click(screen.getByRole("button", { name: "Show before" }));
  expect(screen.getByText("Before enhancement")).toBeTruthy();
  expect(image.style.transform).toBe(crop);
  const encode = vi.spyOn(editor, "renderEditedImage").mockResolvedValue(new File(["enhanced"], "photo.jpg", { type: "image/jpeg" }));
  vi.spyOn(api.profile, "uploadPhoto").mockResolvedValue({ id: 42, is_primary: true });
  await userEvent.click(screen.getByRole("button", { name: "Apply & upload" }));
  expect(encode).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ enhancement: 0.8 }), 320);
});

test("reset disables enhancement and a failed preview leaves the editor usable", async () => {
  vi.spyOn(editor, "drawEditedImage").mockResolvedValue(undefined);
  await openCrop(600, 1200);
  await userEvent.click(screen.getByRole("checkbox", { name: "Enhance photo" }));
  await userEvent.click(screen.getByRole("button", { name: "Reset edits" }));
  expect((screen.getByRole("checkbox", { name: "Enhance photo" }) as HTMLInputElement).checked).toBe(false);
  expect(screen.queryByRole("button", { name: "Show before" })).toBeNull();
  vi.spyOn(editor, "drawEditedImage").mockImplementation(() => { throw new Error("Canvas unavailable"); });
  await userEvent.click(screen.getByRole("checkbox", { name: "Enhance photo" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Enhancement preview is unavailable");
  expect((screen.getByRole("checkbox", { name: "Enhance photo" }) as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole("button", { name: "Apply & upload" }) as HTMLButtonElement).disabled).toBe(false);
});

test("visual filters preserve the crop and overlay zoom controls respect their limits", async () => {
  const { image } = await openCrop(1200, 600);
  const originalFilter = screen.getByRole("button", { name: "Original" });
  expect(originalFilter.querySelector("img")?.getAttribute("src")).toBe("blob:crop-test");
  expect(originalFilter.getAttribute("aria-pressed")).toBe("true");
  expect((screen.getByRole("button", { name: "Zoom out" }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(image.style.transform).toContain("scale(1.1)");
  await userEvent.click(screen.getByRole("button", { name: "Mono" }));
  expect(image.style.filter).toBe("grayscale(1) contrast(1.08)");
  expect(image.style.transform).toContain("scale(1.1)");
  expect(screen.getByRole("button", { name: "Mono" }).getAttribute("aria-pressed")).toBe("true");
  const zoom = screen.getByRole("slider", { name: "Zoom" });
  zoom.focus();
  fireEvent.change(zoom, { target: { value: "2" } });
  expect(document.activeElement).toBe(zoom);
  expect((screen.getByRole("button", { name: "Zoom in" }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Reset edits" }));
  expect(image.style.filter).toBe("none");
  expect(image.style.transform).toContain("scale(1)");
  expect(originalFilter.getAttribute("aria-pressed")).toBe("true");
});
