export async function downloadFile(
  url: string,
  fallbackFilename = "download"
): Promise<void> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Download failed (${res.status}): ${text}`);
  }

  const blob = await res.blob();

  const contentDisposition = res.headers.get("content-disposition") ?? "";
  const match = contentDisposition.match(
    /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
  );
  const filename = match ? match[1].replace(/['"]/g, "") : fallbackFilename;

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}
