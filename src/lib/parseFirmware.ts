import { safeDecode } from "./slug";

export interface FirmwareMeta {
  vendor: string | null;
  version: string | null;
  /** ISO date (YYYY-MM-DD) parsed from the filename, if any. */
  buildDate: string | null;
}

const VENDOR_PREFIXES: Record<string, string> = {
  general: "Dahua (General)",
  dh: "Dahua",
  dahua: "Dahua",
  amcrest: "Amcrest",
  customer: "OEM / Customer",
  lorex: "Lorex",
  flir: "FLIR",
};

function toIsoDate(year: number, month: number, day: number): string | null {
  if (year < 2005 || year > 2035 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateDigits(digits: string): string | null {
  if (digits.length === 8) {
    return toIsoDate(+digits.slice(0, 4), +digits.slice(4, 6), +digits.slice(6, 8));
  }
  if (digits.length === 6) {
    return toIsoDate(2000 + +digits.slice(0, 2), +digits.slice(2, 4), +digits.slice(4, 6));
  }
  return null;
}

function parseVendor(name: string): string | null {
  const prefix = name.split(/[_-]/)[0].toLowerCase();
  if (VENDOR_PREFIXES[prefix]) return VENDOR_PREFIXES[prefix];
  for (const [key, label] of [["amcrest", "Amcrest"], ["lorex", "Lorex"], ["flir", "FLIR"]] as const) {
    if (name.toLowerCase().includes(key)) return label;
  }
  return null;
}

function parseBuildDate(name: string): string | null {
  // Dahua release/test builds: ..._V2.800.0000018.0.R.210707.bin, .R.20170704.bin, .T.180316.bin
  const release = name.match(/\.[RT]\.(\d{8}|\d{6})(?!\d)/);
  if (release) return parseDateDigits(release[1]);
  // Other styles: ..._V5.2.0.1-20150228_10640.rar, D861A8_20201127_00026.bin
  const loose = name.match(/(?:^|[^\d])(20\d{6})(?!\d)/);
  if (loose) return parseDateDigits(loose[1]);
  return null;
}

function parseVersion(name: string): string | null {
  const match = name.match(/[_-]V(\d+(?:\.[0-9A-Za-z]+)+?)(?:\.[RT]\.|[-_]|\.(?:bin|zip|rar|img|tar|gz)$|$)/i);
  return match ? match[1] : null;
}

export function parseFirmwareName(filename: string): FirmwareMeta {
  const name = safeDecode(filename);
  return {
    vendor: parseVendor(name),
    version: parseVersion(name),
    buildDate: parseBuildDate(name),
  };
}
