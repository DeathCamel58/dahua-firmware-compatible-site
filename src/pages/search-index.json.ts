import type { APIRoute } from "astro";
import { getData } from "@/lib/data";
import { TYPE_AMCREST, TYPE_DEVICE, TYPE_FIRMWARE, type IndexEntry } from "@/scripts/search-core";

/** Compact search index: [type, name, slug, meta]. Loaded lazily by the search box. */
export const GET: APIRoute = async () => {
  const data = await getData();
  const entries: IndexEntry[] = [
    ...[...data.devices.values()].map((d): IndexEntry => [TYPE_DEVICE, d.name, d.slug, d.firmwares.length]),
    ...[...data.amcrestModels.values()].map((m): IndexEntry => [TYPE_AMCREST, m.name, m.slug, m.firmwares.length]),
    ...data.firmwareList.map((fw): IndexEntry => [TYPE_FIRMWARE, fw.displayName, fw.slug, fw.buildDate ?? ""]),
  ];
  return new Response(JSON.stringify(entries), {
    headers: { "Content-Type": "application/json" },
  });
};
