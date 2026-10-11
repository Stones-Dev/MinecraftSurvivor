/** Pixel-perfect canvas: draw at art resolution, show at an integer zoom, letterbox the rest. */
export interface View {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  zoom: number;
}

export function pickZoom(viewportWidth: number, viewportHeight: number): number {
  return viewportWidth < 1100 || viewportHeight < 620 ? 2 : 3;
}

export function fitCanvas(canvas: HTMLCanvasElement): View {
  const zoom = pickZoom(window.innerWidth, window.innerHeight);
  const width = Math.max(160, Math.floor(window.innerWidth / zoom));
  const height = Math.max(90, Math.floor(window.innerHeight / zoom));
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width * zoom}px`;
  canvas.style.height = `${height * zoom}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  ctx.imageSmoothingEnabled = false;
  return { ctx, width, height, zoom };
}
