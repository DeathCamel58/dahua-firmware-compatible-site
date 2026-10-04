import { readFile } from "node:fs/promises";
import path from "node:path";
import brandsJson from "@/data/brands.json";
import { parseFirmwareName } from "./parseFirmware";
import {
  attachDetails,
  displayName,
  hostLabel,
  readEntries,
  type AnalysisStatus,
  type FirmwarePackage,
  type Hardware,
  type HardwareSource,
  type ListingKind,
  type Platform,
  type RawEntry,
  type RawListing,
  type UrlStatus,
} from "./raw";
import { assignSlugs, slugify } from "./slug";

const DATA_BASE = "https://raw.githubusercontent.com/DeathCamel58/amcrest-compatible-finder/master";

/** first_seen tracking started on this date, so everything older carries it. Only later dates mean "new". */
export const TRACKING_START = "2026-10-02";

/** Families with fewer devices than this are folded into "Other". */
const MIN_FAMILY_SIZE = 3;

// ---------------------------------------------------------------------------------------------
// Types

export interface Brand {
  name: string;
  slug: string;
  website: string | null;
  logo: string | null;
  background: "light" | "dark";
  width: number | null;
  height: number | null;
}

export interface Listing {
  vendor: string | null;
  /** Logo/brand details for the vendor, when known. */
  brand: Brand | null;
  source: string;
  models: string[];
  series: string[];
  notes: string[];
  url: string | null;
  hostLabel: string | null;
  version: string | null;
  date: string | null;
  changelog: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  /** true: the vendor's current firmware; false: listed as a previous version; null: unknown. */
  latest: boolean | null;
  urlStatus: UrlStatus | null;
  /** The vendor page no longer lists the file: its last_seen is older than the newest run that scraped that page. */
  delisted: boolean;
  inferred: boolean;
  /** vendor page, mirror (a file server holding copies) or archive (Wayback Machine capture). */
  kind: ListingKind | null;
  /** Archive listings: the original URL and when the Wayback Machine captured it. */
  originalUrl: string | null;
  archivedAt: string | null;
  /** Earlier addresses this page offered the file at, oldest first (for "previously at" links). */
  urlHistory: { url: string; firstSeen: string | null; lastSeen: string | null }[];
  /** Set when this listing belongs to an identical copy published under another file name. */
  aliasFilename: string | null;
}

export interface Download {
  url: string;
  label: string;
  /** archive: the pipeline's own Internet Archive item; wayback: a Wayback Machine capture; vendor: a vendor or mirror link. */
  kind: "archive" | "wayback" | "vendor";
}

export interface Firmware {
  slug: string;
  filename: string;
  /** Filename with %xx sequences decoded, for display. */
  displayName: string;
  /** Short, human-friendly page title, e.g. "IPC-HX5X3X-Rhea firmware V2.800.0000018.0 (Jul 7, 2021)". */
  title: string;
  /** The file name, shortened for descriptions when it's very long; unique across all firmware. */
  shortName: string;
  /** Model/platform part of the filename, e.g. "IPC-HX5X3X-Rhea". */
  model: string | null;
  version: string | null;
  date: string | null;
  /** Where `date` came from: a vendor's listed release date, or the build date in the file name. */
  dateSource: "vendor" | "filename" | null;
  vendors: string[];
  listings: Listing[];
  /** false: listed by a vendor, but there's no file anyone can download (see listingOnlyReason). */
  downloadable: boolean;
  listingOnlyReason: string | null;
  /** Other file names with byte-identical content; their URLs redirect here. */
  aliases: string[];
  platform: Platform | null;
  truncated: boolean;
  vendorCopyTruncated: boolean;
  analysis: AnalysisStatus;
  analysisError: string | null;
  hardware: Hardware;
  /** Where the hardware IDs were read from (extractor v5+; empty for older results). */
  hardwareSources: HardwareSource[];
  /** Container format: zip | dh | dhsp | bundle | other. */
  packageFormat: string | null;
  /** What each firmware image says about itself: SoC, kernel, partitions, security… (v5+). */
  packages: FirmwarePackage[];
  /** Chips this firmware is built for (named SoCs across its packages). */
  socs: { name: string; vendor: string | null; slug: string }[];
  /** Highest security baseline across its packages, e.g. "V2.4". */
  securityBaseline: string | null;
  /** Linkable hardware: hardware.models + hardware.boards (empty unless analysis found IDs). */
  devices: string[];
  /** Retail model names, across all vendors. */
  models: string[];
  series: string[];
  notes: string[];
  changelog: string | null;
  size: number | null;
  md5: string | null;
  sha256: string | null;
  vendorMd5Mismatch: boolean;
  archiveUrl: string | null;
  archiveItem: string | null;
  /** Best link to offer: the Internet Archive item, else a working vendor link, then a mirror, then a Wayback capture. */
  download: Download | null;
  /** Earliest first_seen across listings. */
  firstSeen: string | null;
  /**
   * When this page's content last changed (YYYY-MM-DD): the release date, a vendor listing first
   * appearing, or the file being analysed. Deliberately not last_seen, which moves every run.
   */
  lastmod: string | null;
}

