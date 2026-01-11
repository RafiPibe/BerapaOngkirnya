<svelte:head>
  <title>Berapa Ongkirnya?</title>
  <meta
    name="description"
    content="Estimasi ongkir instan dengan RajaOngkir Komerce. Cari asal, tujuan, berat, lalu pilih layanan terbaik."
  />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<script lang="ts">
  import favicon from "$lib/assets/favicon.svg";

  type DestinationOption = {
    id: string;
    label: string;
  };

  type ShippingOption = {
    id: string;
    label: string;
    cost: number;
    etd: string;
    courier: string;
    courierName: string;
    service: string;
    description: string;
  };

  const COURIER_OPTIONS = [
    { id: "jne", label: "JNE" },
    { id: "pos", label: "POS Indonesia" },
    { id: "tiki", label: "TIKI" }
  ] as const;

  const formatIdr = (value: number) => `IDR ${new Intl.NumberFormat("id-ID").format(value)}`;

  const formatEtd = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const lower = trimmed.toLowerCase();
    if (lower.includes("day") || lower.includes("hari")) return trimmed;
    return `${trimmed} hari`;
  };

  const toArray = <T,>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[];
    if (value && typeof value === "object") return [value as T];
    return [];
  };

  const toStringValue = (value: unknown) => {
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    return "";
  };

  const buildDestinationLabel = (record: Record<string, unknown>) => {
    const parts = [
      toStringValue(record.subdistrict_name),
      toStringValue(record.district_name),
      toStringValue(record.city_name),
      toStringValue(record.province_name)
    ].filter(Boolean);
    const postal = toStringValue(record.postal_code);
    if (postal) {
      parts.push(postal);
    }
    if (parts.length > 0) {
      return parts.join(", ");
    }
    return (
      toStringValue(record.label) ||
      toStringValue(record.name) ||
      toStringValue(record.subdistrict) ||
      toStringValue(record.city) ||
      toStringValue(record.province)
    );
  };

  const buildDestinationOption = (record: Record<string, unknown>): DestinationOption | null => {
    const id =
      toStringValue(record.id) ||
      toStringValue(record.destination_id) ||
      toStringValue(record.subdistrict_id) ||
      toStringValue(record.district_id) ||
      toStringValue(record.city_id);
    const label = buildDestinationLabel(record);
    if (!id || !label) return null;
    return { id, label };
  };

  const extractDestinationOptions = (payload: unknown) => {
    if (!payload || typeof payload !== "object") return [] as DestinationOption[];
    const record = payload as Record<string, unknown>;
    const data = record.data;
    const results =
      (record.rajaongkir as Record<string, unknown> | undefined)?.results ??
      record.results ??
      data;
    const dataRecord = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    const items =
      (Array.isArray(results) ? results : null) ??
      (Array.isArray(dataRecord?.results) ? dataRecord?.results : null) ??
      (Array.isArray(dataRecord?.data) ? dataRecord?.data : null) ??
      [];
    return items
      .map((item) => buildDestinationOption(item as Record<string, unknown>))
      .filter(Boolean) as DestinationOption[];
  };

  const extractCostResults = (payload: unknown) => {
    if (!payload || typeof payload !== "object") return [] as Record<string, unknown>[];
    const record = payload as Record<string, unknown>;
    const data = record.data;
    const results =
      (record.rajaongkir as Record<string, unknown> | undefined)?.results ??
      record.results ??
      (data && typeof data === "object" ? (data as Record<string, unknown>).results : null) ??
      data;
    if (Array.isArray(results)) {
      return results as Record<string, unknown>[];
    }
    if (Array.isArray(data)) {
      return data as Record<string, unknown>[];
    }
    return [];
  };

  let originQuery = $state("");
  let destinationQuery = $state("");
  let originOptions = $state<DestinationOption[]>([]);
  let destinationOptions = $state<DestinationOption[]>([]);
  let selectedOrigin = $state("");
  let selectedDestination = $state("");
  let courier = $state(COURIER_OPTIONS[0]?.id ?? "jne");
  let weight = $state("1000");

  let originLoading = $state(false);
  let destinationLoading = $state(false);
  let originError = $state("");
  let destinationError = $state("");

  let shippingOptions = $state<ShippingOption[]>([]);
  let selectedServiceId = $state("");
  let shippingEstimate = $state<ShippingOption | null>(null);
  let shippingLoading = $state(false);
  let shippingError = $state("");

  const resetShipping = () => {
    shippingOptions = [];
    shippingEstimate = null;
    selectedServiceId = "";
    shippingError = "";
  };

  const clearOriginResults = () => {
    originError = "";
    originOptions = [];
    selectedOrigin = "";
    resetShipping();
  };

  const clearDestinationResults = () => {
    destinationError = "";
    destinationOptions = [];
    selectedDestination = "";
    resetShipping();
  };

  const handleOriginKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (originLoading || !originQuery.trim()) return;
    void handleOriginSearch();
  };

  const handleDestinationKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (destinationLoading || !destinationQuery.trim()) return;
    void handleDestinationSearch();
  };

  const handleOriginSearch = async () => {
    const query = originQuery.trim();
    if (!query) {
      originError = "Masukkan asal dulu.";
      return;
    }
    originLoading = true;
    originError = "";
    originOptions = [];
    selectedOrigin = "";
    resetShipping();

    try {
      const response = await fetch(
        `/api/rajaongkir/origin?search=${encodeURIComponent(query)}&limit=20`
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.message ||
            (payload?.meta as Record<string, unknown> | undefined)?.message ||
            "Gagal mencari asal."
        );
      }
      const options = extractDestinationOptions(payload);
      if (options.length === 0) {
        throw new Error("Asal tidak ditemukan.");
      }
      originOptions = options;
    } catch (error) {
      originOptions = [];
      selectedOrigin = "";
      originError = error instanceof Error ? error.message : "Gagal mencari asal.";
    } finally {
      originLoading = false;
    }
  };

  const handleDestinationSearch = async () => {
    const query = destinationQuery.trim();
    if (!query) {
      destinationError = "Masukkan tujuan dulu.";
      return;
    }
    destinationLoading = true;
    destinationError = "";
    destinationOptions = [];
    selectedDestination = "";
    resetShipping();

    try {
      const response = await fetch(
        `/api/rajaongkir/destination?search=${encodeURIComponent(query)}&limit=20`
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.message ||
            (payload?.meta as Record<string, unknown> | undefined)?.message ||
            "Gagal mencari tujuan."
        );
      }
      const options = extractDestinationOptions(payload);
      if (options.length === 0) {
        throw new Error("Tujuan tidak ditemukan.");
      }
      destinationOptions = options;
    } catch (error) {
      destinationOptions = [];
      selectedDestination = "";
      destinationError = error instanceof Error ? error.message : "Gagal mencari tujuan.";
    } finally {
      destinationLoading = false;
    }
  };

  const handleOriginSelect = () => {
    originError = "";
    resetShipping();
  };

  const handleDestinationSelect = () => {
    destinationError = "";
    resetShipping();
  };

  const handleCourierChange = () => {
    resetShipping();
  };

  const handleWeightInput = () => {
    resetShipping();
  };

  const selectService = (option: ShippingOption) => {
    selectedServiceId = option.id;
    shippingEstimate = option;
  };

  const handleCalculateShipping = async () => {
    if (!selectedOrigin) {
      shippingError = "Pilih asal dulu.";
      return;
    }
    if (!selectedDestination) {
      shippingError = "Pilih tujuan dulu.";
      return;
    }
    const originId = Number(selectedOrigin);
    if (!Number.isFinite(originId) || originId <= 0) {
      shippingError = "ID asal tidak valid.";
      return;
    }
    const destinationId = Number(selectedDestination);
    if (!Number.isFinite(destinationId) || destinationId <= 0) {
      shippingError = "ID tujuan tidak valid.";
      return;
    }
    if (!courier) {
      shippingError = "Pilih kurir.";
      return;
    }
    const weightValue = Number(weight);
    if (!Number.isFinite(weightValue) || weightValue <= 0) {
      shippingError = "Masukkan berat paket.";
      return;
    }

    shippingLoading = true;
    shippingError = "";
    shippingOptions = [];
    shippingEstimate = null;
    selectedServiceId = "";

    try {
      const requestPayload = {
        origin: { id: originId },
        destination: { id: destinationId },
        weight: weightValue,
        courier
      };
      const response = await fetch("/api/rajaongkir/cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.rajaongkir?.status?.description ||
            payload?.message ||
            (payload?.meta as Record<string, unknown> | undefined)?.message ||
            "Gagal menghitung ongkir."
        );
      }
      const results = extractCostResults(payload);
      const options: ShippingOption[] = [];
      results.forEach((result, resultIndex) => {
        const directCostRaw =
          (result.cost as number | string | undefined) ??
          (result.price as number | string | undefined) ??
          (result.amount as number | string | undefined);
        const directCost =
          typeof directCostRaw === "number" ? directCostRaw : Number(directCostRaw);
        if (Number.isFinite(directCost)) {
          const courierCode =
            toStringValue(result.code) ||
            toStringValue(result.courier) ||
            toStringValue(result.courier_code) ||
            courier;
          const courierName =
            toStringValue(result.name) || toStringValue(result.courier_name) || courierCode.toUpperCase();
          const serviceName =
            toStringValue(result.service) ||
            toStringValue(result.name) ||
            toStringValue(result.code) ||
            "Service";
          const description = toStringValue(result.description);
          const etdRaw = result.etd ?? result.duration ?? result.estimate;
          const etd = typeof etdRaw === "string" ? etdRaw : etdRaw ? String(etdRaw) : "";
          const labelParts = [courierName, serviceName].filter(Boolean);
          const etdLabel = formatEtd(etd);
          const label = `${labelParts.join(" · ")} - ${formatIdr(directCost)}${
            etdLabel ? ` (${etdLabel})` : ""
          }`;
          options.push({
            id: `${courierCode}-${serviceName}-${resultIndex}`,
            label,
            cost: directCost,
            etd,
            courier: courierCode,
            courierName,
            service: serviceName,
            description
          });
          return;
        }
        const courierCode =
          toStringValue(result.code) ||
          toStringValue(result.courier) ||
          toStringValue(result.courier_code) ||
          courier;
        const courierName =
          toStringValue(result.name) || toStringValue(result.courier_name) || courierCode.toUpperCase();
        const services = toArray<Record<string, unknown>>(
          (result.costs ?? result.services ?? result.service ?? result.options) as unknown
        );
        services.forEach((service, serviceIndex) => {
          if (!service || typeof service !== "object") return;
          const serviceRecord = service as Record<string, unknown>;
          const serviceName =
            toStringValue(serviceRecord.service) ||
            toStringValue(serviceRecord.name) ||
            toStringValue(serviceRecord.code);
          const description = toStringValue(serviceRecord.description);
          const resolvedService = serviceName || description || "Service";
          const costEntries = toArray<Record<string, unknown>>(
            (serviceRecord.cost ??
              serviceRecord.costs ??
              serviceRecord.price ??
              serviceRecord.prices) as unknown
          );
          const costRecord = (costEntries[0] as Record<string, unknown> | undefined) ?? serviceRecord;
          const valueRaw = costRecord.value ?? costRecord.cost ?? costRecord.price ?? costRecord.amount;
          const value = typeof valueRaw === "number" ? valueRaw : Number(valueRaw);
          if (!Number.isFinite(value)) return;
          const etdRaw =
            costRecord.etd ?? costRecord.etd_days ?? costRecord.duration ?? costRecord.estimate;
          const etd = typeof etdRaw === "string" ? etdRaw : etdRaw ? String(etdRaw) : "";
          const labelParts = [courierName, resolvedService].filter(Boolean);
          const etdLabel = formatEtd(etd);
          const label = `${labelParts.join(" · ")} - ${formatIdr(value)}${
            etdLabel ? ` (${etdLabel})` : ""
          }`;
          options.push({
            id: `${courierCode}-${resolvedService}-${resultIndex}-${serviceIndex}`,
            label,
            cost: value,
            etd,
            courier: courierCode,
            courierName,
            service: resolvedService,
            description
          });
        });
      });

      if (options.length === 0) {
        throw new Error("Layanan pengiriman tidak tersedia.");
      }

      options.sort((a, b) => a.cost - b.cost);
      shippingOptions = options;
      shippingEstimate = options[0];
      selectedServiceId = options[0].id;
    } catch (error) {
      shippingOptions = [];
      shippingEstimate = null;
      selectedServiceId = "";
      shippingError = error instanceof Error ? error.message : "Gagal menghitung ongkir.";
    } finally {
      shippingLoading = false;
    }
  };
