/**
 * File → Print: renders the real PDF pages to images and prints them with the
 * system print dialog. Printing images of the PDF guarantees the paper matches
 * the PDF exactly, in both the desktop app and the browser.
 */
export async function printPdf(bytes: Uint8Array, onProgress?: (page: number, pages: number) => void): Promise<void> {
  const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  lib.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await lib.getDocument({ data: bytes.slice() }).promise;
  const root = document.createElement("div");
  root.id = "print-root";
  const first = await pdf.getPage(1);
  const size = first.getViewport({ scale: 1 });
  const style = document.createElement("style");
  style.textContent = `@page { size: ${size.width}pt ${size.height}pt; margin: 0 } @media print { body > *:not(#print-root) { display: none !important } #print-root { display: block !important } #print-root img { width: 100%; display: block; page-break-after: always; break-after: page } } #print-root { display: none }`;
  for (let number = 1; number <= pdf.numPages; number++) {
    onProgress?.(number, pdf.numPages);
    const page = await pdf.getPage(number);
    const viewport = page.getViewport({ scale: 2 }); // ~144 dpi: crisp text, modest memory
    const canvas = document.createElement("canvas"); canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas }).promise;
    const image = document.createElement("img"); image.src = canvas.toDataURL("image/png"); image.alt = `Page ${number}`;
    root.append(image);
    canvas.width = 0; canvas.height = 0;
  }
  document.head.append(style); document.body.append(root);
  await Promise.all([...root.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)));
  const cleanup = () => { root.remove(); style.remove(); window.removeEventListener("afterprint", cleanup); };
  window.addEventListener("afterprint", cleanup);
  window.print();
  // Some WebViews don't fire afterprint; clean up after the dialog closes.
  setTimeout(cleanup, 60_000);
}
