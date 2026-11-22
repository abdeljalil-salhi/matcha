# UI examples

These screenshots show the current frontend flows. They are also served by the
dev server at `http://localhost:5173/examples/<filename>`.

| Example | What it shows | File |
| --- | --- | --- |
| Location search | Typing `ber` suggests Berlin, Bergen, Kreuzberg and Neukölln from the built-in place list. Example chips let users try other cities. | [location-search.jpg](../frontend/public/examples/location-search.jpg) |
| Saved location | After saving Berlin, the profile hero and location summary both show the new area. The value survives a reload. | [profile-location-saved.jpg](../frontend/public/examples/profile-location-saved.jpg) |
| World map | Featured city pins on real OpenStreetMap tiles. Click a pin to fly to it. | [map-world.jpg](../frontend/public/examples/map-world.jpg) |
| Neighborhoods | Zooming into Paris reveals Montmartre, Latin Quarter, Le Marais and Belleville pins. | [map-neighborhoods.jpg](../frontend/public/examples/map-neighborhoods.jpg) |
| Photo gallery | Drag-and-drop uploads, crop/rotate/filter editor, primary photo switching and deletion. | [photo-gallery.jpg](../frontend/public/examples/photo-gallery.jpg) |
| Discovery | Profile cards with photos, tags, fame and location. | [discovery.jpg](../frontend/public/examples/discovery.jpg) |
| Mobile location | The same location picker and example chips at a 390px viewport. | [mobile-location.jpg](../frontend/public/examples/mobile-location.jpg) |

To regenerate them, run `node /tmp/opencode/examples-capture.mjs` with
`PLAYWRIGHT_BROWSERS_PATH=/tmp/opencode/pw/browsers` while the dev server and API
are running.
