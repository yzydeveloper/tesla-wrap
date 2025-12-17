import type { Stage } from 'konva/lib/Stage';

export const exportPng = (stage: Stage | null, filename: string): void => {
  if (!stage) {
    console.error('Stage is not available');
    return;
  }

  // CRITICAL: Export must be exactly 1024x1024 pixels - pixel perfect
  // The Stage is always 1024x1024, and pixelRatio: 1 ensures we export at native size
  // This is pixel-perfect and must match the template exactly
  const dataURL = stage.toDataURL({
    pixelRatio: 1, // Critical: ensures 1:1 pixel mapping, no scaling
    mimeType: 'image/png',
  });

  // Create download link
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataURL;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

