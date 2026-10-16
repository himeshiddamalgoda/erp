import { ApiError } from "./api-error";
export async function downloadPdf(response, fallback = "quotation.pdf") {
  const contentType = response.headers["content-type"] || "";
  if (!contentType.includes("application/pdf")) {
    let payload;
    try {
      payload = JSON.parse(await response.data.text());
    } catch {}
    throw new ApiError({
      status: response.status,
      code: payload?.error?.code || "INVALID_PDF_RESPONSE",
      message:
        payload?.error?.message ||
        "The server did not return a PDF. Please try again.",
      requestId: payload?.error?.requestId,
    });
  }
  const filename =
    /(?:filename="?)([^";]+)/i.exec(
      response.headers["content-disposition"] || "",
    )?.[1] || fallback;
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