</script>

<main class="page min-h-screen text-[color:var(--ink)]">
  <div class="relative overflow-hidden">
    <div class="pointer-events-none absolute inset-0">
      <div class="orb orb-one"></div>
      <div class="orb orb-two"></div>
      <div class="orb orb-three"></div>
    </div>

    <div class="relative mx-auto flex max-w-6xl flex-col gap-10 px-6 pb-16 pt-16 lg:pb-20 lg:pt-20">
      <header class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <a
            href="https://pibe-porto.vercel.app"
            class="flex items-center gap-3"
            aria-label="Kunjungi Pibe Porto"
            target="_blank"
            rel="noreferrer"
          >
            <img
              src={favicon}
              alt="Berapa Ongkirnya logo"
              class="h-11 w-11 rounded-2xl border border-[color:var(--line)] bg-white/80 p-2"
            />
            <div class="leading-tight">
              <p class="text-xs uppercase tracking-[0.35em] text-[color:var(--cacao)]">
                Berapa Ongkirnya
              </p>
              <p class="text-[11px] text-[color:var(--muted)]">Cek Ongkir made by Pibe</p>
            </div>
          </a>
        </div>
        <h1
          class="text-4xl font-semibold text-[color:var(--ink)] sm:text-5xl lg:text-6xl"
          style="font-family: 'Fraunces', 'Times New Roman', serif;"
        >
          Berapa Ongkirnya?
        </h1>
        <p class="max-w-2xl text-base text-[color:var(--cacao)] sm:text-lg">
          Masukkan asal, tujuan, dan berat paket untuk melihat estimasi ongkir tercepat.
          Desainnya ringan, datanya serius.
        </p>
        <div class="flex flex-wrap gap-2 text-xs uppercase tracking-[0.25em] text-[color:var(--ink)]">
          <span class="chip">Cari kota dan distrik</span>
          <span class="chip">Pilih kurir favorit</span>
          <span class="chip">Hasil instan</span>
        </div>
      </header>

      <section class="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div class="glass card-shadow rounded-3xl border border-[color:var(--line)] p-6 sm:p-8">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-[color:var(--cacao)]">Form estimasi</p>
              <p class="mt-2 text-2xl font-semibold text-[color:var(--ink)]">
                Detail pengiriman
              </p>
            </div>
            <div class="tag">Indonesia Only</div>
          </div>

          <div class="mt-6 grid gap-6">
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <label class="text-sm font-medium text-[color:var(--ink)]" for="origin-query">
                  Asal
                </label>
                <span class="text-xs text-[color:var(--muted)]">Cari kota/kabupaten</span>
              </div>
              <div class="flex flex-wrap gap-3">
                <input
                  class="flex-1 rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 text-sm text-[color:var(--ink)] shadow-sm outline-none transition focus:border-[color:var(--accent)]"
                  type="text"
                  id="origin-query"
                  placeholder="Contoh: Bandung"
                  bind:value={originQuery}
                  oninput={clearOriginResults}
                  onkeydown={handleOriginKeydown}
                />
                <button
                  class="rounded-2xl border border-[color:var(--ink)] px-5 py-3 text-xs uppercase tracking-[0.3em] text-[color:var(--ink)] transition hover:-translate-y-0.5 hover:bg-[color:var(--ink)] hover:text-white disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                  type="button"
                  onclick={handleOriginSearch}
                  disabled={originLoading || !originQuery.trim()}
                >
                  {originLoading ? "Mencari..." : "Cari"}
                </button>
              </div>
              <div>
                <select
                  class="w-full rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 text-sm text-[color:var(--ink)] outline-none disabled:cursor-not-allowed disabled:text-[color:var(--muted)]"
                  bind:value={selectedOrigin}
                  onchange={handleOriginSelect}
                  disabled={originOptions.length === 0}
                >
                  <option value="">
                    {originOptions.length > 0 ? "Pilih asal" : "Cari asal dulu"}
                  </option>
                  {#each originOptions as option}
                    <option value={option.id}>{option.label}</option>
                  {/each}
                </select>
                {#if originError}
                  <p class="mt-2 text-xs text-[color:var(--danger)]">{originError}</p>
                {/if}
              </div>
            </div>

            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <label class="text-sm font-medium text-[color:var(--ink)]" for="destination-query">
                  Tujuan
                </label>
                <span class="text-xs text-[color:var(--muted)]">Cari kecamatan/zip</span>
              </div>
              <div class="flex flex-wrap gap-3">
                <input
                  class="flex-1 rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 text-sm text-[color:var(--ink)] shadow-sm outline-none transition focus:border-[color:var(--accent)]"
                  type="text"
                  id="destination-query"
                  placeholder="Contoh: Denpasar"
                  bind:value={destinationQuery}
                  oninput={clearDestinationResults}
                  onkeydown={handleDestinationKeydown}
                />
                <button
                  class="rounded-2xl border border-[color:var(--ink)] px-5 py-3 text-xs uppercase tracking-[0.3em] text-[color:var(--ink)] transition hover:-translate-y-0.5 hover:bg-[color:var(--ink)] hover:text-white disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                  type="button"
                  onclick={handleDestinationSearch}
                  disabled={destinationLoading || !destinationQuery.trim()}
                >
                  {destinationLoading ? "Mencari..." : "Cari"}
                </button>
              </div>
              <div>
                <select
                  class="w-full rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 text-sm text-[color:var(--ink)] outline-none disabled:cursor-not-allowed disabled:text-[color:var(--muted)]"
                  bind:value={selectedDestination}
                  onchange={handleDestinationSelect}
                  disabled={destinationOptions.length === 0}
                >
                  <option value="">
                    {destinationOptions.length > 0 ? "Pilih tujuan" : "Cari tujuan dulu"}
                  </option>
                  {#each destinationOptions as option}
                    <option value={option.id}>{option.label}</option>
                  {/each}
                </select>
                {#if destinationError}
                  <p class="mt-2 text-xs text-[color:var(--danger)]">{destinationError}</p>
                {/if}
              </div>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <label class="block space-y-2 text-sm text-[color:var(--ink)]">
                <span>Kurir</span>
                <select
                  class="w-full rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 text-sm text-[color:var(--ink)] outline-none"
                  bind:value={courier}
                  onchange={handleCourierChange}
                >
                  {#each COURIER_OPTIONS as option}
                    <option value={option.id}>{option.label}</option>
                  {/each}
                </select>
              </label>

              <label class="block space-y-2 text-sm text-[color:var(--ink)]">
                <span>Berat (gram)</span>
                <input
                  class="w-full rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 text-sm text-[color:var(--ink)] outline-none"
                  type="number"
                  min="1"
                  step="1"
                  bind:value={weight}
                  oninput={handleWeightInput}
                />
              </label>
            </div>

            <div class="space-y-3">
              <button
                class="w-full rounded-2xl bg-[color:var(--ink)] px-5 py-4 text-xs uppercase tracking-[0.35em] text-white shadow-[0_20px_40px_rgba(37,30,25,0.25)] transition hover:-translate-y-0.5 hover:bg-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                type="button"
                onclick={handleCalculateShipping}
                disabled={
                  shippingLoading ||
                  originLoading ||
                  destinationLoading ||
                  !selectedOrigin ||
                  !selectedDestination ||
                  !courier ||
                  !weight
                }
              >
                {shippingLoading ? "Menghitung..." : "Hitung ongkir"}
              </button>
              {#if shippingError}
                <p class="text-xs text-[color:var(--danger)]">{shippingError}</p>
              {/if}
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="glass card-shadow rounded-3xl border border-[color:var(--line)] p-6 sm:p-7">
            <div class="flex items-center justify-between">
              <p class="text-xs uppercase tracking-[0.3em] text-[color:var(--cacao)]">
                Hasil estimasi
              </p>
              <span class="text-[11px] text-[color:var(--muted)]">Update realtime</span>
            </div>

            {#if shippingEstimate}
              <div class="mt-6 rounded-2xl border border-[color:var(--line)] bg-white/90 p-4">
                <p class="text-xs uppercase tracking-[0.3em] text-[color:var(--cacao)]">Terpilih</p>
                <p class="mt-2 text-lg font-semibold text-[color:var(--ink)]">
                  {shippingEstimate.courierName} {shippingEstimate.service}
                </p>
                <p class="mt-1 text-sm text-[color:var(--muted)]">
                  {formatIdr(shippingEstimate.cost)}
                  {shippingEstimate.etd ? ` · ${formatEtd(shippingEstimate.etd)}` : ""}
                </p>
              </div>
            {:else}
              <div class="mt-6 rounded-2xl border border-dashed border-[color:var(--line)] bg-white/70 p-4">
                <p class="text-sm text-[color:var(--muted)]">
                  Pilih asal, tujuan, lalu klik “Hitung ongkir” untuk melihat estimasi.
                </p>
              </div>
            {/if}

            {#if shippingOptions.length > 0}
              <div class="mt-6 space-y-3">
                <p class="text-xs uppercase tracking-[0.3em] text-[color:var(--cacao)]">
                  Pilih layanan
                </p>
                {#each shippingOptions as option}
                  <button
                    class={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      option.id === selectedServiceId
                        ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]"
                        : "border-[color:var(--line)] bg-white/80 hover:-translate-y-0.5"
                    }`}
                    type="button"
                    onclick={() => selectService(option)}
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <p class="font-medium text-[color:var(--ink)]">
                          {option.courierName} {option.service}
                        </p>
                        <p class="mt-1 text-xs text-[color:var(--muted)]">
                          {option.description || (option.etd ? `Estimasi ${formatEtd(option.etd)}` : "Layanan standar")}
                        </p>
                      </div>
                      <span class="text-sm font-semibold text-[color:var(--ink)]">
                        {formatIdr(option.cost)}
                      </span>
                    </div>
                  </button>
                {/each}
              </div>
            {/if}
          </div>

          <div class="glass rounded-3xl border border-[color:var(--line)] p-6 text-sm text-[color:var(--cacao)]">
            <p class="text-xs uppercase tracking-[0.3em] text-[color:var(--cacao)]">Tips cepat</p>
            <ul class="mt-3 space-y-2">
              <li>Gunakan nama kota lengkap untuk hasil terbaik.</li>
              <li>Berat default 1000 gram, ubah sesuai paketmu.</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: "Space Grotesk", "Trebuchet MS", sans-serif;
    background: #f6f0e6;
  }

  .page {
    --ink: #231b16;
    --accent: #2f5f4b;
    --accent-soft: #dbe9e1;
    --cacao: #5f4c42;
    --muted: #7f6f64;
    --line: rgba(94, 74, 63, 0.25);
    --danger: #b4553f;
    min-height: 100vh;
    background:
      radial-gradient(900px 380px at 8% 0%, rgba(195, 220, 210, 0.7), transparent 60%),
      radial-gradient(900px 360px at 92% -5%, rgba(244, 206, 170, 0.7), transparent 55%),
      linear-gradient(180deg, #fdf8f1 0%, #f2e7d8 100%);
  }

  .glass {
    background: rgba(255, 255, 255, 0.78);
    backdrop-filter: blur(16px);
  }

  .card-shadow {
    box-shadow: 0 25px 70px rgba(50, 38, 32, 0.18);
  }

  .badge {
    border-radius: 999px;
    border: 1px solid rgba(47, 95, 75, 0.3);
    padding: 4px 12px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.3em;
    color: #2f5f4b;
    background: rgba(47, 95, 75, 0.1);
  }

  .chip {
    border-radius: 999px;
    border: 1px solid rgba(35, 27, 22, 0.18);
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.6);
  }

  .tag {
    border-radius: 999px;
    border: 1px solid rgba(94, 74, 63, 0.3);
    padding: 6px 14px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.28em;
    color: #5f4c42;
    background: rgba(255, 255, 255, 0.7);
  }

  .orb {
    position: absolute;
    border-radius: 999px;
    filter: blur(0px);
    opacity: 0.7;
    animation: float 16s ease-in-out infinite;
  }

  .orb-one {
    width: 320px;
    height: 320px;
    background: radial-gradient(circle at 30% 30%, #f1d6b9, rgba(241, 214, 185, 0));
    top: -120px;
    left: -80px;
  }

  .orb-two {
    width: 260px;
    height: 260px;
    background: radial-gradient(circle at 30% 30%, #cbe1d3, rgba(203, 225, 211, 0));
    top: 260px;
    right: -80px;
    animation-delay: -4s;
  }

  .orb-three {
    width: 220px;
    height: 220px;
    background: radial-gradient(circle at 30% 30%, #f4cfa7, rgba(244, 207, 167, 0));
    bottom: -80px;
    left: 35%;
    animation-delay: -8s;
  }

  @keyframes float {
    0%,
    100% {
      transform: translateY(0px);
    }
    50% {
      transform: translateY(18px);
    }
  }
</style>
