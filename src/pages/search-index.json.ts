import type { APIRoute } from "astro";
import { getData } from "@/lib/data";
import { TYPE_DEVICE, TYPE_FIRMWARE, TYPE_MODEL, TYPE_SOC, type IndexEntry } from "@/scripts/search-core";

/**
 * Devices, models and chips are short model numbers (the longest real one is about 35 characters). A longer "name" is
 * scraped page text or several models run together, which would match unrelated queries, so it stays out of the index.
 */
const MAX_NAME = 60;
const isModelNumber = (name: string) => name.length <= MAX_NAME;

/** Compact search index: [type, name, slug, meta]. Loaded lazily by the search box. */
export const GET: APIRoute = async () => {
  const data = await getData();
  const entries: IndexEntry[] = [
    ...[...data.devices.values()].filter((d) => isModelNumber(d.name)).map((d): IndexEntry => [TYPE_DEVICE, d.name, d.slug, d.firmwares.length]),
    ...[...data.models.values()].filter((m) => isModelNumber(m.name)).map((m): IndexEntry => [TYPE_MODEL, m.name, m.slug, m.firmwares.length]),
    ...data.firmwareList.map((fw): IndexEntry => [TYPE_FIRMWARE, fw.displayName, fw.slug, fw.date ?? ""]),
    ...[...data.socs.values()].filter((s) => isModelNumber(s.name)).map((s): IndexEntry => [TYPE_SOC, s.name, s.slug, s.firmwares.length]),
  ];
  return new Response(JSON.stringify(entries), {
    headers: { "Content-Type": "application/json" },
  });
};
