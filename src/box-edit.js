const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function calculateBoxEdit(edit, pointer, rect) {
  const dx = ((pointer.clientX - edit.startX) / rect.width) * 100;
  const dy = ((pointer.clientY - edit.startY) / rect.height) * 100;
  const minimumWidth = 7;
  const minimumHeight = 9;
  const initial = edit.box;
  let x = initial.x;
  let y = initial.y;
  let w = initial.w;
  let h = initial.h;

  if (edit.mode === "move") {
    x = clamp(initial.x + dx, 0, 100 - initial.w);
    y = clamp(initial.y + dy, 0, 100 - initial.h);
  } else {
    if (edit.mode.includes("e")) w = clamp(initial.w + dx, minimumWidth, 100 - initial.x);
    if (edit.mode.includes("s")) h = clamp(initial.h + dy, minimumHeight, 100 - initial.y);
    if (edit.mode.includes("w")) { x = clamp(initial.x + dx, 0, initial.x + initial.w - minimumWidth); w = initial.x + initial.w - x; }
    if (edit.mode.includes("n")) { y = clamp(initial.y + dy, 0, initial.y + initial.h - minimumHeight); h = initial.y + initial.h - y; }
  }

  return { x, y, w, h };
}
