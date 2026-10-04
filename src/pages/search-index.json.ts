import type { APIRoute } from "astro";
import { getData } from "@/lib/data";
import { TYPE_DEVICE, TYPE_FIRMWARE, TYPE_MODEL, TYPE_SOC, type IndexEntry } from "@/scripts/search-core";

/** Compact search index: [type, name, slug, meta]. Loaded lazily by the search box. */
export const GET: APIRoute = async () => {
  const data = await getData();
  const entries: IndexEntry[] = [
    ...[...data.devices.values()].map((d): IndexEntry => [TYPE_DEVICE, d.name, d.slug, d.firmwares.length]),
    ...[...data.models.values()].map((m): IndexEntry => [TYPE_MODEL, m.name, m.slug, m.firmwares.length]),
    ...data.firmwareList.map((fw): IndexEntry => [TYPE_FIRMWARE, fw.displayName, fw.slug, fw.date ?? ""]),
    ...[...data.socs.values()].map((s): IndexEntry => [TYPE_SOC, s.name, s.slug, s.firmwares.length]),
  ];
  return new Response(JSON.stringify(entries), {
    headers: { "Content-Type": "application/json" },
  });
};
