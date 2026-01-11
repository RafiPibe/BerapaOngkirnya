# Berapa Ongkirnya?

SvelteKit + Tailwind app for estimating shipping costs in Indonesia using the
RajaOngkir Komerce API.

## Features
- Origin and destination search with RajaOngkir data.
- Shipping cost calculation with courier/service breakdowns.
- Clean UI with custom branding.

## Requirements
- Node.js + npm
- RajaOngkir Komerce API key

## Environment Variables
Create `.env` in the project root:

```
RAJAONGKIR_KEY=your_key_here
# Optional override:
# RAJAONGKIR_KOMERCE_BASE_URL=https://rajaongkir.komerce.id/api/v1
```

## Development
```
npm install
npm run dev
```

## Build
```
npm run build
npm run preview
```

## API Routes Examples
- `GET /api/rajaongkir/origin?search=bandung&limit=20`
- `GET /api/rajaongkir/destination?search=surabaya&limit=20`
- `POST /api/rajaongkir/cost`

Example cost payload:
```
{
  "origin": { "id": 123 },
  "destination": { "id": 456 },
  "weight": 1000,
  "courier": "jne"
}
```

## Deploy (Vercel)
This repo uses `@sveltejs/adapter-vercel`.

1. Set environment variables in Vercel:
   - `RAJAONGKIR_KEY`
   - `RAJAONGKIR_KOMERCE_BASE_URL` (optional)
2. Build command: `npm run build`
3. Output directory: `.vercel/output`

