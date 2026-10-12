import React, { useEffect, useRef, useState, useCallback } from "react";
import { EditorView } from "codemirror";
import { ThemeMode, CodeProblem } from "../types";

interface CodeMinimapProps {
  content: string;
  editorView: EditorView | null;
  theme: ThemeMode;
  problems?: CodeProblem[];
}

export const CodeMinimap: React.FC<CodeMinimapProps> = ({
  content,
  editorView,
  theme,
  problems = [],
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [viewportSlider, setViewportSlider] = useState<{
    top: number;
    height: number;
  }>({ top: 0, height: 40 });

  const [isDragging, setIsDragging] = useState(false);
  const dragStartYRef = useRef(0);
  const dragStartScrollTopRef = useRef(0);

  // Synchronize viewport slider with CodeMirror scroll
  const updateSlider = useCallback(() => {
    if (!editorView || !containerRef.current) return;
    const scrollDom = editorView.scrollDOM;
    const containerHeight = containerRef.current.clientHeight;

    const scrollHeight = scrollDom.scrollHeight || 1;
    const clientHeight = scrollDom.clientHeight || 1;
    const scrollTop = scrollDom.scrollTop || 0;

    const visibleRatio = clientHeight / scrollHeight;
    const sliderHeight = Math.max(containerHeight * visibleRatio, 24);

    const maxScroll = Math.max(scrollHeight - clientHeight, 1);
    const scrollFraction = scrollTop / maxScroll;
    const maxSliderTop = containerHeight - sliderHeight;
    const sliderTop = Math.max(0, Math.min(scrollFraction * maxSliderTop, maxSliderTop));

    setViewportSlider({
      top: sliderTop,
      height: sliderHeight,
    });
  }, [editorView]);

  useEffect(() => {
    if (!editorView) return;
    const scrollDom = editorView.scrollDOM;
    scrollDom.addEventListener("scroll", updateSlider, { passive: true });
    window.addEventListener("resize", updateSlider);
    updateSlider();

    return () => {
      scrollDom.removeEventListener("scroll", updateSlider);
      window.removeEventListener("resize", updateSlider);
    };
  }, [editorView, updateSlider]);

  // Render actual document lines to scale on Retina Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const width = rect.width || 68;
    const height = rect.height || 400;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const lines = content.split("\n");
    const totalLines = lines.length;
    if (totalLines === 0) return;

    // Line height scaling: proportional to document length
    const lineHeight = Math.max(1.6, Math.min(3.2, height / totalLines));
    const isDark = theme === "dark";

    const colorComment = isDark ? "rgba(100, 116, 139, 0.45)" : "rgba(100, 116, 139, 0.55)";
    const colorKeyword = isDark ? "rgba(56, 189, 248, 0.75)" : "rgba(2, 132, 199, 0.75)";
    const colorSpecial = isDark ? "rgba(192, 132, 252, 0.75)" : "rgba(124, 58, 237, 0.75)";
    const colorString = isDark ? "rgba(251, 146, 60, 0.75)" : "rgba(234, 88, 12, 0.75)";
    const colorDefault = isDark ? "rgba(241, 245, 249, 0.28)" : "rgba(15, 23, 42, 0.35)";

    for (let i = 0; i < totalLines; i++) {
      const y = i * lineHeight;
      if (y > height) break;

      const rawLine = lines[i];
      if (!rawLine.trim()) continue;

      const indent = rawLine.search(/\S|$/);
      const startX = Math.min(indent * 1.8 + 4, width - 12);
      const trimmed = rawLine.trim();

      // Pick syntax color based on micro-tokens
      let strokeColor = colorDefault;
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("#") ||
        trimmed.startsWith("/*") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("--")
      ) {
        strokeColor = colorComment;
      } else if (
        trimmed.startsWith("import") ||
        trimmed.startsWith("export") ||
        trimmed.startsWith("from") ||
        trimmed.startsWith("return") ||
        trimmed.startsWith("public") ||
        trimmed.startsWith("private")
      ) {
        strokeColor = colorKeyword;
      } else if (
        trimmed.startsWith("function") ||
        trimmed.startsWith("class") ||
        trimmed.startsWith("const") ||
        trimmed.startsWith("let") ||
        trimmed.startsWith("var")
      ) {
        strokeColor = colorSpecial;
      } else if (trimmed.startsWith('"') || trimmed.startsWith("'") || trimmed.startsWith("`")) {
        strokeColor = colorString;
      }

      const lineWidth = Math.max(
        Math.min(trimmed.length * 0.9, width - startX - 8),
        4
      );

      ctx.fillStyle = strokeColor;
      ctx.beginPath();
      ctx.roundRect(startX, y, lineWidth, Math.max(lineHeight - 0.5, 1.2), 0.5);
      ctx.fill();
    }

    // Draw diagnostic error / warning ticks on minimap margin
    for (const prob of problems) {
      const lineIdx = prob.line - 1;
      const y = lineIdx * lineHeight;
      if (y <= height) {
        ctx.fillStyle = prob.severity === "error" ? "#f43f5e" : "#f59e0b";
        ctx.fillRect(width - 4, y, 4, Math.max(lineHeight + 1, 2.5));
      }
    }
  }, [content, theme, problems]);

  // Click on minimap to jump
  const handleMinimapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editorView || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const fraction = clickY / rect.height;

    const scrollDom = editorView.scrollDOM;
    const targetScrollTop = fraction * (scrollDom.scrollHeight - scrollDom.clientHeight);

    scrollDom.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: "smooth",
    });
  };

  // Drag viewport slider
  const handleSliderMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editorView) return;
    setIsDragging(true);
    dragStartYRef.current = e.clientY;
    dragStartScrollTopRef.current = editorView.scrollDOM.scrollTop;
  };

  useEffect(() => {
    if (!isDragging || !editorView || !containerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - dragStartYRef.current;
      const containerHeight = containerRef.current?.clientHeight || 400;
      const scrollDom = editorView.scrollDOM;
      const maxScroll = scrollDom.scrollHeight - scrollDom.clientHeight;

      const deltaFraction = deltaY / (containerHeight - viewportSlider.height);
      const newScrollTop = dragStartScrollTopRef.current + deltaFraction * maxScroll;

      scrollDom.scrollTop = Math.max(0, Math.min(newScrollTop, maxScroll));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, editorView, viewportSlider.height]);

  return (
    <aside
      className="pro-code-minimap"
      ref={containerRef}
      onClick={handleMinimapClick}
      title="Code Minimap (Click or Drag to Navigate)"
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="minimap-canvas" />

      {/* Draggable Viewport Slider Overlay */}
      <div
        className={`minimap-viewport-slider ${isDragging ? "dragging" : ""}`}
        style={{
          top: `${viewportSlider.top}px`,
          height: `${viewportSlider.height}px`,
        }}
        onMouseDown={handleSliderMouseDown}
      />
    </aside>
  );
};
