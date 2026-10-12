import React, { useState, useRef, useEffect } from "react";
import { EditorTab } from "../types";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Image as ImageIcon,
} from "lucide-react";

interface ImageViewerProps {
  tab: EditorTab;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ tab }) => {
  const [zoom, setZoom] = useState(1);
  const [naturalDimensions, setNaturalDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  // Reset zoom & pan when tab changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setNaturalDimensions(null);
  }, [tab.id]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalDimensions({
      width: img.naturalWidth,
      height: img.naturalHeight,
    });
  };

  const handleZoomIn = () => setZoom((z) => Math.min(Number((z * 1.25).toFixed(2)), 8));
  const handleZoomOut = () => setZoom((z) => Math.max(Number((z / 1.25).toFixed(2)), 0.1));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleFitToScreen = () => {
    if (!naturalDimensions || !containerRef.current) return;
    const container = containerRef.current;
    const padding = 80;
    const availWidth = container.clientWidth - padding;
    const availHeight = container.clientHeight - padding;
    const scaleX = availWidth / naturalDimensions.width;
    const scaleY = availHeight / naturalDimensions.height;
    const fitScale = Math.min(scaleX, scaleY, 1);
    setZoom(Number(fitScale.toFixed(2)));
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const srcUrl = tab.imageData?.data_url || tab.path;
  const ext = tab.name.split(".").pop()?.toUpperCase() || "IMAGE";

  return (
    <div className="image-viewer-container" ref={containerRef}>
      {/* Top Header / Toolbar */}
      <div className="image-viewer-toolbar">
        <div className="image-viewer-info">
          <span className="image-format-badge">{ext}</span>
          <span className="image-file-name">{tab.name}</span>
          {naturalDimensions && (
            <span className="image-dimensions-badge">
              {naturalDimensions.width} × {naturalDimensions.height} px
            </span>
          )}
          <span className="image-size-badge">
            {formatFileSize(tab.imageData?.size_bytes)}
          </span>
        </div>

        <div className="image-viewer-actions">
          <div className="image-zoom-pill">
            <button
              className="image-btn-icon"
              onClick={handleZoomOut}
              title="Zoom Out (Scroll Down)"
            >
              <ZoomOut size={13} />
            </button>
            <span className="image-zoom-label" onClick={handleResetZoom}>
              {Math.round(zoom * 100)}%
            </span>
            <button
              className="image-btn-icon"
              onClick={handleZoomIn}
              title="Zoom In (Scroll Up)"
            >
              <ZoomIn size={13} />
            </button>
          </div>

          <button
            className="image-btn-action"
            onClick={handleFitToScreen}
            title="Fit to Screen"
          >
            <Maximize2 size={12} />
            <span>Fit</span>
          </button>

          <button
            className="image-btn-action"
            onClick={handleResetZoom}
            title="Reset 100%"
          >
            <RotateCcw size={12} />
            <span>100%</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Area with Transparent Checkerboard */}
      <div
        className="image-viewer-canvas image-viewer-checkerboard"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
      >
        <div
          className="image-wrapper"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: isDragging ? "none" : "transform 0.15s ease-out",
          }}
        >
          <img
            src={srcUrl}
            alt={tab.name}
            className="image-element"
            onLoad={handleImageLoad}
            draggable={false}
          />
        </div>
      </div>

      {/* Bottom Status Strip */}
      <div className="image-viewer-footer">
        <span className="footer-item">
          <ImageIcon size={11} className="mr-1 text-sky-400" />
          Native Hardware-Accelerated macOS Image Renderer
        </span>
        <span className="footer-item">
          Drag to pan when zoomed • Scroll to zoom
        </span>
      </div>
    </div>
  );
};
