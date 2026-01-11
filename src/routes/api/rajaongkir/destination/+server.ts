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

  const upstreamUrl = new URL(
    `${RAJAONGKIR_BASE_URL}/destination/domestic-destination`
  );
  url.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.set(key, value);
  });

  try {
    const response = await fetch(upstreamUrl.toString(), {
      headers: { key: RAJAONGKIR_KEY },
    });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reach RajaOngkir service.";
    return jsonMessage(message, 502);
  }
};
