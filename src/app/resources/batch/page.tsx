"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCamera,
  faCheck,
  faPaperPlane,
  faSpinner,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import Button from "../../components/Button";
import ResourceMapCrosshair from "../ResourceMapCrosshair";
import { fetchJson, type ImageGps } from "../resource-form-utils";
import { RESOURCE_TYPES, type ResourceType } from "../resource-types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { buildResourcePath } from "@/lib/resource-pretty-title";

const MAX_IMAGE_EDGE = 1500;
const DEFAULT_COVER_PROMPT =
  'Isolate the "{{title}}" on the photo in front of a pure white background. Professional high-end studio lighting, similar to Apple product photography. Soft, diffused light with subtle natural shadows. Perfectly centered composition. Square aspect ratio. It should fit the frame. Not too much white space. Ultra-clean, sharp focus, high resolution, no additional objects. no frontal view. Make sure background is full white (#fff)';

const getDefaultCoverPrompt = (title: string) =>
  DEFAULT_COVER_PROMPT.replace("{{title}}", title.trim() || "device");

const MemoizedResourceMapCrosshair = memo(ResourceMapCrosshair);

type CapturedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

type UploadJob = {
  id: string;
  createdAt: string;
  status: "uploading" | "success" | "error";
  message?: string;
  resourceId?: string;
  resourcePrettyTitle?: string | null;
  count: number;
};

type SignedUpload = {
  path: string;
  token: string;
  signedUrl: string;
  contentType: string;
};

type ZoomRange = {
  min: number;
  max: number;
  step: number;
};

type MediaTrackCapabilitiesWithZoom = MediaTrackCapabilities & {
  zoom?: MediaSettingsRange;
};

type MediaTrackSettingsWithZoom = MediaTrackSettings & {
  zoom?: number;
};

const getJobId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const normalizeZoomValue = (value: number, range: ZoomRange) => {
  const bounded = Math.min(range.max, Math.max(range.min, value));
  if (!range.step || range.step <= 0) {
    return Number(bounded.toFixed(3));
  }
  const steps = Math.round((bounded - range.min) / range.step);
  return Number((range.min + steps * range.step).toFixed(3));
};

const getTrackZoomRange = (track: MediaStreamTrack): ZoomRange | null => {
  if (!track.getCapabilities) {
    return null;
  }
  const capabilities =
    track.getCapabilities() as MediaTrackCapabilitiesWithZoom;
  const zoom = capabilities.zoom;
  if (!zoom) {
    return null;
  }
  if (typeof zoom.min !== "number" || typeof zoom.max !== "number") {
    return null;
  }
  const step = zoom.step && zoom.step > 0 ? zoom.step : 0.1;
  return {
    min: zoom.min,
    max: zoom.max,
    step,
  };
};

const scaleDimensions = (width: number, height: number, maxEdge: number) => {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width, height };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
};

const canvasToFile = async (canvas: HTMLCanvasElement) =>
  new Promise<File | null>((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve(
          new File([blob], `resource-${Date.now()}.jpg`, {
            type: blob.type || "image/jpeg",
          }),
        );
      },
      "image/jpeg",
      0.9,
    );
  });

const blobToFile = (blob: Blob) =>
  new File([blob], `resource-${Date.now()}.jpg`, {
    type: blob.type || "image/jpeg",
  });

const blobToScaledFile = async (
  blob: Blob,
  maxEdge: number,
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>,
): Promise<File | null> => {
  if (!("createImageBitmap" in window)) {
    return blobToFile(blob);
  }
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const { width, height } = scaleDimensions(
      bitmap.width,
      bitmap.height,
      maxEdge,
    );
    if (width === bitmap.width && height === bitmap.height) {
      return blobToFile(blob);
    }
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return blobToFile(blob);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await canvasToFile(canvas);
  } catch (error) {
    console.log("Batch capture: blob scaling failed", error);
    return blobToFile(blob);
  } finally {
    bitmap?.close?.();
  }
};

