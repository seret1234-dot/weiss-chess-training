import React, { useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
 PanelCard,
 PrimaryButton,
 SecondaryButton,
 SectionTitle,
} from "../../components/trainer/ui";

type ImageResult = {
 ok?: boolean;
 fen?: string;
 orientation?: "white" | "black" | "unknown";
 confidence?: number;
 notes?: string;
 error?: string;
};

const START_FEN = new Chess().fen();

function fileToDataUrl(file: File) {
 return new Promise<string>((resolve, reject) => {
 const reader = new FileReader();

 reader.onload = () => resolve(String(reader.result || ""));
 reader.onerror = () => reject(new Error("Could not read image."));
 reader.readAsDataURL(file);
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
 const [dragActive, setDragActive] = useState(false);

 async function acceptFile(file: File) {
 if (!file.type.startsWith("image/")) {
 setMessage("Please choose an image file.");
 return;
 }

 const dataUrl = await fileToDataUrl(file);

 setPreviewUrl(dataUrl);
 setFen("");
 setConfidence(null);
 setNotes("");
 setMessage("Image loaded. Click Convert Image.");
 }

 async function convertImage() {
 if (!previewUrl) {
 setMessage("Upload an image first.");
 return;
 }

 setLoading(true);
 setMessage("Sending image to local server, then OpenAI vision...");

 try {
 const blob = await fetch(previewUrl).then((response) => response.blob());
 const form = new FormData();

 form.append("image", blob, "board.png");

 const response = await fetch("http://localhost:8787/api/image-to-position", {
 method: "POST",
 body: form,
 });

 const data = (await response.json()) as ImageResult;

 if (!response.ok || data.error) {
 throw new Error(data.error || "Image conversion failed.");
 }

 const nextFen = data.fen || "";

 new Chess(nextFen);

 setFen(nextFen);
 setOrientation(data.orientation === "black" ? "black" : "white");
 setConfidence(typeof data.confidence === "number" ? data.confidence : null);
 setNotes(data.notes || "");
 setMessage("Position detected. Check it before loading.");
 } catch (error) {
 setMessage(error instanceof Error ? error.message : "Could not convert image.");
 } finally {
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

 return (
 <div
 style={{
 minHeight: "100vh",
 background: "#11100f",
 color: "#f3f0e8",
 padding: 40,
 boxSizing: "border-box",
 }}
 >
 <div
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
 style={{
 width: 520,
 maxWidth: "100%",
 marginTop: 12,
 }}
 >
 <Chessboard
 position={boardFen}
 boardOrientation={orientation}
 boardWidth={520}
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

 <div
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
 {previewUrl ? (
 <img
 src={previewUrl}
 alt="Uploaded chessboard"
 style={{
 width: "100%",
 maxHeight: 420,
 objectFit: "contain",
 }}
 />
 ) : (
 <div style={{ opacity: 0.82, lineHeight: 1.6 }}>
 Drop image here
 <br />
 or click to choose file
 </div>
 )}
 </div>

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

 <div
 style={{
 marginTop: 14,
 display: "flex",
 gap: 8,
 flexWrap: "wrap",
 }}
 >
 <PrimaryButton disabled={!previewUrl || loading} onClick={convertImage}>
 {loading ? "Converting..." : "Convert Image"}
 </PrimaryButton>

 <SecondaryButton
 onClick={() => {
 setPreviewUrl("");
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
 <strong>Status:</strong> {message}

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