import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent,
} from "react";
import { api, photoUrl, type PhotoRef } from "../../api";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { useToast } from "../../context/ToastContext";
import {
  clampEdits,
  drawEditedImage,
  loadImage,
  MAX_PHOTO_BYTES,
  PHOTO_FILTERS,
  renderEditedImage,
  type ImageEdits,
} from "../../utils/imageEditor";

const MAX_PHOTOS = 5;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

const DEFAULT_EDITS: ImageEdits = {
  rotation: 0,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  filter: PHOTO_FILTERS[0].css,
  enhancement: 0,
};

interface PhotoManagerProps {
  photos: PhotoRef[];
  onChanged: () => void | Promise<unknown>;
}

interface Draft extends ImageEdits {
  file: File;
  url: string;
  width: number;
  height: number;
}

export function PhotoManager({ photos, onChanged }: PhotoManagerProps) {
  const { notify } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const editorErrorRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const enhancedRef = useRef<HTMLCanvasElement>(null);
  const openingRef = useRef(false);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [busyId, setBusyId] = useState<number | "upload" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PhotoRef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<File[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const [previewVersion, setPreviewVersion] = useState("");

  const viewportSize = () => viewportRef.current?.clientWidth || 320;
  const enhancementVersion = draft ? JSON.stringify([
    draft.url, draft.zoom, draft.rotation, draft.offsetX, draft.offsetY,
    draft.filter, draft.enhancement, viewportSize(),
  ]) : "";

  useEffect(() => {
    if (!draft?.enhancement) {
      setShowBefore(false);
      return;
    }
    let active = true;
    // Coalesce slider/pan changes; never apply an old preview to a newer draft.
    const timer = window.setTimeout(() => {
      void loadImage(draft.url).then((image) => {
        if (!active || !enhancedRef.current) return;
        drawEditedImage(enhancedRef.current, image, draft, viewportSize());
        setPreviewVersion(enhancementVersion);
      }).catch(() => {
        if (!active) return;
        setError("Enhancement preview is unavailable. Try again or upload without enhancement.");
        setDraft((current) => current && { ...current, enhancement: 0 });
      });
    }, 120);
    return () => { active = false; window.clearTimeout(timer); };
  }, [enhancementVersion]);

  useEffect(() => {
    if (openingRef.current || draft || queue.length === 0) return;
    openingRef.current = true;
    const file = queue[0];
    if (!file) {
      openingRef.current = false;
      return;
    }
    setQueue(queue.slice(1));
    const url = URL.createObjectURL(file);
    void loadImage(url)
      .then((image) => {
        setDraft({
          ...DEFAULT_EDITS,
          file,
          url,
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
      })
      .catch((cause) => {
        URL.revokeObjectURL(url);
        setError(cause instanceof Error ? cause.message : "Unable to open that image.");
      })
      .finally(() => {
        openingRef.current = false;
      });
  }, [draft, queue]);

  useEffect(() => {
    const url = draft?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [draft?.url]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !draft) return;
    // Pixel offsets must stay valid if the responsive crop window changes size.
    const observer = new ResizeObserver(() => {
      dragRef.current = null;
      setDraft((current) => current && clampEdits(
        current, current.width, current.height, viewport.clientWidth || 320,
      ));
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [draft?.url]);

  useEffect(() => {
    if (draft && error) editorErrorRef.current?.focus();
  }, [draft?.url, error]);

  const enqueue = (files: File[]) => {
    if (files.length === 0) return;
    setError(null);
    const problems = new Set<string>();
    const valid = files.filter((file) => {
      if (!ACCEPTED.includes(file.type)) {
        problems.add("Choose JPEG, PNG, or WebP images.");
        return false;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        problems.add("Images must be 10 MiB or smaller.");
        return false;
      }
      return true;
    });

    const remaining = MAX_PHOTOS - photos.length - queue.length - (draft ? 1 : 0);
    if (remaining <= 0) {
      setError("You can keep up to five photos.");
      return;
    }
    if (valid.length > remaining) {
      problems.add(`Only ${remaining} photo slot${remaining === 1 ? "" : "s"} left.`);
    }
    if (problems.size > 0) setError([...problems].join(" "));
    setQueue((current) => [...current, ...valid.slice(0, remaining)]);
  };

  const chooseFiles = (event: ChangeEvent<HTMLInputElement>) => {
    enqueue(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files");

  const onDragEnter = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    setDragging(true);
  };

  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (event: DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  };

  const onDrop = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    setDragging(false);
    enqueue(Array.from(event.dataTransfer.files));
  };

  const updateDraft = (patch: Partial<ImageEdits>) => {
    setDraft((current) => {
      if (!current) return current;
      return clampEdits(
        { ...current, ...patch },
        current.width,
        current.height,
        viewportSize(),
      );
    });
  };

  const rotate = (delta: number) => {
    setDraft((current) => {
      if (!current) return current;
      return clampEdits(
        { ...current, rotation: (current.rotation + delta + 360) % 360 },
        current.width,
        current.height,
        viewportSize(),
      );
    });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!draft || busyId === "upload") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      ox: draft.offsetX,
      oy: draft.offsetY,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start || !draft) return;
    updateDraft({
      offsetX: start.ox + event.clientX - start.x,
      offsetY: start.oy + event.clientY - start.y,
    });
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const cancelAll = () => {
    if (busyId === "upload") return;
    setQueue([]);
    setDraft(null);
  };

  const apply = async () => {
    if (!draft || busyId !== null) return;
    setBusyId("upload");
    setError(null);
    try {
      const file = await renderEditedImage(draft.file, draft, viewportSize());
      const result = await api.profile.uploadPhoto(file);
      notify(result.is_primary ? "Photo added as your profile picture." : "Photo added.", "success");
      await onChanged();
      setDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to upload that photo.");
    } finally {
      setBusyId(null);
    }
  };

  const makePrimary = async (photo: PhotoRef) => {
    if (photo.is_primary) return;
    setBusyId(photo.id);
    setError(null);
    try {
      await api.profile.setPrimaryPhoto(photo.id);
      notify("Profile picture updated.", "success");
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to change your profile picture.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setBusyId(pendingDelete.id);
    setError(null);
    try {
      await api.profile.deletePhoto(pendingDelete.id);
      notify("Photo removed.", "success");
      setPendingDelete(null);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove that photo.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className={`photo-manager${dragging ? " is-dragging" : ""}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {error && !draft ? <div className="error-banner" role="alert">{error}</div> : null}

      <div className="photo-grid">
        {photos.map((photo) => (
          <div key={photo.id} className={`photo-tile${photo.is_primary ? " photo-tile--primary" : ""}`}>
            <img src={photoUrl(photo.id)} alt="Your profile" loading="lazy" />
            {photo.is_primary ? <span className="photo-tile__badge">Profile picture</span> : null}
            <div className="photo-tile__actions">
              {!photo.is_primary ? (
                <button
                  type="button"
                  onClick={() => void makePrimary(photo)}
                  disabled={busyId !== null}
                  aria-label={`Make photo ${photo.id} your profile picture`}
                >
                  <Icon name="star" size={15} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setPendingDelete(photo)}
                disabled={busyId !== null}
                aria-label={`Remove photo ${photo.id}`}
              >
                <Icon name="close" size={15} />
              </button>
            </div>
          </div>
        ))}

        {photos.length < MAX_PHOTOS ? (
          <button
            type="button"
            className="photo-tile photo-tile--add"
            onClick={() => inputRef.current?.click()}
            disabled={busyId === "upload"}
          >
            <Icon name="plus" size={22} />
            <span>Add photos</span>
            <small>{photos.length}/{MAX_PHOTOS}</small>
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        multiple
        className="sr-only"
        onChange={(event) => void chooseFiles(event)}
      />

      <div className="photo-manager__drop-hint" aria-hidden={!dragging}>
        <Icon name="camera" size={18} />
        <span>Drop images here to add them to your gallery</span>
      </div>

      <p className="text-small text-muted">
        Drag images onto the gallery or choose files. Crop, rotate, filter and enhance them before uploading.
        JPEG, PNG, or WebP up to 10 MiB, five photos maximum. One must be your profile picture.
      </p>

      <Modal
        open={draft !== null}
        onClose={cancelAll}
        title="Edit your photo"
        description={queue.length > 0 ? `${queue.length + 1} photos queued` : undefined}
        size="lg"
        className="photo-editor-modal"
        backdropClassName="photo-editor-backdrop"
        footer={
          <>
            <Button className="photo-editor__reset" variant="ghost" onClick={() => updateDraft(DEFAULT_EDITS)} disabled={busyId === "upload"}>
              Reset edits
            </Button>
            <Button variant="secondary" onClick={cancelAll} disabled={busyId === "upload"}>
              Cancel
            </Button>
            <Button loading={busyId === "upload"} onClick={() => void apply()}>
              Apply & upload
            </Button>
          </>
        }
      >
        {draft && error ? (
          <div ref={editorErrorRef} className="error-banner" role="alert" tabIndex={-1}>{error}</div>
        ) : null}
        {draft ? (
          <div className="photo-editor">
            <div className="photo-editor__stage">
              <div className="photo-editor__preview">
                <div
                  ref={viewportRef}
                  className="photo-editor__crop"
                  tabIndex={0}
                  aria-label="Reposition photo by dragging"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  <img
                    src={draft.url}
                    alt="Photo crop preview"
                    draggable={false}
                    style={{
                      // Keep the full cover-sized image behind the square crop window.
                      width: `${(draft.width / Math.min(draft.width, draft.height)) * 100}%`,
                      height: `${(draft.height / Math.min(draft.width, draft.height)) * 100}%`,
                      transform: `translate(-50%, -50%) translate(${draft.offsetX}px, ${draft.offsetY}px) rotate(${draft.rotation}deg) scale(${draft.zoom})`,
                      filter: draft.filter,
                    }}
                  />
                  {draft.enhancement ? (
                    <canvas
                      ref={enhancedRef}
                      className="photo-editor__enhanced"
                      aria-label="Enhanced photo preview"
                      role="img"
                      hidden={showBefore || previewVersion !== enhancementVersion}
                    />
                  ) : null}
                  <span className="photo-editor__grid" aria-hidden="true" />
                  <span className="photo-editor__corners" aria-hidden="true"><i /><i /><i /><i /></span>
                </div>
                {draft.enhancement ? (
                  <div className="photo-editor__comparison">
                    <span className="text-small text-muted" role="status">
                      {previewVersion !== enhancementVersion ? "Updating preview…" : showBefore ? "Before enhancement" : "Enhanced preview"}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-pressed={showBefore}
                      onClick={() => setShowBefore((current) => !current)}
                      disabled={busyId === "upload" || previewVersion !== enhancementVersion}
                    >
                      {showBefore ? "Show enhanced" : "Show before"}
                    </Button>
                  </div>
                ) : null}
              </div>
              <p className="photo-editor__hint text-small text-muted"><Icon name="crop" size={16} /> Drag to reposition. Use the zoom slider to frame your crop.</p>
              <div className="photo-editor__zoom-bar">
                <span>Zoom</span>
                <button type="button" aria-label="Zoom out" onClick={() => updateDraft({ zoom: Math.max(1, draft.zoom - 0.1) })} disabled={busyId === "upload" || draft.zoom <= 1}>
                  <Icon name="minus" size={16} />
                </button>
                <input
                  aria-label="Zoom"
                  type="range"
                  min="1"
                  max="2"
                  step="0.05"
                  value={draft.zoom}
                  onChange={(event) => updateDraft({ zoom: Number(event.target.value) })}
                  disabled={busyId === "upload"}
                />
                <button type="button" aria-label="Zoom in" onClick={() => updateDraft({ zoom: Math.min(2, draft.zoom + 0.1) })} disabled={busyId === "upload" || draft.zoom >= 2}>
                  <Icon name="plus" size={16} />
                </button>
                <output aria-label="Zoom level">{draft.zoom.toFixed(1)}×</output>
              </div>

            </div>

            <div className="photo-editor__controls">
              <div className="photo-editor__tools">
                <button type="button" className="is-active" aria-label="Reposition crop" onClick={() => viewportRef.current?.focus()} disabled={busyId === "upload"}>
                  <Icon name="crop" size={22} /><span>Crop</span>
                </button>
                <button type="button" onClick={() => rotate(-90)} aria-label="Rotate left" disabled={busyId === "upload"}>
                  <Icon name="rotateLeft" size={22} /><span>Rotate left</span>
                </button>
                <button type="button" onClick={() => rotate(90)} aria-label="Rotate right" disabled={busyId === "upload"}>
                  <Icon name="rotateRight" size={22} /><span>Rotate right</span>
                </button>
                <button type="button" aria-label="Reset crop" onClick={() => updateDraft({ rotation: 0, zoom: 1, offsetX: 0, offsetY: 0 })} disabled={busyId === "upload"}>
                  <Icon name="refresh" size={22} /><span>Reset</span>
                </button>
              </div>

              <span className="photo-editor__label photo-editor__label--filters">
                <Icon name="sliders" size={16} /> Filters
              </span>
              <div className="photo-editor__filters">
                {PHOTO_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    className={filter.css === draft.filter ? "is-active" : ""}
                    onClick={() => updateDraft({ filter: filter.css })}
                    aria-pressed={filter.css === draft.filter}
                    disabled={busyId === "upload"}
                  >
                    <span className="photo-editor__filter-image">
                      <img src={draft.url} alt="" draggable={false} style={{ filter: filter.css, transform: `rotate(${draft.rotation}deg)` }} />
                      {filter.css === draft.filter ? <span className="photo-editor__filter-check"><Icon name="check" size={12} /></span> : null}
                    </span>
                    <span className="photo-editor__filter-name">{filter.label}</span>
                  </button>
                ))}
              </div>

              <div className="photo-editor__enhancement">
                <label className="photo-editor__label" htmlFor="photo-enhance">
                  <Icon name="sparkles" size={18} />
                  <span>Enhance photo</span>
                  <input
                    id="photo-enhance"
                    type="checkbox"
                    checked={Boolean(draft.enhancement)}
                    onChange={(event) => updateDraft({ enhancement: event.target.checked ? 0.5 : 0 })}
                    disabled={busyId === "upload"}
                  />
                </label>
                <p className="text-small text-muted">Gently sharpen, soften noise and balance lighting.</p>
                {draft.enhancement ? (
                  <div className="photo-editor__strength">
                    <label className="photo-editor__zoom" htmlFor="photo-enhancement-strength">
                      <span>Enhancement strength</span>
                      <strong>{Math.round(draft.enhancement * 100)}%</strong>
                    </label>
                    <input
                      id="photo-enhancement-strength"
                      aria-label="Enhancement strength"
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.1"
                      value={draft.enhancement}
                      onChange={(event) => updateDraft({ enhancement: Number(event.target.value) })}
                      disabled={busyId === "upload"}
                    />
                  </div>
                ) : null}
              </div>

            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Remove this photo?"
        description={pendingDelete?.is_primary ? "This is your current profile picture." : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>Keep it</Button>
            <Button variant="danger" loading={busyId === pendingDelete?.id} onClick={() => void remove()}>
              Remove photo
            </Button>
          </>
        }
      >
        <p className="text-muted">You can upload a replacement at any time.</p>
      </Modal>
    </div>
  );
}
