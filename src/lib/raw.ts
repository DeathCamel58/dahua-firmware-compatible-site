/**
 * Reading the pipeline's JSON. Both the current format (see the data repo's docs/FIRMWARE_DATA.md)
 * and the original one (camera_name/notes/url only, and plain ID lists in firmware_compatible.json)
 * are normalised into the same shape, so the rest of the site doesn't care which one it got.
 */
import { safeDecode } from "./slug";

export type Platform = "dahua" | "hikvision" | "unknown";
export type AnalysisStatus = "ok" | "no_ids" | "extract_failed" | "not_dahua" | "duplicate" | "pending";
export type UrlStatus = "ok" | "dead" | "error" | "unchecked";
/** vendor: the vendor's own download page; mirror: a file server holding copies; archive: a Wayback Machine capture. */
export type ListingKind = "vendor" | "mirror" | "archive";

export interface Hardware {
  /** Single devices, e.g. IPC-HFW1230S1-A-S6. */
  models: string[];
  /** Board families with placeholders, e.g. HCVR5x04-S2, NVR4X-4KS2/L, IPC-HX3XXX. */
  boards: string[];
  /** Raw 16-hex-digit hardware IDs: they identify a board but aren't searchable names. */
  hwids: string[];
  /** Vendor tokens and leftovers that aren't models (DAHUA, Group, …). */
  ignored: string[];
}

export interface RawListing {
  vendor: string | null;
  source: string;
  camera_name: string[];
  series: string[];
  notes: string[];
  url: string | null;
  firmware_version: string | null;
  release_date: string | null;
  changelog: string | null;
  first_seen: string | null;
  last_seen: string | null;
  latest: boolean | null;
  url_status: UrlStatus | null;
  /** Reconstructed from old data rather than seen on a vendor page. */
  inferred: boolean;
  kind: ListingKind | null;
  /** Archive listings only: where the file was originally published, and when it was captured. */
  original_url: string | null;
  archived_at: string | null;
}

export interface RawEntry {
  filename: string;
  camera_name: string[];
  series: string[];
  notes: string[];
  url: string | null;
  vendors: string[];
  listings: RawListing[];
  /** false: a vendor lists it, but there's no file to get (e.g. links that need a login). */
  downloadable: boolean;
  listing_only_reason: string | null;
  firmware_version: string | null;
  release_date: string | null;
  changelog: string | null;
  size: number | null;
  md5: string | null;
  sha256: string | null;
  platform: Platform | null;
  integrity: { status: "ok" | "truncated" | "unverified"; reason: string | null; vendorCopyTruncated: boolean } | null;
  aliases: string[];
  duplicate_of: string | null;
  archive_url: string | null;
  archive_item: string | null;
  analysis: {
    status: AnalysisStatus;
    hardware: Hardware;
    /** IDs were recovered from the intact start of a truncated file. */
    truncated: boolean;
    error: string | null;
    /** When it was analysed (YYYY-MM-DD), if known. */
    processedAt: string | null;
  };
}

// ---------------------------------------------------------------------------------------------
// Small helpers

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

export function validUrl(value: unknown): string | null {
  const url = str(value);
  return url && /^https?:\/\//i.test(url) ? url : null;
}

const list = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.map((v) => (typeof v === "string" ? v.trim() : "")).filter((v) => v && v !== "N/A"))]
    : [];

const isoDate = (value: unknown): string | null => {
  const date = str(value);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
};

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Which vendor publishes a download, judged by where it's hosted. Only used for old-format data. */
export function vendorFromUrl(url: string | null): string | null {
  const host = url ? hostOf(url) : null;
  if (!host || !url) return null;
  if (/amcrest/i.test(url) || host === "sup-files.s3.us-east-2.amazonaws.com") return "Amcrest";
  if (host.endsWith("dahuawiki.com") || host.endsWith("dahuasecurity.com")) return "Dahua";
  if (host.endsWith("lorextechnology.com")) return "Lorex";
  if (host.endsWith("gogss.com")) return "GSS";
  if (host.endsWith("rhinoco.com.au")) return "Rhino";
  if (host.endsWith("optiviewusa.com")) return "Optiview";
  if (host.endsWith("specotech.com")) return "Speco";
  return null;
}

// ---------------------------------------------------------------------------------------------
// Hardware ID classification, for old-format data (the current format ships it pre-sorted).

