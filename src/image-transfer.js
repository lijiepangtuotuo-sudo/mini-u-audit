const supportedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const supportedExtensions = /\.(png|jpe?g|webp)$/i;

export function getSupportedImageFile(files) {
  return Array.from(files ?? []).find((file) => supportedTypes.has(file.type) || supportedExtensions.test(file.name ?? "")) ?? null;
}

export function isOutsideStage(point, rect) {
  if (!rect || !Number.isFinite(point?.clientX) || !Number.isFinite(point?.clientY)) return false;
  return point.clientX < rect.left || point.clientX > rect.right || point.clientY < rect.top || point.clientY > rect.bottom;
}
