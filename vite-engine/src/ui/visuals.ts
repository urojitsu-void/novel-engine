export function fadeSwap(imgEl: HTMLImageElement, nextSrc: string) {
  if (imgEl.src.endsWith(nextSrc)) return;
  imgEl.style.transition = "opacity 180ms linear";
  imgEl.style.opacity = "0";
  const pre = new Image();
  pre.onload = () => {
    imgEl.src = nextSrc;
    requestAnimationFrame(() => {
      imgEl.style.opacity = "1";
    });
  };
  pre.src = nextSrc;
}
