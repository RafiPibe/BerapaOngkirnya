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

export const POST: RequestHandler = async ({ request }) => {
  if (!RAJAONGKIR_KEY) {
    return jsonMessage("Missing RajaOngkir API key.", 500);
  }

  const body = await request.text();
  if (!body.trim()) {
    return jsonMessage("Missing shipping cost payload.", 400);
  }

  let incomingPayload: Record<string, unknown> | null = null;
  try {
    incomingPayload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    incomingPayload = null;
  }

  const resolveId = (value: unknown) => {
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const nestedId = record.id ?? record.destination_id ?? record.origin_id;
      if (nestedId !== undefined && nestedId !== null) {
        const numeric = Number(nestedId);
        return Number.isFinite(numeric) ? numeric : String(nestedId);
      }
      return null;
    }
    if (value === undefined || value === null) return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : String(value);
  };

  const originId = resolveId(
    incomingPayload?.origin ?? incomingPayload?.origin_id ?? incomingPayload?.originId
  );
  const destinationId = resolveId(
    incomingPayload?.destination ??
      incomingPayload?.destination_id ??
      incomingPayload?.destinationId
  );
  const weightValue =
    incomingPayload?.weight ?? incomingPayload?.weight_gram ?? incomingPayload?.weightGram;
  const weight = typeof weightValue === "number" ? weightValue : Number(weightValue);
  const courier =
    (incomingPayload?.courier as string | undefined) ||
    (incomingPayload?.courier_code as string | undefined) ||
    (incomingPayload?.courierCode as string | undefined);

  if (!originId || !destinationId || !Number.isFinite(weight) || weight <= 0 || !courier) {
    return jsonMessage(
      "Missing origin, destination, weight, or courier in shipping cost payload.",
      400
    );
  }

  const buildPayloadVariants = () => {
    const base = { weight, courier };
    return [
      {
        ...base,
        origin: { id: originId },
        destination: { id: destinationId },
      },
      {
        ...base,
        origin: originId,
        destination: destinationId,
      },
      {
        ...base,
        origin_id: originId,
        destination_id: destinationId,
      },
      {
        ...base,
        originId,
        destinationId,
      },
      {
        data: {
          ...base,
          origin: originId,
          destination: destinationId,
        },
      },
      {
        data: {
          ...base,
          origin_id: originId,
          destination_id: destinationId,
        },
      },
      {
        data: {
          ...base,
          origin: { id: originId },
          destination: { id: destinationId },
        },
      },
    ];
  };

  const sendPayload = async (payload: Record<string, unknown>) => {
    const response = await fetch(`${RAJAONGKIR_BASE_URL}/calculate/domestic-cost`, {
      method: "POST",
      headers: {
        key: RAJAONGKIR_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const responseBody = await response.text();
    return { response, responseBody };
  };

  const sendFormPayload = async () => {
    const params = new URLSearchParams();
    params.set("origin", String(originId));
    params.set("destination", String(destinationId));
    params.set("weight", String(weight));
    params.set("courier", String(courier));
    const response = await fetch(`${RAJAONGKIR_BASE_URL}/calculate/domestic-cost`, {
      method: "POST",
      headers: {
        key: RAJAONGKIR_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const responseBody = await response.text();
    return { response, responseBody };
  };

  try {
    const variants = buildPayloadVariants();
    let lastResponse: Response | null = null;
    let lastBody = "";

    const formAttempt = await sendFormPayload();
    lastResponse = formAttempt.response;
    lastBody = formAttempt.responseBody;
    if (formAttempt.response.ok) {
      return new Response(formAttempt.responseBody, {
        status: formAttempt.response.status,
        headers: {
          "Content-Type":
            formAttempt.response.headers.get("content-type") ?? "application/json",
        },
      });
    }

    for (const payload of variants) {
      const attempt = await sendPayload(payload);
      lastResponse = attempt.response;
      lastBody = attempt.responseBody;
      if (attempt.response.ok) {
        return new Response(attempt.responseBody, {
          status: attempt.response.status,
          headers: {
            "Content-Type":
              attempt.response.headers.get("content-type") ?? "application/json",
          },
        });
      }
      if (
        !attempt.responseBody.includes("CalculateRequestV2.Origin") &&
        !attempt.responseBody.includes("CalculateRequestV2.Destination")
      ) {
        break;
      }
    }

    return new Response(lastBody, {
      status: lastResponse?.status ?? 400,
      headers: {
        "Content-Type": lastResponse?.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reach RajaOngkir service.";
    return jsonMessage(message, 502);
  }
};
