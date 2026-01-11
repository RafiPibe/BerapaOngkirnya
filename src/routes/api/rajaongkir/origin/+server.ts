import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";

const RAJAONGKIR_BASE_URL =
  env.RAJAONGKIR_KOMERCE_BASE_URL ??
  env.VITE_RAJAONGKIR_KOMERCE_BASE_URL ??
  "https://rajaongkir.komerce.id/api/v1";
const RAJAONGKIR_KEY =
  env.RAJAONGKIR_KEY ?? env.VITE_RAJAONGKIR_KEY ?? env.VITE_RAJAONGKIR_API_KEY ?? "";

const jsonMessage = (message: string, status: number) =>
  new Response(JSON.stringify({ message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: RequestHandler = async ({ url }) => {
  if (!RAJAONGKIR_KEY) {
    return jsonMessage("Missing RajaOngkir API key.", 500);
  }

  const buildUpstreamUrl = (path: string) => {
    const upstreamUrl = new URL(`${RAJAONGKIR_BASE_URL}${path}`);
    url.searchParams.forEach((value, key) => {
      upstreamUrl.searchParams.set(key, value);
    });
    return upstreamUrl;
  };

  try {
    const primaryResponse = await fetch(
      buildUpstreamUrl("/origin/domestic-origin").toString(),
      { headers: { key: RAJAONGKIR_KEY } }
    );
    const primaryBody = await primaryResponse.text();
    if (primaryResponse.ok) {
      return new Response(primaryBody, {
        status: primaryResponse.status,
        headers: {
          "Content-Type":
            primaryResponse.headers.get("content-type") ?? "application/json",
        },
      });
    }

    const fallbackResponse = await fetch(
      buildUpstreamUrl("/destination/domestic-destination").toString(),
      { headers: { key: RAJAONGKIR_KEY } }
    );
    const fallbackBody = await fallbackResponse.text();
    if (fallbackResponse.ok) {
      return new Response(fallbackBody, {
        status: fallbackResponse.status,
        headers: {
          "Content-Type":
            fallbackResponse.headers.get("content-type") ?? "application/json",
        },
      });
    }

    return new Response(fallbackBody || primaryBody, {
      status: fallbackResponse.status || primaryResponse.status,
      headers: {
        "Content-Type":
          fallbackResponse.headers.get("content-type") ??
          primaryResponse.headers.get("content-type") ??
          "application/json",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reach RajaOngkir service.";
    return jsonMessage(message, 502);
  }
};