export interface Device {
  slug: string;
  name: string;
  /** "model" = a single device; "board" = a family placeholder such as HCVR5x04-S2. */
  kind: "model" | "board";
  family: string;
  familySlug: string;
  /** Firmware filenames, newest first. */
  firmwares: string[];
}

export interface RetailModel {
  slug: string;
  name: string;
  /** Vendors whose pages list this model, e.g. ["Amcrest"]. */
  publishers: string[];
  /** Firmware filenames, newest first. */
  firmwares: string[];
}

export interface Family {
  slug: string;
  name: string;
  /** Device names, sorted. */
  devices: string[];
}

export interface Soc {
  name: string;
  vendor: string | null;
  slug: string;
  /** Firmware filenames, newest first. */
  firmwares: string[];
}

export interface Vendor {
  name: string;
  slug: string;
  brand: Brand | null;
  /** Firmware filenames this vendor lists, newest first. */
  firmwares: string[];
  /** Retail models this vendor lists, sorted. */
  models: string[];
}

export interface SiteData {
  firmwares: Map<string, Firmware>;
  devices: Map<string, Device>;
  models: Map<string, RetailModel>;
  families: Map<string, Family>;
  vendors: Map<string, Vendor>;
  /** SoC name -> chip page data. */
  socs: Map<string, Soc>;
  /** Alias filename -> main firmware filename. */
  aliases: Map<string, string>;
  /** Alias filename -> the slug its redirect page lives at. */
  aliasSlugs: Map<string, string>;
  /** Raw hex hardware ID -> firmware filenames (used for matching, not pages). */
  hwids: Map<string, string[]>;
  /** All firmwares, newest first. */
  firmwareList: Firmware[];
  /** Most recent pipeline run seen in the data (max last_seen), if tracked. */
  latestRun: string | null;
}

// ---------------------------------------------------------------------------------------------
// Loading