const captureFrame = async (
  video: HTMLVideoElement,
  maxEdge: number,
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>,
): Promise<File | null> => {
  console.log("Batch capture: start frame", {
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    maxEdge,
  });
  const widthSource = video.videoWidth;
  const heightSource = video.videoHeight;
  if (!widthSource || !heightSource) {
    console.log("Batch capture: missing video dimensions");
    return null;
  }
  const { width, height } = scaleDimensions(widthSource, heightSource, maxEdge);
  const canvas = canvasRef.current ?? document.createElement("canvas");
  canvasRef.current = canvas;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    if ("createImageBitmap" in window) {
      bitmap = await createImageBitmap(video, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: "high",
      } as ImageBitmapOptions);
      ctx.drawImage(bitmap, 0, 0, width, height);
      console.log("Batch capture: drew frame via createImageBitmap");
    } else {
      ctx.drawImage(video, 0, 0, width, height);
      console.log("Batch capture: drew frame from video element");
    }
  } catch (error) {
    console.log("Batch capture: bitmap capture failed", error);
    ctx.drawImage(video, 0, 0, width, height);
  } finally {
    bitmap?.close?.();
  }

  return await canvasToFile(canvas);
};

const captureBestPhoto = async (
  video: HTMLVideoElement,
  stream: MediaStream | null,
  maxEdge: number,
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>,
): Promise<File | null> => {
  const track = stream?.getVideoTracks?.()[0];
  const ImageCaptureCtor = (
    window as typeof window & {
      ImageCapture?: new (track: MediaStreamTrack) => {
        takePhoto: () => Promise<Blob>;
      };
    }
  ).ImageCapture;
  if (track && ImageCaptureCtor) {
    try {
      const imageCapture = new ImageCaptureCtor(track);
      const blob = await imageCapture.takePhoto();
      const file = await blobToScaledFile(blob, maxEdge, canvasRef);
      if (file) {
        console.log("Batch capture: captured via ImageCapture", {
          size: file.size,
        });
        return file;
      }
    } catch (error) {
      console.log("Batch capture: ImageCapture failed", error);
    }
  }
  return await captureFrame(video, maxEdge, canvasRef);
};

