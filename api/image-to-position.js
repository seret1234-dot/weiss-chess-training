import {
  convertImageToPosition,
} from "../server/image-to-position-core.mjs"

function json(body, status, serverTiming = "") {
  const headers = {
    "Cache-Control": "no-store",
  }

  if (serverTiming) {
    headers["Server-Timing"] = serverTiming
  }

  return Response.json(body, {
    status,
    headers,
  })
}

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return json(
        { error: "Method not allowed" },
        405,
      )
    }

    try {
      const form = await request.formData()
      const image = form.get("image")

      if (
        !image ||
        typeof image.arrayBuffer !== "function"
      ) {
        return json(
          { error: "No image was uploaded." },
          400,
        )
      }

      const imageBuffer = Buffer.from(
        await image.arrayBuffer(),
      )

      const result =
        await convertImageToPosition({
          authorization:
            request.headers.get("authorization") || "",
          imageBuffer,
          mimeType:
            image.type || "application/octet-stream",
        })

      return json(
        result.body,
        result.status,
        result.serverTiming,
      )
    } catch (error) {
      console.error(
        "Production Image to Position endpoint failed",
        error,
      )

      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not process image.",
        },
        500,
      )
    }
  },
}