async function loadJson(file: string): Promise<Record<string, unknown>> {
  // DATA_DIR lets you build against local copies of the JSON files (offline / testing).
  if (process.env.DATA_DIR) {
    return JSON.parse(await readFile(path.join(process.env.DATA_DIR, file), "utf8"));
  }
  const response = await fetch(`${DATA_BASE}/${file}`);
  if (!response.ok) {
    // Fail the build rather than deploying an empty site.
    throw new Error(`Failed to fetch ${file}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------------------------
// Brands (logos) for vendor names used in the data

const BRANDS: Brand[] = (brandsJson as Record<string, unknown>[]).map((b) => ({
  name: b.name as string,
  slug: b.slug as string,
  website: (b.website as string | null) ?? null,
  logo: (b.logo as string | null) ?? null,
  background: b.background === "dark" ? "dark" : "light",
  width: (b.width as number | null) ?? null,
  height: (b.height as number | null) ?? null,
}));

const brandCache = new Map<string, Brand | null>();

/** Match a vendor name from the data ("ENS Security", "Speco") to its brands.json entry. */
export function brandFor(vendor: string | null): Brand | null {
  if (!vendor) return null;
  if (brandCache.has(vendor)) return brandCache.get(vendor)!;
  const name = vendor.toLowerCase();
  const first = name.split(/\s+/)[0];
  const brand =
    BRANDS.find((b) => b.name.toLowerCase() === name) ??
    BRANDS.find((b) => b.slug === slugify(vendor)) ??
    BRANDS.find((b) => b.name.toLowerCase().split(/\s+/)[0] === first) ??
    null;
  brandCache.set(vendor, brand);
  return brand;
}

// ---------------------------------------------------------------------------------------------
// Helpers

function deviceFamily(name: string): string {
  const stripped = name.replace(/^(General|DH|Dahua|Lorex|Amcrest|Customer)[-_]/i, "");
  const match = stripped.match(/^([A-Za-z]+(?:-[A-Za-z]+)?)/);
  return match ? match[1].toUpperCase() : "OTHER";
}

/** Newest first; undated last, then by name. */
function compareFirmware(a: Firmware, b: Firmware): number {
  if (a.date !== b.date) {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date < b.date ? 1 : -1;
  }
  return a.filename.localeCompare(b.filename);
}

const unique = <T>(values: Iterable<T>) => [...new Set(values)];

/** Compare security baselines like "V2.4" and "V2.10" numerically. */
export function compareBaseline(a: string, b: string): number {
  const parts = (v: string) => v.replace(/^V/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

const highestBaseline = (values: (string | null)[]) =>
  values.filter((v): v is string => !!v).sort(compareBaseline).at(-1) ?? null;

/** Latest of some YYYY-MM-DD dates (nulls ignored). */
export const maxDate = (dates: (string | null | undefined)[]) =>
  dates.filter((d): d is string => !!d).sort().at(-1) ?? null;

/** "V2.800.0000018.0.R" style versions read well in titles; vendor labels like "K74_V3.4.98" don't. */
const isDahuaVersion = (version: string | null) => !!version && /^V?\d+\.\d+\.[0-9A-Za-z]+/.test(version);
const vLabel = (version: string) => (version.startsWith("V") ? version : `V${version}`);

function shortTitle(fw: Firmware, variant = ""): string | null {
  const version = isDahuaVersion(fw.version) ? vLabel(fw.version!) : null;
  if (!fw.model || (!version && !fw.date)) return null;
  return [`${fw.model}${variant ? ` ${variant}` : ""} firmware`, version, fw.date && `(${formatDate(fw.date)})`]
    .filter(Boolean)
    .join(" ");
}

/** Filename tokens that never distinguish variants: vendor prefixes and leading build numbers. */
const NOT_VARIANT = /^(general|dh|dahua|amcrest|customer|lorex|flir|\d{5,})$/i;

/** Version/build fragments ("V3.100.0000.0.R.20170401.language") are already in the title. */
const VERSION_TOKEN = /V\d+\.\d+\.|\d+\.\d+\.\d+/i;

const filenameTokens = (fw: Firmware) => fw.displayName.replace(/\.(bin|zip|rar|img|tar|gz|sw|iav|dav)$/i, "").split("_");

/**
 * Give each firmware a short title. Files that would share one (regional or component variants
 * of the same build) get the filename parts that tell them apart, e.g. "E2" vs "Stream3-USA".
 * Anything still ambiguous falls back to the full filename.
 */
function assignTitles(list: Firmware[]) {
  const groups = new Map<string, Firmware[]>();
  for (const fw of list) {
    const title = shortTitle(fw);
    if (!title) continue;
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title)!.push(fw);
  }

  const titles = new Map<Firmware, string>();
  for (const [title, members] of groups) {
    if (members.length === 1) {
      titles.set(members[0], title);
      continue;
    }
    const tokenSets = members.map((fw) => new Set(filenameTokens(fw)));
    for (const fw of members) {
      const variant = filenameTokens(fw)
        .filter(
          (token) =>
            token !== fw.model &&
            !NOT_VARIANT.test(token) &&
            !VERSION_TOKEN.test(token) &&
            !tokenSets.every((set) => set.has(token)),
        )
        .filter((token, i, all) => all.indexOf(token) === i)
        .join(" ");
      titles.set(fw, shortTitle(fw, variant)!);
    }
  }

  const counts = new Map<string, number>();
  for (const title of titles.values()) counts.set(title, (counts.get(title) ?? 0) + 1);
  for (const fw of list) {
    const title = titles.get(fw);
    fw.title = title && counts.get(title) === 1 ? title : fw.displayName;
  }

  // Two keys can decode to the same name ("…%2B(1).bin" and "…+(1).bin"); keep titles unique anyway.
  const seen = new Map<string, number>();
  for (const fw of list) {
    const n = (seen.get(fw.title) ?? 0) + 1;
    seen.set(fw.title, n);
    if (n > 1) fw.title = fw.filename !== fw.displayName ? fw.filename : `${fw.title} (copy ${n})`;
  }
}

function toListing(raw: RawListing, sourceLastRun: Map<string, string>, aliasFilename: string | null): Listing {
  return {
    vendor: raw.vendor,
    brand: brandFor(raw.vendor),
    source: raw.source,
    models: raw.camera_name,
    series: raw.series,
    notes: raw.notes,
    url: raw.url,
    hostLabel: raw.url ? hostLabel(raw.url, raw.vendor) : null,
    version: raw.firmware_version,
    date: raw.release_date,
    changelog: raw.changelog,
    firstSeen: raw.first_seen,
    lastSeen: raw.last_seen,
    latest: raw.latest,
    urlStatus: raw.url_status,
    // Compared per source, so a vendor page that failed to scrape on the latest run doesn't make
    // all of its firmware look delisted.
    delisted: !!(raw.last_seen && raw.last_seen < (sourceLastRun.get(raw.source) ?? raw.last_seen)),
    inferred: raw.inferred,
    kind: raw.kind,
    originalUrl: raw.original_url,
    archivedAt: raw.archived_at,
    urlHistory: raw.url_history.map((h) => ({ url: h.url, firstSeen: h.first_seen, lastSeen: h.last_seen })),
    aliasFilename,
  };
}

/** Order to offer links in: the vendor's own page, then mirrors, then Wayback captures. */
const KIND_RANK: Record<ListingKind, number> = { vendor: 0, mirror: 1, archive: 2 };

function pickDownload(
  archiveUrl: string | null,
  listings: Listing[],
  fallbackUrl: string | null,
  waybackCopy: string | null,
): Download | null {
  if (archiveUrl) return { url: archiveUrl, label: "Internet Archive", kind: "archive" };
  // Links checked as working first, then by kind; links known to be dead are never offered.
  const best = listings
    .filter((l) => l.url && l.urlStatus !== "dead")
    .sort(
      (a, b) =>
        Number(b.urlStatus === "ok") - Number(a.urlStatus === "ok") ||
        KIND_RANK[a.kind ?? "vendor"] - KIND_RANK[b.kind ?? "vendor"],
    )[0];
  if (best?.url) {
    return best.kind === "archive"
      ? { url: best.url, label: "Wayback Machine", kind: "wayback" }
      : { url: best.url, label: best.hostLabel ?? "vendor", kind: "vendor" };
  }
  if (fallbackUrl && !listings.some((l) => l.url === fallbackUrl && l.urlStatus === "dead")) {
    return { url: fallbackUrl, label: hostLabel(fallbackUrl), kind: "vendor" };
  }
  // The Wayback capture the pipeline itself had to download from, when every listed link is dead.
  if (waybackCopy) return { url: waybackCopy, label: "Wayback Machine", kind: "wayback" };
  return null;
}

// ---------------------------------------------------------------------------------------------
// Build

/**
 * Some vendors (RVI, DH Vision) use 100-200 character file names. For descriptions, keep the start
 * (product) and end (version, date) of long names; where that would make two names identical, add
 * back the words that differ (e.g. "spiflash" vs "norflash").
 */
function assignShortNames(list: Firmware[], max = 95) {
  const shorten = (name: string) => (name.length <= max ? name : `${name.slice(0, 42)}…${name.slice(-24)}`);
  const groups = new Map<string, Firmware[]>();
  for (const fw of list) {
    fw.shortName = shorten(fw.displayName);
    if (!groups.has(fw.shortName)) groups.set(fw.shortName, []);
    groups.get(fw.shortName)!.push(fw);
  }
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const words = (fw: Firmware) => fw.displayName.split(/[_\-\s.]+/);
    const sets = members.map((fw) => new Set(words(fw)));
    for (const fw of members) {
      const distinct = words(fw).filter((w) => !sets.every((set) => set.has(w)));
      fw.shortName = `${fw.displayName.slice(0, 42)}… ${distinct.join(" ")} …${fw.displayName.slice(-24)}`;
    }
  }
}

async function buildData(): Promise<SiteData> {
  const [cameras, compatible] = await Promise.all([loadJson("cameras.json"), loadJson("firmware_compatible.json")]);
  const entries = readEntries(cameras, compatible);

  // Split format: technical details live in data/firmware/… and data/layouts/… next to the two JSONs.
  // They're read from DATA_DIR (the deploy workflow checks the data repo out); without it the site
  // still builds, just without technical details.
  if (entries.some((e) => e.analysis.detail)) {
    if (process.env.DATA_DIR) {
      const dir = process.env.DATA_DIR;
      const { loaded, missing } = await attachDetails(entries, (rel) =>
        readFile(path.join(dir, rel), "utf8").then(JSON.parse, () => null),
      );
      if (missing) console.warn(`[data] ${missing} firmware detail files were missing; ${loaded} loaded`);
    } else {
      console.warn("[data] DATA_DIR isn't set, so firmware detail files (technical details) are skipped");
    }
  }
  const byName = new Map(entries.map((e) => [e.filename, e]));

  const latestRun =
    entries
      .flatMap((e) => e.listings.map((l) => l.last_seen))
      .filter((d): d is string => !!d)
      .sort()
      .at(-1) ?? null;

  const sourceLastRun = new Map<string, string>();
  for (const l of entries.flatMap((e) => e.listings)) {
    if (l.last_seen && l.last_seen > (sourceLastRun.get(l.source) ?? "")) sourceLastRun.set(l.source, l.last_seen);
  }

  // Identical copies: each duplicate folds into its main entry, and its URL redirects there.
  const aliases = new Map<string, string>();
  for (const e of entries) {
    if (e.duplicate_of && e.duplicate_of !== e.filename && byName.has(e.duplicate_of)) aliases.set(e.filename, e.duplicate_of);
  }
  const mains = entries.filter((e) => !aliases.has(e.filename));
  const copiesOf = new Map<string, RawEntry[]>();
  for (const [alias, main] of aliases) {
    if (!copiesOf.has(main)) copiesOf.set(main, []);
    copiesOf.get(main)!.push(byName.get(alias)!);
  }

  const firmwareSlugs = assignSlugs([...mains.map((e) => e.filename), ...aliases.keys()]);
  const firmwares = new Map<string, Firmware>();

  for (const e of mains) {
    const copies = copiesOf.get(e.filename) ?? [];
    const listings = [
      ...e.listings.map((l) => toListing(l, sourceLastRun, null)),
      ...copies.flatMap((c) => c.listings.map((l) => toListing(l, sourceLastRun, c.filename))),
    ];
    const parsed = parseFirmwareName(e.filename);
    // Earliest vendor date = first publication. (The top-level release_date is just whichever listing
    // was processed last, which can be a re-post years later.)
    const vendorDate = [...listings.map((l) => l.date), e.release_date].filter((d): d is string => !!d).sort()[0] ?? null;
    const usable = e.analysis.status === "ok" && e.platform !== "hikvision";
    const devices = usable ? unique([...e.analysis.hardware.models, ...e.analysis.hardware.boards]).sort() : [];

    firmwares.set(e.filename, {
      slug: firmwareSlugs.get(e.filename)!,
      filename: e.filename,
      displayName: displayName(e.filename),
      title: "", // filled in below once every firmware is known
      shortName: "", // likewise
      model: parsed.model,
      version: e.firmware_version ?? (parsed.version ? `V${parsed.version}` : null),
      date: vendorDate ?? parsed.buildDate,
      dateSource: vendorDate ? "vendor" : parsed.buildDate ? "filename" : null,
      vendors: unique([...e.vendors, ...copies.flatMap((c) => c.vendors), ...listings.map((l) => l.vendor)].filter(
        (v): v is string => !!v,
      )),
      listings,
      downloadable: e.downloadable,
      listingOnlyReason: e.listing_only_reason,
      aliases: unique([...e.aliases, ...copies.map((c) => c.filename)]).filter((a) => a !== e.filename),
      platform: e.platform,
      truncated: e.integrity?.status === "truncated" || e.analysis.truncated,
      vendorCopyTruncated: e.integrity?.vendorCopyTruncated ?? false,
      analysis: e.analysis.status,
      analysisError: e.analysis.error,
      hardware: e.analysis.hardware,
      hardwareSources: e.analysis.hardwareSources,
      packageFormat: e.analysis.packageFormat,
      packages: e.analysis.packages,
      socs: [], // filled in below once every chip is known
      securityBaseline: highestBaseline(e.analysis.packages.map((p) => p.security?.baseline ?? null)),
      devices,
      models: unique([...e.camera_name, ...listings.flatMap((l) => l.models)]).sort(),
      series: unique([...e.series, ...listings.flatMap((l) => l.series)]),
      notes: unique([...e.notes, ...listings.flatMap((l) => l.notes)]),
      changelog: e.changelog ?? listings.find((l) => l.changelog)?.changelog ?? null,
      size: e.size,
      md5: e.md5,
      sha256: e.sha256,
      vendorMd5Mismatch: e.vendor_md5_mismatch,
      archiveUrl: e.archive_url,
      archiveItem: e.archive_item,
      download: e.downloadable ? pickDownload(e.archive_url, listings, e.url, e.downloaded_from) : null,
      firstSeen: listings.map((l) => l.firstSeen).filter((d): d is string => !!d).sort()[0] ?? null,
      lastmod: maxDate([vendorDate ?? parsed.buildDate, e.analysis.processedAt, ...listings.map((l) => l.firstSeen)]),
    });
  }

  const firmwareList = [...firmwares.values()].sort(compareFirmware);
  assignTitles(firmwareList);
  assignShortNames(firmwareList);
  // Say up front, in search results too, when a file isn't usable on Dahua hardware.
  for (const fw of firmwareList) {
    if (fw.platform === "hikvision") fw.title += " (Hikvision)";
    else if (fw.truncated) fw.title += " (truncated)";
    else if (!fw.downloadable) fw.title += " (not downloadable)";
  }

  // Invert firmware -> devices / retail models / vendors / hex IDs. Iterating the sorted list
  // keeps every inverted list newest-first without re-sorting.
  const deviceFirmwares = new Map<string, string[]>();
  const deviceKind = new Map<string, "model" | "board">();
  const modelFirmwares = new Map<string, string[]>();
  const modelVendors = new Map<string, Set<string>>();
  const vendorFirmwares = new Map<string, string[]>();
  const vendorModels = new Map<string, Set<string>>();
  const hwids = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, key: string, value: string) => {
    if (!map.has(key)) map.set(key, []);
    const values = map.get(key)!;
    if (values.at(-1) !== value) values.push(value);
  };

  const socFirmwares = new Map<string, string[]>();
  const socVendor = new Map<string, string | null>();
  const entryByName = byName;
  for (const fw of firmwareList) {
    // Chips come from the detail packages when loaded, else from the index's `socs` summary.
    const chipList = fw.packages.length
      ? fw.packages.map((p) => ({ name: p.soc?.name ?? null, vendor: p.soc?.vendor ?? null }))
      : (byName.get(fw.filename)?.analysis.socs ?? []);
    for (const chip of chipList) {
      const name = chip.name;
      if (!name) continue;
      push(socFirmwares, name, fw.filename);
      if (!socVendor.get(name)) socVendor.set(name, chip.vendor ?? null);
    }
    for (const device of fw.devices) push(deviceFirmwares, device, fw.filename);
    for (const board of fw.hardware.boards) deviceKind.set(board, "board");
    if (fw.analysis === "ok" && fw.platform !== "hikvision") for (const id of fw.hardware.hwids) push(hwids, id, fw.filename);
    for (const model of fw.models) push(modelFirmwares, model, fw.filename);
    for (const listing of fw.listings) {
      if (!listing.vendor) continue;
      push(vendorFirmwares, listing.vendor, fw.filename);
      if (!vendorModels.has(listing.vendor)) vendorModels.set(listing.vendor, new Set());
      for (const model of listing.models) {
        vendorModels.get(listing.vendor)!.add(model);
        if (!modelVendors.has(model)) modelVendors.set(model, new Set());
        modelVendors.get(model)!.add(listing.vendor);
      }
    }
  }

  // Families: group by name prefix, folding tiny groups into "Other".
  const familyMembers = new Map<string, string[]>();
  for (const name of deviceFirmwares.keys()) push(familyMembers, deviceFamily(name), name);
  for (const [family, members] of [...familyMembers]) {
    if (family !== "OTHER" && members.length < MIN_FAMILY_SIZE) {
      familyMembers.delete(family);
      for (const member of members) push(familyMembers, "OTHER", member);
    }
  }
  const familySlugs = assignSlugs(familyMembers.keys());
  const families = new Map<string, Family>();
  const familyOf = new Map<string, string>();
  for (const [name, members] of [...familyMembers].sort(([a], [b]) => a.localeCompare(b))) {
    families.set(name, { slug: familySlugs.get(name)!, name: name === "OTHER" ? "Other" : name, devices: members.sort() });
    for (const member of members) familyOf.set(member, name);
  }

  // "family" is taken by /device/family/…
  const deviceSlugs = assignSlugs(deviceFirmwares.keys(), ["family"]);
  const devices = new Map<string, Device>();
  for (const [name, fws] of [...deviceFirmwares].sort(([a], [b]) => a.localeCompare(b))) {
    const family = families.get(familyOf.get(name)!)!;
    devices.set(name, {
      slug: deviceSlugs.get(name)!,
      name,
      kind: deviceKind.get(name) ?? "model",
      family: family.name,
      familySlug: family.slug,
      firmwares: fws,
    });
  }

  const modelSlugs = assignSlugs(modelFirmwares.keys(), ["brand"]);
  const models = new Map<string, RetailModel>();
  for (const [name, fws] of [...modelFirmwares].sort(([a], [b]) => a.localeCompare(b))) {
    const publishers = [...(modelVendors.get(name) ?? [])].sort();
    models.set(name, { slug: modelSlugs.get(name)!, name, publishers, firmwares: fws });
  }

  const vendorSlugs = assignSlugs(vendorFirmwares.keys());
  const vendors = new Map<string, Vendor>();
  for (const [name, fws] of [...vendorFirmwares].sort(([a], [b]) => a.localeCompare(b))) {
    vendors.set(name, {
      name,
      slug: brandFor(name)?.slug ?? vendorSlugs.get(name)!,
      brand: brandFor(name),
      firmwares: fws,
      models: [...(vendorModels.get(name) ?? [])].sort(),
    });
  }

  const socSlugs = assignSlugs(socFirmwares.keys());
  const socs = new Map<string, Soc>();
  for (const [name, fws] of [...socFirmwares].sort(([a], [b]) => a.localeCompare(b))) {
    socs.set(name, { name, vendor: socVendor.get(name) ?? null, slug: socSlugs.get(name)!, firmwares: fws });
  }
  for (const fw of firmwareList) {
    const names = fw.packages.length
      ? fw.packages.map((p) => p.soc?.name)
      : (entryByName.get(fw.filename)?.analysis.socs ?? []).map((s) => s.name);
    fw.socs = unique(names.filter((n): n is string => !!n)).map((name) => {
      const soc = socs.get(name)!;
      return { name, vendor: soc.vendor, slug: soc.slug };
    });
  }

  const aliasSlugs = new Map([...aliases.keys()].map((alias) => [alias, firmwareSlugs.get(alias)!]));

  return { firmwares, devices, models, families, vendors, socs, aliases, aliasSlugs, hwids, firmwareList, latestRun };
}

let cached: Promise<SiteData> | undefined;

/** Load and normalize all site data. Fetched once per build and shared by every page. */
export function getData(): Promise<SiteData> {
  cached ??= buildData();
  return cached;
}

// ---------------------------------------------------------------------------------------------
// Queries used by pages

/** Firmwares that share the most hardware (devices and raw hardware IDs) with the given one. */
export function relatedFirmwares(data: SiteData, fw: Firmware, limit = 8): Firmware[] {
  if (fw.devices.length === 0 && fw.hardware.hwids.length === 0) return [];
  const scores = new Map<string, number>();
  const add = (others: string[] | undefined) => {
    for (const other of others ?? []) if (other !== fw.filename) scores.set(other, (scores.get(other) ?? 0) + 1);
  };
  for (const name of fw.devices) add(data.devices.get(name)?.firmwares);
  if (fw.analysis === "ok" && fw.platform !== "hikvision") for (const id of fw.hardware.hwids) add(data.hwids.get(id));
  return [...scores]
    .map(([filename, score]) => ({ fw: data.firmwares.get(filename)!, score }))
    .sort((a, b) => b.score - a.score || compareFirmware(a.fw, b.fw))
    .slice(0, limit)
    .map((entry) => entry.fw);
}

/** Devices that share the most firmware files with the given one. */
export function similarDevices(data: SiteData, device: Device, limit = 12): Device[] {
  const scores = new Map<string, number>();
  for (const filename of device.firmwares) {
    for (const other of data.firmwares.get(filename)!.devices) {
      if (other !== device.name) scores.set(other, (scores.get(other) ?? 0) + 1);
    }
  }
  return [...scores]
    .map(([name, score]) => ({ device: data.devices.get(name)!, score }))
    .sort((a, b) => b.score - a.score || a.device.name.localeCompare(b.device.name))
    .slice(0, limit)
    .map((entry) => entry.device);
}

/** Unique values across a list of firmwares, preserving first-seen order. */
export function collect(data: SiteData, filenames: string[], pick: (fw: Firmware) => string[]): string[] {
  const seen = new Set<string>();
  for (const filename of filenames) for (const value of pick(data.firmwares.get(filename)!)) seen.add(value);
  return [...seen];
}

/** Firmware first listed after tracking started, newest first. */
export function newlyAdded(data: SiteData): Firmware[] {
  return data.firmwareList
    .filter((fw) => fw.firstSeen && fw.firstSeen > TRACKING_START)
    .sort((a, b) => (a.firstSeen! < b.firstSeen! ? 1 : a.firstSeen! > b.firstSeen! ? -1 : compareFirmware(a, b)));
}

/**
 * Old Next.js URLs used the raw name as the path segment. Return it when a redirect stub
 * can be generated for it safely (plain characters, and no clash with a new slug).
 */
export function legacySegment(name: string, slugs: Set<string>): string | null {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
  if (slugs.has(name.toLowerCase())) return null;
  return name;
}

export const UNDATED = "undated";

/** Firmwares grouped by year (newest year first), with undated files last. */
export function firmwaresByYear(data: SiteData): { year: string; firmwares: Firmware[] }[] {
  const groups = new Map<string, Firmware[]>();
  for (const fw of data.firmwareList) {
    const year = fw.date?.slice(0, 4) ?? UNDATED;
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year)!.push(fw);
  }
  return [...groups].map(([year, firmwares]) => ({ year, firmwares }));
}

export const paths = {
  firmware: (fw: Pick<Firmware, "slug">) => `/firmware/${fw.slug}/`,
  device: (d: Pick<Device, "slug">) => `/device/${d.slug}/`,
  family: (f: Pick<Family, "slug">) => `/device/family/${f.slug}/`,
  model: (m: Pick<RetailModel, "slug">) => `/model/${m.slug}/`,
  modelBrand: (v: Pick<Vendor, "slug">) => `/model/brand/${v.slug}/`,
  modelSeries: (v: Pick<Vendor, "slug">, g: Pick<NameGroup, "slug">) => `/model/brand/${v.slug}/${g.slug}/`,
  vendorFirmware: (v: Pick<Vendor, "slug">) => `/vendor/${v.slug}/firmware/`,
  vendor: (v: Pick<Vendor, "slug">) => `/vendor/${v.slug}/`,
  soc: (s: Pick<Soc, "slug">) => `/soc/${s.slug}/`,
};

export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatSize(bytes: number | null): string | null {
  if (bytes === null) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** Short label for why a firmware has no device list. */
export function analysisLabel(fw: Firmware): string {
  if (!fw.downloadable) return "Not downloadable";
  if (fw.platform === "hikvision") return "Hikvision firmware";
  switch (fw.analysis) {
    case "ok":
      return fw.devices.length ? `${fw.devices.length} device${fw.devices.length === 1 ? "" : "s"}` : "Hardware IDs only";
    case "no_ids":
      return "No hardware IDs found";
    case "extract_failed":
      return "Couldn't be analysed";
    case "not_dahua":
      return "Not Dahua firmware";
    case "duplicate":
      return "Duplicate";
    default:
      return "Analysis pending";
  }
}

/** "Amcrest IP8M-2493EW-AI-V3": a retail model with its vendor in front, unless the name already starts with it. */
export function vendorModelName(vendor: string | null, model: string): string {
  if (!vendor) return model;
  const short = vendor.split(/\s+/)[0];
  return model.toUpperCase().startsWith(short.toUpperCase()) ? model : `${short} ${model}`;
}

/** Retail model names, vendor-qualified, from the listings of some firmwares (first-seen order, no duplicates). */
export function retailNames(firmwares: Firmware[], only?: (model: string) => boolean): string[] {
  const names = new Set<string>();
  for (const fw of firmwares)
    for (const l of fw.listings) for (const m of l.models) if (!only || only(m)) names.add(vendorModelName(l.vendor, m));
  return [...names];
}

/** Latest content date across some firmwares. */
export const lastmodOf = (firmwares: Firmware[]) => maxDate(firmwares.map((fw) => fw.lastmod));

export interface NameGroup {
  key: string;
  name: string;
  slug: string;
  items: string[];
}

/**
 * Group model names into series by their prefix (IPC-HFW, NVR, SD…), folding series with fewer than
 * `minSize` names into "Other". Biggest first, "Other" last; names sorted within each group.
 */
export function groupBySeries(names: string[], minSize = 3): NameGroup[] {
  const groups = new Map<string, string[]>();
  for (const name of names) {
    const key = deviceFamily(name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(name);
  }
  for (const [key, items] of [...groups]) {
    if (key !== "OTHER" && items.length < minSize) {
      groups.delete(key);
      if (!groups.has("OTHER")) groups.set("OTHER", []);
      groups.get("OTHER")!.push(...items);
    }
  }
  const slugs = assignSlugs(groups.keys());
  return [...groups]
    .map(([key, items]) => ({ key, name: key === "OTHER" ? "Other" : key, slug: slugs.get(key)!, items: items.sort() }))
    .sort((a, b) => (a.key === "OTHER" ? 1 : b.key === "OTHER" ? -1 : b.items.length - a.items.length || a.name.localeCompare(b.name)));
}

/** Vendors with more models than this get one page per series instead of a single list. */
export const MODELS_PER_PAGE_LIMIT = 300;