export default function BatchResourcePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const photosRef = useRef<CapturedPhoto[]>([]);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [location, setLocation] = useState<ImageGps | null>(null);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [resourceType, setResourceType] = useState<ResourceType>("object");
  const [autoGenerateCover, setAutoGenerateCover] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(true);
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);
  const [zoomValue, setZoomValue] = useState(1);

  const handleLocationChange = useCallback((gps: ImageGps | null) => {
    setLocation(gps);
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const applyZoom = useCallback(async (requestedZoom: number) => {
    const videoTrack = streamRef.current?.getVideoTracks?.()[0];
    if (!videoTrack) {
      return;
    }
    const range = getTrackZoomRange(videoTrack);
    if (!range) {
      return;
    }
    const nextZoom = normalizeZoomValue(requestedZoom, range);
    try {
      await videoTrack.applyConstraints({
        advanced: [{ zoom: nextZoom } as MediaTrackConstraintSet],
      });
      setZoomValue(nextZoom);
    } catch (error) {
      console.log("Batch capture: zoom apply failed", error);
    }
  }, []);

  const startCamera = useCallback(
    async (deviceId?: string | null) => {
      console.log("Batch capture: start camera", { deviceId });
      setCameraError(null);
      setVideoReady(false);
      setZoomRange(null);
      setZoomValue(1);
      try {
        const constraintsQueue: MediaStreamConstraints[] = deviceId
          ? [
              {
                video: { deviceId: { exact: deviceId } },
                audio: false,
              },
            ]
          : [
              {
                video: { facingMode: { exact: "environment" } },
                audio: false,
              },
              {
                video: { facingMode: { ideal: "environment" } },
                audio: false,
              },
              {
                video: true,
                audio: false,
              },
            ];

        let newStream: MediaStream | null = null;
        let lastError: unknown;
        for (const constraints of constraintsQueue) {
          try {
            newStream = await navigator.mediaDevices.getUserMedia(constraints);
            break;
          } catch (error) {
            lastError = error;
          }
        }
        if (!newStream) {
          throw lastError instanceof Error
            ? lastError
            : new Error("Unable to access camera.");
        }
        console.log("Batch capture: camera stream ready");
        const videoTrack = newStream.getVideoTracks()[0];
        const activeDeviceId = videoTrack?.getSettings?.().deviceId;
        if (activeDeviceId && selectedDeviceId !== activeDeviceId) {
          setSelectedDeviceId(activeDeviceId);
        }
        if (videoTrack) {
          const range = getTrackZoomRange(videoTrack);
          if (range) {
            const settings =
              videoTrack.getSettings() as MediaTrackSettingsWithZoom;
            const initialZoom = normalizeZoomValue(
              typeof settings.zoom === "number" ? settings.zoom : range.min,
              range,
            );
            setZoomRange(range);
            setZoomValue(initialZoom);
            try {
              await videoTrack.applyConstraints({
                advanced: [{ zoom: initialZoom } as MediaTrackConstraintSet],
              });
            } catch (error) {
              console.log("Batch capture: initial zoom apply failed", error);
            }
          }
        }
        if (videoTrack?.getCapabilities) {
          try {
            const caps = videoTrack.getCapabilities();
            const bestConstraints: MediaTrackConstraints = {};
            if (caps.width?.max) {
              bestConstraints.width = { ideal: caps.width.max };
            }
            if (caps.height?.max) {
              bestConstraints.height = { ideal: caps.height.max };
            }
            if (Object.keys(bestConstraints).length > 0) {
              await videoTrack.applyConstraints(bestConstraints);
              console.log("Batch capture: applied max resolution", {
                width: caps.width?.max,
                height: caps.height?.max,
              });
            }
          } catch (error) {
            console.log("Batch capture: constraint optimization failed", error);
          }
        }
        stopStream();
        streamRef.current = newStream;
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          await videoRef.current.play();
          console.log("Batch capture: video playing");
        }
        setNeedsPermission(false);
      } catch (error) {
        console.log("Batch capture: camera error", error);
        setCameraError(
          error instanceof Error ? error.message : "Unable to access camera.",
        );
        setNeedsPermission(true);
      }
    },
    [selectedDeviceId, stopStream],
  );

  useEffect(() => {
    let active = true;
    const checkPermission = async () => {
      if (!navigator.permissions?.query) {
        return;
      }
      try {
        const status = await navigator.permissions.query({
          name: "camera" as PermissionName,
        });
        if (!active) {
          return;
        }
        setNeedsPermission(status.state !== "granted");
        status.onchange = () => {
          if (active) {
            setNeedsPermission(status.state !== "granted");
          }
        };
      } catch (error) {
        console.log("Batch capture: permission query failed", error);
      }
    };

    void checkPermission();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const previous = document.body.dataset.page;
    document.body.dataset.page = "batch-upload";
    return () => {
      if (previous) {
        document.body.dataset.page = previous;
      } else {
        delete document.body.dataset.page;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const content =
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
    const existing = document.querySelector<HTMLMetaElement>(
      'meta[name="viewport"]',
    );
    const previousContent = existing?.getAttribute("content") ?? null;

    let meta = existing;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", content);

    return () => {
      if (!meta) {
        return;
      }
      if (previousContent === null) {
        meta.remove();
        return;
      }
      meta.setAttribute("content", previousContent);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadDevices = async () => {
      try {
        const deviceList = await navigator.mediaDevices.enumerateDevices();
        if (!active) {
          return;
        }
        const cameras = deviceList.filter(
          (device) => device.kind === "videoinput",
        );
        setDevices(cameras);
        const preferredCamera = cameras.find((camera) =>
          /(back|rear|environment)/i.test(camera.label),
        );
        if (preferredCamera && selectedDeviceId !== preferredCamera.deviceId) {
          setSelectedDeviceId(preferredCamera.deviceId);
          return;
        }
        if (!selectedDeviceId && cameras[0]) {
          setSelectedDeviceId(cameras[0].deviceId);
        }
      } catch (error) {
        if (active) {
          setCameraError(
            error instanceof Error ? error.message : "Unable to list cameras.",
          );
        }
      }
    };

    void loadDevices();
    navigator.mediaDevices.addEventListener("devicechange", loadDevices);

    return () => {
      active = false;
      navigator.mediaDevices.removeEventListener("devicechange", loadDevices);
    };
  }, [selectedDeviceId]);

  useEffect(() => {
    if (!selectedDeviceId) {
      return;
    }
    if (!needsPermission) {
      void startCamera(selectedDeviceId);
    }

    return () => {
      stopStream();
    };
  }, [needsPermission, selectedDeviceId, startCamera, stopStream]);

  useEffect(() => () => stopStream(), [stopStream]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(
    () => () => {
      photosRef.current.forEach((photo) =>
        URL.revokeObjectURL(photo.previewUrl),
      );
    },
    [],
  );

  const handleCapture = async () => {
    console.log("Batch capture: handle capture");
    setFormError(null);
    await new Promise(requestAnimationFrame);
    console.log("Batch capture: shutter click");
    try {
      console.log("Batch capture: shutter click");
      if (!videoRef.current) {
        console.log("Batch capture: missing video ref");
        setFormError("Camera not ready.");
        return;
      }
      if (!videoReady) {
        console.log("Batch capture: video not ready");
        setFormError("Camera is still loading. Please try again in a moment.");
        return;
      }
      if (videoRef.current.readyState < 2) {
        console.log("Batch capture: readyState", videoRef.current.readyState);
        setFormError("Camera stream not ready yet.");
        return;
      }
      if (isCapturing) {
        console.log("Batch capture: already capturing");
        return;
      }
      setIsCapturing(true);
      const file = await captureBestPhoto(
        videoRef.current,
        streamRef.current,
        MAX_IMAGE_EDGE,
        canvasRef,
      );
      if (!file) {
        console.log("Batch capture: capture returned null");
        setFormError("Unable to capture photo.");
        return;
      }
      let previewUrl = "";
      try {
        previewUrl = URL.createObjectURL(file);
      } catch (error) {
        console.log("Batch capture: preview error", error);
        setFormError(
          error instanceof Error
            ? error.message
            : "Unable to generate preview.",
        );
        return;
      }
      console.log("Batch capture: photo captured", { size: file.size });
      setPhotos((prev) => [...prev, { id: getJobId(), file, previewUrl }]);
    } catch (error) {
      console.log("Batch capture: capture exception", error);
      setFormError(
        error instanceof Error ? error.message : "Capture failed unexpectedly.",
      );
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRemovePhoto = (id: string) => {
    setPhotos((prev) => {
      const target = prev.find((photo) => photo.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((photo) => photo.id !== id);
    });
  };

  const canSend = photos.length > 0 && Boolean(location);

  const uploadPhotos = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return [];
      }
      const response = await fetchJson<{
        bucket: string;
        uploads: SignedUpload[];
      }>("/api/campai/resources/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          files: files.map((file) => ({
            name: file.name,
            contentType: file.type,
          })),
        }),
      });

      if (response.uploads.length !== files.length) {
        throw new Error("Upload preparation failed.");
      }

      const uploadResults = await Promise.all(
        response.uploads.map((upload, index) =>
          supabase.storage
            .from(response.bucket)
            .uploadToSignedUrl(upload.path, upload.token, files[index], {
              contentType: files[index].type || upload.contentType,
              upsert: true,
            }),
        ),
      );

      uploadResults.forEach((result) => {
        if (result.error) {
          throw new Error(result.error.message || "Upload failed.");
        }
      });

      const publicUrls = response.uploads
        .map(
          (upload) =>
            supabase.storage.from(response.bucket).getPublicUrl(upload.path)
              .data.publicUrl,
        )
        .filter((url): url is string => Boolean(url));

      if (publicUrls.length === 0) {
        throw new Error("Upload failed to return URLs.");
      }

      return publicUrls;
    },
    [supabase],
  );

  const handleSend = () => {
    setFormError(null);
    if (!canSend || !location) {
      setFormError(
        photos.length === 0
          ? "Capture at least one photo before sending."
          : "Map location not ready yet.",
      );
      return;
    }

    const payloadPhotos = photos.map((photo) => photo.file);
    const jobId = getJobId();

    setJobs((prev) => [
      {
        id: jobId,
        createdAt: new Date().toLocaleTimeString("de-DE", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        status: "uploading",
        count: payloadPhotos.length,
      },
      ...prev,
    ]);

    setPhotos((prev) => {
      prev.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      return [];
    });

    void (async () => {
      try {
        const imageUrls = await uploadPhotos(payloadPhotos);
        const created = await fetchJson<{
          id?: string;
          resource?: {
            id?: string;
            name?: string;
            prettyTitle?: string | null;
          };
        }>("/api/campai/resources", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "",
            description: "",
            type: resourceType,
            tags: [],
            categories: [],
            categoryIds: [],
            attachable: false,
            imageUrl: imageUrls[0] ?? null,
            imageUrls,
            mapFeatures: [
              {
                id: "gps-point",
                layer: "location",
                geometryType: "Point",
                point: [location.longitude, location.latitude],
              },
            ],
          }),
        });

        const createdId = created.id ?? created.resource?.id;
        const createdPrettyTitle = created.resource?.prettyTitle ?? null;
        const createdTitle = created.resource?.name ?? "";

        if (autoGenerateCover && createdId) {
          await fetchJson<{ resource?: { id: string } }>(
            `/api/campai/resources/${createdId}/cover`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                sourceIndex: 0,
                prompt: getDefaultCoverPrompt(createdTitle),
              }),
            },
          );
        }

        setJobs((prev) =>
          prev.map((job) =>
            job.id === jobId
              ? {
                  ...job,
                  status: "success",
                  message: createdId
                    ? autoGenerateCover
                      ? "AI cover generated · Open resource"
                      : "Resource created · Open resource"
                    : autoGenerateCover
                      ? "AI cover skipped (resource id missing)."
                      : "Resource created (id missing).",
                  resourceId: createdId,
                  resourcePrettyTitle: createdPrettyTitle,
                }
              : job,
          ),
        );
      } catch (error) {
        setJobs((prev) =>
          prev.map((job) =>
            job.id === jobId
              ? {
                  ...job,
                  status: "error",
                  message:
                    error instanceof Error ? error.message : "Upload failed.",
                }
              : job,
          ),
        );
      }
    })();
  };

  const cameraLabel = useMemo(() => {
    if (devices.length <= 1) {
      return null;
    }
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-200">
        <select
          value={selectedDeviceId ?? ""}
          onChange={(event) => setSelectedDeviceId(event.target.value)}
          className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs text-white max-w-[30vw]"
        >
          {devices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Camera ${index + 1}`}
            </option>
          ))}
        </select>
      </div>
    );
  }, [devices, selectedDeviceId]);

  const zoomPresets = useMemo(() => {
    if (!zoomRange) {
      return [];
    }
    return [0.5, 1, 2, 5].filter(
      (value) => value >= zoomRange.min && value <= zoomRange.max,
    );
  }, [zoomRange]);

  const mapView = useMemo(
    () => (
      <MemoizedResourceMapCrosshair
        gps={location}
        onChange={handleLocationChange}
        className="h-full w-full"
      />
    ),
    [handleLocationChange, location],
  );

  return (
    <main className="h-dvh max-h-dvh overflow-hidden bg-zinc-950 text-white flex flex-col">
      {cameraError ? (
        <section className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          {cameraError}
        </section>
      ) : null}
      {formError ? (
        <section className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          {formError}
        </section>
      ) : null}

      <section className="flex flex-[4] flex-col gap-2 max-h-[50vh] relative">
        <label className="flex items-center gap-2 px-3 py-2 text-xs text-black absolute bottom-1 right-1 z-10">
          <input
            type="checkbox"
            checked={autoGenerateCover}
            onChange={(event) => setAutoGenerateCover(event.target.checked)}
            className="h-4 w-4"
          />
          AI cover
        </label>

        <div className="absolute top-0 left-0 right-0 z-10 flex flex-wrap items-start gap-2 px-2 py-2 pt-2">
          <Button href="/resources" kind="secondary" className="gap-2">
            <FontAwesomeIcon icon={faArrowLeft} className="text-[10px]" />
            Back
          </Button>

          <select
            value={resourceType}
            onChange={(event) => {
              const nextType = event.target.value;
              if (Object.hasOwn(RESOURCE_TYPES, nextType)) {
                setResourceType(nextType as ResourceType);
              }
            }}
            className="rounded-md border-0 bg-black/40 px-3 py-3 text-xs text-white"
          >
            {Object.entries(RESOURCE_TYPES).map(([value, config]) => (
              <option key={value} value={value}>
                {config.label}
              </option>
            ))}
          </select>

          {jobs.length > 0 ? (
            <div className="flex flex-wrap gap-2 text-xs grow-1 text-right">
              {jobs.slice(0, 4).map((job) => (
                <div
                  key={job.id}
                  className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-2 py-1"
                >
                  {job.status === "uploading" ? (
                    <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                  ) : job.status === "success" ? (
                    <FontAwesomeIcon
                      icon={faCheck}
                      className="text-emerald-300"
                    />
                  ) : (
                    <FontAwesomeIcon
                      icon={faTriangleExclamation}
                      className="text-rose-300"
                    />
                  )}
                  <span>
                    {job.createdAt} · {job.count} foto
                    {job.count > 1 ? "s" : ""}
                  </span>
                  {job.message ? (
                    job.status === "success" && job.resourceId ? (
                      <Link
                        href={buildResourcePath({
                          id: job.resourceId,
                          prettyTitle: job.resourcePrettyTitle,
                        })}
                        className="text-emerald-200 underline"
                      >
                        {job.message}
                      </Link>
                    ) : (
                      <span
                        className={
                          job.status === "error"
                            ? "text-rose-200"
                            : "text-emerald-200"
                        }
                      >
                        {job.message}
                      </span>
                    )
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 py-3 grow-1 text-right">
              Recent uploads will appear here
            </p>
          )}
        </div>

        {mapView}
      </section>
      <section className="relative grow-2 max-h-[70vh] overflow-hidden border border-white/10 bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-contain"
          playsInline
          muted
          autoPlay
          onLoadedMetadata={() => setVideoReady(true)}
        />
        <div className="absolute top-1 left-1 right-1 flex items-center justify-between px-3 py-2">
          <div className="max-w-[30%]">{cameraLabel}</div>
          <div>
            {photos.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {photos.map((photo) => (
                  <div key={photo.id} className="relative">
                    <img
                      src={photo.previewUrl}
                      alt="Captured preview"
                      className="h-16 w-16 rounded-xl object-cover border border-white/30"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(photo.id)}
                      className="absolute -right-2 -top-2 rounded-full bg-white/30 w-6 h-6 font-semibold text-white shadow text-xs"
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </div>
                ))}
                {isCapturing ? (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-white/30 bg-white/10">
                    <FontAwesomeIcon
                      icon={faSpinner}
                      className="animate-spin text-base text-white"
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-zinc-400">
                {isCapturing
                  ? "Processing photo…"
                  : "Tap the shutter to capture photos"}
              </p>
            )}
          </div>
        </div>
        {zoomRange ? (
          <div className="absolute bottom-11 left-1/2 z-10 -translate-x-1/2 px-3 py-2">
            {zoomPresets.length > 0 ? (
              <div className="mb-2 flex items-center justify-between gap-1">
                {zoomPresets.map((preset) => {
                  const isActive = Math.abs(zoomValue - preset) < 0.05;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setZoomValue(preset);
                        void applyZoom(preset);
                      }}
                      className={`rounded-md border px-2 py-1 text-[11px] leading-none transition ${
                        isActive
                          ? "border-white bg-white text-zinc-900"
                          : "border-white/30 bg-white/10 text-zinc-100"
                      }`}
                    >
                      {preset}x
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
        {needsPermission ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-center text-xs text-zinc-200">
            <p className="max-w-xs">
              Enable camera access to capture resources.
            </p>
            <button
              type="button"
              onClick={() => void startCamera(selectedDeviceId)}
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-zinc-900"
            >
              Allow camera
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className={`absolute bottom-10 left-12 flex h-14 w-14 items-center justify-center gap-2 px-6 py-2 rounded-full border-4 font-semibold transition ${
            canSend
              ? "border-blue-600/80 bg-blue-600/10 text-blue-600 hover:bg-blue-500"
              : "cursor-not-allowed bg-white/10 text-zinc-400"
          }`}
        >
          <FontAwesomeIcon icon={faPaperPlane} className="text-xl" />
        </button>
        <button
          type="button"
          onClick={handleCapture}
          disabled={!videoReady || isCapturing || needsPermission}
          className={`absolute bottom-10 right-12 flex h-14 w-14 items-center justify-center rounded-full border-4 border-white/80 bg-white/10 text-white shadow ${
            isCapturing ? "opacity-60" : ""
          }`}
        >
          <FontAwesomeIcon icon={faCamera} className="text-xl" />
        </button>
      </section>
    </main>
  );
}