const IGNORED_IDS = new Set(["DAHUA", "GENERAL", "GROUP", "A"]);
const HWID = /^[0-9a-f]{16}$/i;
/** Placeholders in board names: HCVR5x04, NVR4X-4KS2, IPC-HX3XXX, NVR4X-4KS2/L. */
const BOARD = /\dx\d|\dX(?:[-_]|$)|X{2,}|\//;

export function classifyHardware(ids: string[]): Hardware {
  const out: Hardware = { models: [], boards: [], hwids: [], ignored: [] };
  for (const raw of ids) {
    const id = raw.replace(/^General_/, "");
    if (IGNORED_IDS.has(id.toUpperCase()) || NOT_A_DEVICE.test(id)) out.ignored.push(raw);
    else if (HWID.test(id)) out.hwids.push(id.toLowerCase());
    else if (BOARD.test(id)) out.boards.push(id);
    else out.models.push(id);
  }
  for (const key of Object.keys(out) as (keyof Hardware)[]) out[key] = [...new Set(out[key])].sort();
  return out;
}

/** Version strings and file-name fragments occasionally end up among hardware IDs; they aren't devices. */
const NOT_A_DEVICE = /^V\d+\.\d+\.|_V\d+\.\d+|\.(bin|zip|img|dav)$/i;

function readHardware(value: unknown, fallbackIds: string[]): Hardware {
  if (!value || typeof value !== "object") return classifyHardware(fallbackIds);
  const h = value as Record<string, unknown>;
  const junk = (ids: string[]) => ids.filter((id) => NOT_A_DEVICE.test(id));
  const keep = (ids: string[]) => ids.filter((id) => !NOT_A_DEVICE.test(id));
  const models = list(h.models);
  const boards = list(h.boards);
  return {
    models: keep(models),
    boards: keep(boards),
    hwids: list(h.hwids),
    ignored: [...list(h.ignored), ...junk(models), ...junk(boards)],
  };
}

const ANALYSIS_STATUSES = new Set<AnalysisStatus>(["ok", "no_ids", "extract_failed", "not_dahua", "duplicate"]);
const URL_STATUSES = new Set<UrlStatus>(["ok", "dead", "error", "unchecked"]);
const PLATFORMS = new Set<Platform>(["dahua", "hikvision", "unknown"]);

// ---------------------------------------------------------------------------------------------

type Json = Record<string, unknown>;

function readListing(l: Json): RawListing {
  const source = str(l.source) ?? str(l.vendor) ?? "Unknown source";
  const urlStatus = str(l.url_status) as UrlStatus | null;
  return {
    vendor: str(l.vendor),
    source,
    camera_name: list(l.camera_name),
    series: list(l.series),
    notes: list(l.notes),
    url: validUrl(l.url),
    firmware_version: str(l.firmware_version),
    release_date: isoDate(l.release_date),
    changelog: validUrl(l.changelog),
    first_seen: isoDate(l.first_seen),
    last_seen: isoDate(l.last_seen),
    latest: typeof l.latest === "boolean" ? l.latest : null,
    url_status: urlStatus && URL_STATUSES.has(urlStatus) ? urlStatus : null,
    inferred: /found in an earlier scrape\)$/.test(source),
    kind: str(l.kind) === "vendor" || str(l.kind) === "mirror" || str(l.kind) === "archive" ? (l.kind as ListingKind) : null,
    original_url: validUrl(l.original_url),
    archived_at: isoDate(l.archived_at),
  };
}

/** A listing reconstructed from the old top-level fields, so old data renders like new data. */
function inferListing(camera: Json, vendor: string | null, url: string | null): RawListing {
  return {
    vendor,
    source: url ? `${hostOf(url) ?? "unknown host"} (found in an earlier scrape)` : "Earlier scrape",
    camera_name: list(camera.camera_name),
    series: list(camera.series),
    notes: list(camera.notes),
    url,
    firmware_version: str(camera.firmware_version),
    release_date: isoDate(camera.release_date),
    changelog: validUrl(camera.changelog),
    first_seen: null,
    last_seen: null,
    latest: null,
    url_status: null,
    inferred: true,
    kind: null,
    original_url: null,
    archived_at: null,
  };
}

