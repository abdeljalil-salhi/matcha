import { expect, test, vi } from "vitest";
import { api, ApiError } from "../src/api";
import { saveDetectedLocation } from "../src/utils/location";

test("detected coordinates keep their precision, consent, and GPS source", async () => {
  const saved = { city: "Paris", area: "Montmartre", country_code: "FR", location_source: "gps" as const };
  const request = vi.spyOn(api.profile, "setLocation").mockResolvedValue(saved);
  expect(await saveDetectedLocation(48.8867, 2.3431)).toEqual(saved);
  expect(request).toHaveBeenCalledExactlyOnceWith({
    source: "gps", latitude: 48.8867, longitude: 2.3431, consent: true,
  });
});

test.each([422, 503])("a %s GPS failure never silently saves a manual fallback", async (status) => {
  const error = new ApiError(status, "Enter your location manually.");
  const request = vi.spyOn(api.profile, "setLocation").mockRejectedValue(error);
  await expect(saveDetectedLocation(-40.12345, -150.54321)).rejects.toBe(error);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0]?.[0].source).toBe("gps");
});
