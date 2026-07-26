import { supabase } from "../../lib/supabase";
import React, { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import ReactCrop, {
 type PercentCrop,
 type PixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import ThemedChessboard from "../../theme/ThemedChessboard"
import {
 PanelCard,
 PrimaryButton,
 SecondaryButton,
 SectionTitle,
} from "../../components/trainer/ui";
import "./AnalyzeSubpages.css";

type ImageResult = {
 ok?: boolean;
 fen?: string;
 orientation?: "white" | "black" | "unknown";
 confidence?: number;
 notes?: string;
 error?: string;
};

type ImageDimensions = {
 width: number;
 height: number;
};

type ProcessedImage = {
 blob: Blob;
 previewUrl: string;
 width: number;
 height: number;
};

const TIMING_LOG_PREFIX = "[Image to Position]";

const START_FEN = new Chess().fen();
const IMAGE_TO_POSITION_DESKTOP_MAX_BOARD_SIZE = 520;
const CROPPED_IMAGE_MAX_SIDE = 900;
const CROPPED_IMAGE_JPEG_QUALITY = 0.9;

function getImageToPositionBoardSize() {
 if (typeof window !== "undefined" && window.innerWidth <= 768) {
 return Math.min(
 IMAGE_TO_POSITION_DESKTOP_MAX_BOARD_SIZE,
 Math.max(0, window.innerWidth - 16),
 );
 }

 return IMAGE_TO_POSITION_DESKTOP_MAX_BOARD_SIZE;
}

function fileToDataUrl(file: File) {
 return new Promise<string>((resolve, reject) => {
 const reader = new FileReader();

 reader.onload = () => resolve(String(reader.result || ""));
 reader.onerror = () => reject(new Error("Could not read image."));
 reader.readAsDataURL(file);
 });
}

function logDevelopmentTiming(label: string, elapsedMs: number, detail = "") {
 if (!import.meta.env.DEV) return;

 console.info(
 `${TIMING_LOG_PREFIX} ${label}: ${elapsedMs.toFixed(1)}ms${detail ? ` (${detail})` : ""}`,
 );
}

function logPreviewDecodeTiming(dataUrl: string) {
 if (!import.meta.env.DEV) return;

 const startedAt = performance.now();
 const image = new Image();

 image.onload = () => {
 logDevelopmentTiming(
 "image decode (no client resize)",
 performance.now() - startedAt,
 `${image.naturalWidth}×${image.naturalHeight}`,
 );
 };
 image.onerror = () => {
 logDevelopmentTiming(
 "image decode (no client resize, failed)",
 performance.now() - startedAt,
 );
 };
 image.src = dataUrl;
}

function decodeImageDimensions(dataUrl: string) {
 const startedAt = performance.now();
 const image = new Image();

 return new Promise<ImageDimensions>((resolve, reject) => {
 image.onload = () => {
 logDevelopmentTiming(
 "image decode (no client resize)",
 performance.now() - startedAt,
 `${image.naturalWidth} x ${image.naturalHeight}`,
 );
 resolve({ width: image.naturalWidth, height: image.naturalHeight });
 };
 image.onerror = () => {
 logDevelopmentTiming(
 "image decode (no client resize, failed)",
 performance.now() - startedAt,
 );
 reject(new Error("Could not decode image."));
 };
 image.src = dataUrl;
 });
}

function createInitialCrop({ width, height }: ImageDimensions): PercentCrop {
 const side = Math.min(width, height) * 0.9;
 const cropWidth = (side / width) * 100;
 const cropHeight = (side / height) * 100;

 return {
 unit: "%",
 x: (100 - cropWidth) / 2,
 y: (100 - cropHeight) / 2,
 width: cropWidth,
 height: cropHeight,
 };
}

function percentToPixelCrop(
 crop: PercentCrop,
 { width, height }: ImageDimensions,
): PixelCrop {
 return {
 unit: "px",
 x: (crop.x / 100) * width,
 y: (crop.y / 100) * height,
 width: (crop.width / 100) * width,
 height: (crop.height / 100) * height,
 };
}

function canvasToJpegBlob(canvas: HTMLCanvasElement) {
 return new Promise<Blob>((resolve, reject) => {
 canvas.toBlob(
 (blob) => {
 if (blob) {
 resolve(blob);
 } else {
 reject(new Error("Could not prepare the cropped image."));
 }
 },
 "image/jpeg",
 CROPPED_IMAGE_JPEG_QUALITY,
 );
 });
}

export default function ImageToPositionPage() {
 const fileInputRef = useRef<HTMLInputElement | null>(null);

 const [previewUrl, setPreviewUrl] = useState("");
 const [fen, setFen] = useState("");
 const [orientation, setOrientation] = useState<"white" | "black">("white");
 const [confidence, setConfidence] = useState<number | null>(null);
 const [notes, setNotes] = useState("");
 const [message, setMessage] = useState("Upload or drop a chessboard screenshot.");
 const [loading, setLoading] = useState(false);
 const [elapsedSeconds, setElapsedSeconds] = useState(0);
 const [dragActive, setDragActive] = useState(false);
 const [boardSize, setBoardSize] = useState(getImageToPositionBoardSize);
 const [sourceDimensions, setSourceDimensions] = useState<ImageDimensions | null>(null);
 const [originalFileSize, setOriginalFileSize] = useState(0);
 const [crop, setCrop] = useState<PercentCrop | null>(null);
 const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
 const [processedImage, setProcessedImage] = useState<ProcessedImage | null>(null);
 const [isApplyingCrop, setIsApplyingCrop] = useState(false);
 const conversionStartedAtRef = useRef<number | null>(null);
 const conversionInFlightRef = useRef(false);
 const cropImageRef = useRef<HTMLImageElement | null>(null);

 useEffect(() => {
 function resize() {
 setBoardSize(getImageToPositionBoardSize());
 }

 resize();
 window.addEventListener("resize", resize);
 return () => window.removeEventListener("resize", resize);
 }, []);

 useEffect(() => {
 if (!loading || conversionStartedAtRef.current === null) return;

 const updateElapsed = () => {
 const startedAt = conversionStartedAtRef.current;
 if (startedAt === null) return;
 setElapsedSeconds(Math.floor((performance.now() - startedAt) / 1000));
 };

 updateElapsed();
 const intervalId = window.setInterval(updateElapsed, 250);

 return () => window.clearInterval(intervalId);
 }, [loading]);

 useEffect(() => {
 return () => {
 if (processedImage?.previewUrl) {
 URL.revokeObjectURL(processedImage.previewUrl);
 }
 };
 }, [processedImage]);

 async function acceptFile(file: File) {
 if (conversionInFlightRef.current) return;

 if (!file.type.startsWith("image/")) {
 setMessage("Please choose an image file.");
 return;
 }

 const readStartedAt = performance.now();
 const dataUrl = await fileToDataUrl(file);
 logDevelopmentTiming(
 "image file reading",
 performance.now() - readStartedAt,
 `${Math.round(file.size / 1024)} KiB`,
 );
 const dimensions = await decodeImageDimensions(dataUrl);
 logDevelopmentTiming(
 "original image",
 0,
 `${Math.round(file.size / 1024)} KiB, ${dimensions.width} x ${dimensions.height}`,
 );

 setPreviewUrl(dataUrl);
 setSourceDimensions(dimensions);
 setOriginalFileSize(file.size);
 setCrop(createInitialCrop(dimensions));
 setCompletedCrop(null);
 setProcessedImage(null);
 setFen("");
 setConfidence(null);
 setNotes("");
 setMessage("Crop the board, then click Apply Crop.");
 }

 function updateCrop(nextCrop: PercentCrop) {
 setCrop(nextCrop);
 setCompletedCrop(
 sourceDimensions
 ? percentToPixelCrop(nextCrop, sourceDimensions)
 : null,
 );
 setProcessedImage(null);
 setMessage("Crop adjusted. Click Apply Crop before converting.");
 }

 async function applyCrop() {
 if (!sourceDimensions || !completedCrop || loading || isApplyingCrop) return;

 setIsApplyingCrop(true);
 setMessage("Preparing cropped image…");
 try {
 const source = cropImageRef.current;
 if (!source || !source.naturalWidth || !source.naturalHeight) {
 throw new Error("The source image is not ready. Please choose it again.");
 }

 const displayedWidth = source.width;
 const displayedHeight = source.height;
 if (!displayedWidth || !displayedHeight) {
 throw new Error("Could not read the displayed crop image dimensions.");
 }

 const scaleX = source.naturalWidth / displayedWidth;
 const scaleY = source.naturalHeight / displayedHeight;
 logDevelopmentTiming(
 "displayed crop coordinates",
 0,
 `x=${completedCrop.x.toFixed(1)}, y=${completedCrop.y.toFixed(1)}, width=${completedCrop.width.toFixed(1)}, height=${completedCrop.height.toFixed(1)} CSS px; display=${displayedWidth} x ${displayedHeight}; natural=${source.naturalWidth} x ${source.naturalHeight}`,
 );

 const naturalX = completedCrop.x * scaleX;
 const naturalY = completedCrop.y * scaleY;
 const naturalWidth = completedCrop.width * scaleX;
 const naturalHeight = completedCrop.height * scaleY;
 const sourceX = Math.min(
 source.naturalWidth - 1,
 Math.max(0, Math.round(naturalX)),
 );
 const sourceY = Math.min(
 source.naturalHeight - 1,
 Math.max(0, Math.round(naturalY)),
 );
 const sourceWidth = Math.max(
 1,
 Math.min(
 source.naturalWidth - sourceX,
 Math.round(naturalWidth),
 ),
 );
 const sourceHeight = Math.max(
 1,
 Math.min(
 source.naturalHeight - sourceY,
 Math.round(naturalHeight),
 ),
 );
 logDevelopmentTiming(
 "scaled natural-image crop coordinates",
 0,
 `x=${sourceX}, y=${sourceY}, width=${sourceWidth}, height=${sourceHeight}; scaleX=${scaleX.toFixed(3)}, scaleY=${scaleY.toFixed(3)}`,
 );

 const cropStartedAt = performance.now();
 const croppedCanvas = document.createElement("canvas");
 croppedCanvas.width = sourceWidth;
 croppedCanvas.height = sourceHeight;
 const croppedContext = croppedCanvas.getContext("2d");
 if (!croppedContext) throw new Error("Could not prepare crop canvas.");
 croppedContext.drawImage(
 source,
 sourceX,
 sourceY,
 sourceWidth,
 sourceHeight,
 0,
 0,
 sourceWidth,
 sourceHeight,
 );
 logDevelopmentTiming(
 "crop processing",
 performance.now() - cropStartedAt,
 `${sourceWidth} x ${sourceHeight}`,
 );

 const scale = Math.min(
 1,
 CROPPED_IMAGE_MAX_SIDE / Math.max(sourceWidth, sourceHeight),
 );
 const outputWidth = Math.max(1, Math.round(sourceWidth * scale));
 const outputHeight = Math.max(1, Math.round(sourceHeight * scale));
 const resizeStartedAt = performance.now();
 const outputCanvas = document.createElement("canvas");
 outputCanvas.width = outputWidth;
 outputCanvas.height = outputHeight;
 const outputContext = outputCanvas.getContext("2d");
 if (!outputContext) throw new Error("Could not prepare resize canvas.");
 outputContext.imageSmoothingEnabled = true;
 outputContext.imageSmoothingQuality = "high";
 outputContext.drawImage(croppedCanvas, 0, 0, outputWidth, outputHeight);
 logDevelopmentTiming(
 "resize processing",
 performance.now() - resizeStartedAt,
 `${outputWidth} x ${outputHeight}`,
 );

 const compressionStartedAt = performance.now();
 const blob = await canvasToJpegBlob(outputCanvas);
 logDevelopmentTiming(
 "crop export and compression",
 performance.now() - compressionStartedAt,
 `${Math.round(blob.size / 1024)} KiB, ${outputWidth} x ${outputHeight}`,
 );
 logDevelopmentTiming(
 "crop before/after payload",
 0,
 `${Math.round(originalFileSize / 1024)} KiB original -> ${Math.round(blob.size / 1024)} KiB JPEG`,
 );

 setProcessedImage({
 blob,
 previewUrl: URL.createObjectURL(blob),
 width: outputWidth,
 height: outputHeight,
 });
 setMessage("Cropped board is ready. Click Convert Image.");
 } catch (error) {
 setMessage(error instanceof Error ? error.message : "Could not crop image.");
 } finally {
 setIsApplyingCrop(false);
 }
 }

 async function convertImage() {
 if (loading || conversionInFlightRef.current) return;

 if (!processedImage) {
 setMessage("Crop the board and click Apply Crop before converting.");
 return;
 }

 conversionInFlightRef.current = true;
 const totalStartedAt = performance.now();
 conversionStartedAtRef.current = totalStartedAt;
 setElapsedSeconds(0);
 setLoading(true);
 setMessage("Analyzing image…");

 try {
 const sessionStartedAt = performance.now();
 const {
  data: sessionData,
  error: sessionError,
 } = await supabase.auth.getSession();
 logDevelopmentTiming(
 "session lookup",
 performance.now() - sessionStartedAt,
 );

 if (
  sessionError ||
  !sessionData.session?.access_token
 ) {
  setMessage("Log in to use Image to Position.");
  return;
 }

 const preparationStartedAt = performance.now();
 const form = new FormData();

 form.append("image", processedImage.blob, "board-crop.jpg");
 logDevelopmentTiming(
 "upload preparation",
 performance.now() - preparationStartedAt,
 `${Math.round(processedImage.blob.size / 1024)} KiB, ${processedImage.width} x ${processedImage.height}`,
 );

 const imageApiUrl = import.meta.env.DEV
  ? "http://localhost:8787/api/image-to-position"
  : "/api/image-to-position";

 const requestStartedAt = performance.now();
 const response = await fetch(imageApiUrl, {
  method: "POST",
  headers: {
   Authorization:
    `Bearer ${sessionData.session.access_token}`,
  },
 body: form,
 });
 logDevelopmentTiming(
 "upload, network, and server processing",
 performance.now() - requestStartedAt,
 );

 if (import.meta.env.DEV) {
 const serverTiming = response.headers.get("server-timing");
 if (serverTiming) {
 console.info(`${TIMING_LOG_PREFIX} server timing: ${serverTiming}`);
 }
 }

 const responseParsingStartedAt = performance.now();
 const data = (await response.json()) as ImageResult;
 logDevelopmentTiming(
 "response parsing",
 performance.now() - responseParsingStartedAt,
 );

 if (!response.ok || data.error) {
 throw new Error(data.error || "Image conversion failed.");
 }

 const postProcessingStartedAt = performance.now();
 const nextFen = data.fen || "";

 new Chess(nextFen);

 setFen(nextFen);
 setOrientation(data.orientation === "black" ? "black" : "white");
 setConfidence(typeof data.confidence === "number" ? data.confidence : null);
 setNotes(data.notes || "");
 const quota = (data as any).quota;

 if (quota) {
  const remaining =
   Number(quota.remaining) || 0;

  const period =
   quota.tier === "premium"
    ? "today"
    : "during this 7-day period";

  setMessage(
   `Position detected. ${remaining} Image to Position conversion${remaining === 1 ? "" : "s"} remaining ${period}.`,
  );
 } else {
  setMessage("Position detected. Check it before loading.");
 }
 logDevelopmentTiming(
 "board and FEN post-processing",
 performance.now() - postProcessingStartedAt,
 );
 } catch (error) {
 setMessage(error instanceof Error ? error.message : "Could not convert image.");
 } finally {
 logDevelopmentTiming(
 "total elapsed time",
 performance.now() - totalStartedAt,
 );
 conversionStartedAtRef.current = null;
 conversionInFlightRef.current = false;
 setLoading(false);
 }
 }

 function loadInSetup() {
 if (!fen) return;
 window.location.href = `/analyze/setup?fen=${encodeURIComponent(fen)}`;
 }

 function loadInAnalysis() {
 if (!fen) return;
 window.location.href = `/analyze/board?fen=${encodeURIComponent(fen)}`;
 }

 function playPosition() {
 if (!fen) return;

 window.location.href =
 `/play-vs-computer?fen=${encodeURIComponent(fen)}` +
 `&color=${orientation === "black" ? "black" : "white"}` +
 `&mode=play&source=image-to-position`;
 }

 const boardFen = fen || START_FEN;
 const processingMessage = loading
 ? `Analyzing image… ${elapsedSeconds}s`
 : message;

 return (
 <div
 className="analyze-image-page site-mobile-dock-scroll"
 style={{
 minHeight: "100vh",
 background: "#11100f",
 color: "#f3f0e8",
 padding: 40,
 boxSizing: "border-box",
 }}
 >
 <div
 className="analyze-image-page__content"
 style={{
 maxWidth: 1180,
 margin: "0 auto",
 display: "grid",
 gridTemplateColumns: "minmax(420px, 560px) minmax(360px, 1fr)",
 gap: 26,
 alignItems: "start",
 }}
 >
 <div>
 <h1
 className="analyze-image-page__title"
 style={{
 display: "inline-block",
 margin: "0 0 16px",
 padding: "10px 18px",
 borderRadius: 12,
 background: "#2a2522",
 fontSize: 28,
 lineHeight: 1,
 }}
 >
 📷 Image to Position
 </h1>

 <PanelCard>
 <SectionTitle>Detected board</SectionTitle>

 <div
 className="analyze-image-page__board"
 style={{
 width: boardSize,
 maxWidth: "100%",
 marginTop: 12,
 }}
 >
 <ThemedChessboard
 position={boardFen}
 boardOrientation={orientation}
 boardWidth={boardSize}
 arePiecesDraggable={false}
 customDarkSquareStyle={{ backgroundColor: "#769656" }}
 customLightSquareStyle={{ backgroundColor: "#eeeed2" }}
 />
 </div>

 {fen ? (
 <textarea
 value={fen}
 onChange={(event) => {
 const value = event.target.value;
 setFen(value);

 try {
 new Chess(value);
 setMessage("FEN is valid.");
 } catch {
 setMessage("FEN is not valid yet.");
 }
 }}
 style={{
 width: "100%",
 minHeight: 70,
 marginTop: 14,
 boxSizing: "border-box",
 borderRadius: 10,
 border: "1px solid rgba(255,255,255,0.12)",
 background: "#171513",
 color: "#f3f0e8",
 padding: 10,
 fontFamily: "monospace",
 fontSize: 13,
 }}
 />
 ) : null}

 <div
 style={{
 marginTop: 14,
 display: "flex",
 gap: 8,
 flexWrap: "wrap",
 }}
 >
 <PrimaryButton disabled={!fen} onClick={loadInSetup}>
 Load in Setup
 </PrimaryButton>

 <SecondaryButton disabled={!fen} onClick={loadInAnalysis}>
 Load in Analysis
 </SecondaryButton>

 <SecondaryButton disabled={!fen} onClick={playPosition}>
 Play Position
 </SecondaryButton>
 </div>
 </PanelCard>
 </div>

 <PanelCard>
 <SectionTitle>Upload screenshot</SectionTitle>

 <div className="analyze-image-page__crop-help">
 <strong>1. Choose image</strong>
 <span>2. Crop image</span>
 <span>3. Convert image</span>
 <p>Crop only the board for best speed and accuracy.</p>
 <p>Smaller cropped images upload faster.</p>
 <p>Try to exclude menus, borders, and other UI.</p>
 </div>

 {!previewUrl ? (
 <div
 className="analyze-image-page__drop-zone"
 onDragOver={(event) => {
 event.preventDefault();
 setDragActive(true);
 }}
 onDragLeave={() => setDragActive(false)}
 onDrop={async (event) => {
 event.preventDefault();
 setDragActive(false);

 const file = event.dataTransfer.files?.[0];

 if (file) {
 await acceptFile(file);
 }
 }}
 onClick={() => fileInputRef.current?.click()}
 style={{
 marginTop: 12,
 minHeight: 250,
 borderRadius: 14,
 border: dragActive
 ? "2px dashed #7fa650"
 : "2px dashed rgba(255,255,255,0.18)",
 background: dragActive ? "#1d2818" : "#171513",
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 textAlign: "center",
 cursor: "pointer",
 overflow: "hidden",
 }}
 >
 <div style={{ opacity: 0.82, lineHeight: 1.6 }}>
 Drop image here
 <br />
 or click to choose file
 </div>
 </div>
 ) : null}

 <input
 ref={fileInputRef}
 type="file"
 accept="image/*"
 hidden
 onChange={async (event) => {
 const file = event.target.files?.[0];

 if (file) {
 await acceptFile(file);
 }

 event.target.value = "";
 }}
 />

 {previewUrl && sourceDimensions && crop ? (
 <div className="analyze-image-page__crop-stage">
 <div className="analyze-image-page__crop-stage-header">
 <SectionTitle>{processedImage ? "Ready to convert" : "2. Crop board"}</SectionTitle>
 <SecondaryButton
 disabled={loading || isApplyingCrop}
 onClick={() => fileInputRef.current?.click()}
 >
 Choose different image
 </SecondaryButton>
 </div>

 <ReactCrop
 className="analyze-image-page__react-crop"
 crop={crop}
 disabled={loading || isApplyingCrop}
 keepSelection
 onChange={(_, percentCrop) => updateCrop(percentCrop)}
 onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
 >
 <img
 ref={cropImageRef}
 src={previewUrl}
 alt="Original screenshot with crop selection"
 draggable={false}
 onLoad={(event) => {
 if (!crop) return;
 setCompletedCrop(
 percentToPixelCrop(crop, {
 width: event.currentTarget.naturalWidth,
 height: event.currentTarget.naturalHeight,
 }),
 );
 }}
 />
 </ReactCrop>

 <div className="analyze-image-page__crop-primary-actions">
 <PrimaryButton
 disabled={loading || isApplyingCrop || (!processedImage && !completedCrop)}
 onClick={processedImage ? convertImage : applyCrop}
 >
 {isApplyingCrop
 ? "Preparing cropped image…"
 : processedImage
 ? "Convert Image"
 : "Apply Crop"}
 </PrimaryButton>
 <SecondaryButton
 disabled={loading || isApplyingCrop}
 onClick={() => updateCrop(createInitialCrop(sourceDimensions))}
 >
 Reset crop
 </SecondaryButton>
 <SecondaryButton
 disabled={loading || isApplyingCrop}
 onClick={() => updateCrop({ unit: "%", x: 0, y: 0, width: 100, height: 100 })}
 >
 Use full image
 </SecondaryButton>
 </div>

 {processedImage ? (
 <div className="analyze-image-page__processed-preview">
 <img src={processedImage.previewUrl} alt="Cropped board ready to upload" />
 <span>
 Upload preview: {processedImage.width} x {processedImage.height}px, {Math.round(processedImage.blob.size / 1024)} KiB
 </span>
 </div>
 ) : null}
 </div>
 ) : null}

 <div
 style={{
 marginTop: 14,
 display: "flex",
 gap: 8,
 flexWrap: "wrap",
 }}
 >
 <PrimaryButton disabled={!processedImage || loading} onClick={convertImage}>
 {loading ? processingMessage : "Convert Image"}
 </PrimaryButton>

 <SecondaryButton
 onClick={() => {
 setPreviewUrl("");
 setSourceDimensions(null);
 setOriginalFileSize(0);
 setCrop(null);
 setCompletedCrop(null);
 setProcessedImage(null);
 setFen("");
 setConfidence(null);
 setNotes("");
 setMessage("Upload or drop a chessboard screenshot.");
 }}
 >
 Clear
 </SecondaryButton>

 <SecondaryButton onClick={() => (window.location.href = "/analyze")}>
 Back
 </SecondaryButton>
 </div>

 <div
 style={{
 marginTop: 16,
 padding: 12,
 borderRadius: 10,
 background: "#211e1b",
 fontSize: 14,
 lineHeight: 1.5,
 }}
 >
 <strong>Status:</strong>{" "}
 <span aria-live="polite" aria-busy={loading}>
 {processingMessage}
 </span>

 {confidence !== null ? (
 <div style={{ marginTop: 8 }}>
 Confidence: {Math.round(confidence * 100)}%
 </div>
 ) : null}

 {notes ? <div style={{ marginTop: 8 }}>Notes: {notes}</div> : null}
 </div>

 <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
 Tip: screenshots with board coordinates are much easier. Always check the FEN before playing.
 </div>
 </PanelCard>
 </div>
 </div>
 );
}