function readEntry(filename: string, camera: Json | undefined, compat: unknown): RawEntry {
  const c: Json = camera ?? {};
  const url = validUrl(c.url);

  // Listings: the new format has them; old data gets one reconstructed from its top-level fields.
  let listings = Array.isArray(c.listings) ? (c.listings as Json[]).map(readListing) : [];
  let vendors = list(c.vendors);
  if (listings.length === 0 && camera) {
    const vendor = vendors[0] ?? vendorFromUrl(url);
    listings = [inferListing(c, vendor, url)];
  }
  if (vendors.length === 0) vendors = [...new Set(listings.map((l) => l.vendor).filter((v): v is string => !!v))];

  // firmware_compatible.json: an object in the new format, a plain list of IDs in the old one.
  let analysis: RawEntry["analysis"];
  if (Array.isArray(compat)) {
    const hardware = classifyHardware(list(compat));
    const usable = hardware.models.length + hardware.boards.length + hardware.hwids.length > 0;
    analysis = { status: usable ? "ok" : "no_ids", hardware, truncated: false, error: null, processedAt: null };
  } else if (compat && typeof compat === "object") {
    const r = compat as Json;
    const status = str(r.status) as AnalysisStatus | null;
    const ids = list(r.hardware_ids);
    analysis = {
      status: status && ANALYSIS_STATUSES.has(status) ? status : ids.length ? "ok" : "no_ids",
      hardware: readHardware(r.hardware, ids),
      truncated: r.truncated === true,
      error: str(r.error),
      processedAt: str(r.processed_at)?.slice(0, 10) ?? null,
    };
  } else {
    analysis = { status: "pending", hardware: classifyHardware([]), truncated: false, error: null, processedAt: null };
  }

  const hashes = (c.file_hashes ?? {}) as Json;
  const integrity = (c.integrity ?? null) as Json | null;
  const platform = (str(c.platform) ?? str((compat as Json | undefined)?.platform)) as Platform | null;

  return {
    filename,
    camera_name: list(c.camera_name),
    series: list(c.series),
    notes: list(c.notes),
    url,
    vendors,
    listings,
    downloadable: c.downloadable !== false,
    listing_only_reason: str(c.listing_only_reason),
    firmware_version: str(c.firmware_version),
    release_date: isoDate(c.release_date),
    changelog: validUrl(c.changelog),
    size: typeof c.firmware_size === "number" ? c.firmware_size : typeof hashes.size === "number" ? hashes.size : null,
    md5: str(hashes.md5) ?? str(c.md5),
    sha256: str(hashes.sha256) ?? str(c.sha256),
    platform: platform && PLATFORMS.has(platform) ? platform : null,
    integrity:
      integrity && str(integrity.status)
        ? {
            status: integrity.status as "ok" | "truncated" | "unverified",
            reason: str(integrity.reason),
            vendorCopyTruncated: integrity.vendor_copy_truncated === true,
          }
        : null,
    aliases: list(c.aliases),
    duplicate_of: str(c.duplicate_of) ?? str((compat as Json | undefined)?.duplicate_of),
    archive_url: validUrl(c.archive_url),
    archive_item: validUrl(c.archive_item),
    analysis,
  };
}

/**
 * Join cameras.json and firmware_compatible.json on the firmware file name. Entries with nothing
 * to offer (no analysis, no download link anywhere) are dropped: old data has a few placeholders
 * like "ClickHere" and "ComingSoon".
 */
export function readEntries(cameras: Record<string, unknown>, compatible: Record<string, unknown>): RawEntry[] {
  const names = [...new Set([...Object.keys(compatible), ...Object.keys(cameras)])];
  return names
    .map((name) => readEntry(name, cameras[name] as Json | undefined, compatible[name]))
    .filter(
      (e) =>
        e.filename in compatible || e.url || e.archive_url || e.listings.some((l) => l.url) || e.duplicate_of || !e.downloadable,
    );
}

/** Hosting platforms whose subdomains say nothing to a visitor (e.g. Montavue's *.workers.dev server). */
const GENERIC_HOSTS = /\.(workers\.dev|pages\.dev|netlify\.app|vercel\.app|herokuapp\.com|cloudfront\.net)$/;

/** Human label for a download host. `vendor` is used for generic hosting addresses. */
export function hostLabel(url: string, vendor?: string | null): string {
  const host = hostOf(url) ?? url;
  if (GENERIC_HOSTS.test(host)) return vendor ? `${vendor}'s download server` : "vendor download server";
  if (host === "mega.nz" || host.endsWith(".mega.nz")) return "MEGA";
  if (host.endsWith("drive.google.com") || host === "drive.usercontent.google.com") return "Google Drive";
  if (host.endsWith(".sharepoint.com")) return "SharePoint";
  if (host === "archive.org" || host.endsWith(".archive.org")) return "Internet Archive";
  if (host === "dropbox.com" || host.endsWith(".dropbox.com")) return "Dropbox";
  return host;
}

export const displayName = (filename: string) => safeDecode(filename);
