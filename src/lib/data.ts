import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseFirmwareName } from "./parseFirmware";
import { assignSlugs, safeDecode } from "./slug";

const DATA_BASE = "https://raw.githubusercontent.com/DeathCamel58/amcrest-compatible-finder/master";

/** Device identifiers that are too generic to be meaningful on their own. */
const GENERIC_DEVICES = new Set(["DAHUA", "GENERAL", "A"]);

/** Families with fewer devices than this are folded into "Other". */
const MIN_FAMILY_SIZE = 3;

export interface Firmware {
  slug: string;
  filename: string;
  /** Filename with %xx sequences decoded, for display. */
  displayName: string;
  /** Short, human-friendly page title, e.g. "IPC-HX5X3X-Rhea firmware V2.800.0000018.0 (Jul 7, 2021)". */
  title: string;
  model: string | null;
  devices: string[];
  /** Retail model names the download source lists for this file. */
  models: string[];
  url: string | null;
  host: string | null;
  /** Brand that publishes the download, derived from where it is hosted. */
  publisher: string | null;
  notes: string[];
  vendor: string | null;
  version: string | null;
  buildDate: string | null;
}

export interface Device {
  slug: string;
  name: string;
  family: string;
  familySlug: string;
  generic: boolean;
  /** Firmware filenames, newest first. */
  firmwares: string[];
}

export interface RetailModel {
  slug: string;
  name: string;
  /** Brands whose download pages list this model, e.g. ["Amcrest"]. */
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

export interface SiteData {
  firmwares: Map<string, Firmware>;
  devices: Map<string, Device>;
  models: Map<string, RetailModel>;
  families: Map<string, Family>;
  /** All firmwares, newest first. */
  firmwareList: Firmware[];
}

type RawCameras = Record<string, { camera_name?: string[]; notes?: string[]; url?: string }>;
type RawFirmwares = Record<string, string[] | null>;

async function loadJson<T>(file: string): Promise<T> {
  // DATA_DIR lets you build against local copies of the JSON files (offline / testing).
  if (process.env.DATA_DIR) {
    return JSON.parse(await readFile(path.join(process.env.DATA_DIR, file), "utf8")) as T;
  }
  const response = await fetch(`${DATA_BASE}/${file}`);
  if (!response.ok) {
    // Fail the build rather than deploying an empty site.
    throw new Error(`Failed to fetch ${file}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

function deviceFamily(name: string): string {
  const stripped = name.replace(/^(General|DH|Dahua|Lorex|Amcrest|Customer)[-_]/i, "");
  const match = stripped.match(/^([A-Za-z]+(?:-[A-Za-z]+)?)/);
  return match ? match[1].toUpperCase() : "OTHER";
}

function validUrl(url: string | undefined): string | null {
  const trimmed = url?.trim();
  return trimmed && /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

/** Which brand publishes a download, judged by where it is hosted. */
function publisherOf(url: string): string | null {
  const host = hostOf(url);
  if (!host) return null;
  if (/amcrest/i.test(url) || host === "sup-files.s3.us-east-2.amazonaws.com") return "Amcrest";
  if (host.endsWith("dahuawiki.com")) return "Dahua";
  if (host.endsWith("lorextechnology.com")) return "Lorex";
  if (host.endsWith("gogss.com")) return /\/redline\//i.test(url) ? "Redline (GSS)" : "GSS";
  return null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Newest build date first; undated firmwares last, then by name. */
function compareFirmware(a: Firmware, b: Firmware): number {
  if (a.buildDate !== b.buildDate) {
    if (!a.buildDate) return 1;
    if (!b.buildDate) return -1;
    return a.buildDate < b.buildDate ? 1 : -1;
  }
  return a.filename.localeCompare(b.filename);
}

function cleanList(values: string[] | null | undefined): string[] {
  return [...new Set((values ?? []).map((v) => v.trim()).filter((v) => v && v !== "N/A"))];
}

function shortTitle(fw: Firmware, variant = ""): string | null {
  if (!fw.model || (!fw.version && !fw.buildDate)) return null;
  return [
    `${fw.model}${variant ? ` ${variant}` : ""} firmware`,
    fw.version && `V${fw.version}`,
    fw.buildDate && `(${formatDate(fw.buildDate)})`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Filename tokens that never distinguish variants: vendor prefixes and leading build numbers. */
const NOT_VARIANT = /^(general|dh|dahua|amcrest|customer|lorex|flir|\d{5,})$/i;

const filenameTokens = (fw: Firmware) =>
  fw.displayName.replace(/\.(bin|zip|rar|img|tar|gz|sw|iav)$/i, "").split("_");

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
        .filter((token) => token !== fw.model && !NOT_VARIANT.test(token) && !tokenSets.every((set) => set.has(token)))
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
}

async function buildData(): Promise<SiteData> {
  const [rawCameras, rawFirmwares] = await Promise.all([
    loadJson<RawCameras>("cameras.json"),
    loadJson<RawFirmwares>("firmware_compatible.json"),
  ]);

  // cameras.json and firmware_compatible.json are both keyed by firmware filename.
  // cameras.json also holds a few placeholders ("ClickHere", "ComingSoon") with no real URL
  // and no compatibility data; those are dropped.
  const filenames = [...new Set([...Object.keys(rawFirmwares), ...Object.keys(rawCameras)])].filter(
    (name) => name in rawFirmwares || validUrl(rawCameras[name]?.url),
  );
  const firmwareSlugs = assignSlugs(filenames);

  const firmwares = new Map<string, Firmware>();
  for (const filename of filenames) {
    const camera = rawCameras[filename];
    const url = validUrl(camera?.url);
    firmwares.set(filename, {
      slug: firmwareSlugs.get(filename)!,
      filename,
      displayName: safeDecode(filename),
      title: "", // filled in below once every firmware is known
      devices: cleanList(rawFirmwares[filename]).sort(),
      models: cleanList(camera?.camera_name).sort(),
      url,
      host: url ? hostOf(url) : null,
      publisher: url ? publisherOf(url) : null,
      notes: cleanList(camera?.notes),
      ...parseFirmwareName(filename),
    });
  }
  const firmwareList = [...firmwares.values()].sort(compareFirmware);
  assignTitles(firmwareList);

  // Invert firmware -> devices / retail models. Iterating the sorted list keeps every
  // per-device firmware list newest-first without re-sorting.
  const deviceFirmwares = new Map<string, string[]>();
  const modelFirmwares = new Map<string, string[]>();
  for (const fw of firmwareList) {
    for (const device of fw.devices) {
      if (!deviceFirmwares.has(device)) deviceFirmwares.set(device, []);
      deviceFirmwares.get(device)!.push(fw.filename);
    }
    for (const model of fw.models) {
      if (!modelFirmwares.has(model)) modelFirmwares.set(model, []);
      modelFirmwares.get(model)!.push(fw.filename);
    }
  }

  // Families: group by name prefix, folding tiny groups into "Other".
  const familyMembers = new Map<string, string[]>();
  for (const name of deviceFirmwares.keys()) {
    const family = deviceFamily(name);
    if (!familyMembers.has(family)) familyMembers.set(family, []);
    familyMembers.get(family)!.push(name);
  }
  for (const [family, members] of [...familyMembers]) {
    if (family !== "OTHER" && members.length < MIN_FAMILY_SIZE) {
      familyMembers.delete(family);
      if (!familyMembers.has("OTHER")) familyMembers.set("OTHER", []);
      familyMembers.get("OTHER")!.push(...members);
    }
  }
  const familySlugs = assignSlugs(familyMembers.keys());
  const families = new Map<string, Family>();
  const familyOf = new Map<string, string>();
  for (const [name, members] of [...familyMembers].sort(([a], [b]) => a.localeCompare(b))) {
    const displayName = name === "OTHER" ? "Other" : name;
    families.set(name, { slug: familySlugs.get(name)!, name: displayName, devices: members.sort() });
    for (const member of members) familyOf.set(member, name);
  }

  const deviceSlugs = assignSlugs(deviceFirmwares.keys());
  const devices = new Map<string, Device>();
  for (const [name, fws] of [...deviceFirmwares].sort(([a], [b]) => a.localeCompare(b))) {
    const family = families.get(familyOf.get(name)!)!;
    devices.set(name, {
      slug: deviceSlugs.get(name)!,
      name,
      family: family.name,
      familySlug: family.slug,
      generic: GENERIC_DEVICES.has(name.toUpperCase()),
      firmwares: fws,
    });
  }

  const modelSlugs = assignSlugs(modelFirmwares.keys());
  const models = new Map<string, RetailModel>();
  for (const [name, fws] of [...modelFirmwares].sort(([a], [b]) => a.localeCompare(b))) {
    const publishers = [...new Set(fws.map((f) => firmwares.get(f)!.publisher).filter((p): p is string => !!p))].sort();
    models.set(name, { slug: modelSlugs.get(name)!, name, publishers, firmwares: fws });
  }

  return { firmwares, devices, models, families, firmwareList };
}

let cached: Promise<SiteData> | undefined;

/** Load and normalize all site data. Fetched once per build and shared by every page. */
export function getData(): Promise<SiteData> {
  cached ??= buildData();
  return cached;
}

/** Firmwares that share the most devices with the given one. */
export function relatedFirmwares(data: SiteData, fw: Firmware, limit = 8): Firmware[] {
  if (fw.devices.length === 0) return [];
  const scores = new Map<string, number>();
  for (const name of fw.devices) {
    const device = data.devices.get(name);
    if (!device || device.generic) continue;
    for (const other of device.firmwares) {
      if (other !== fw.filename) scores.set(other, (scores.get(other) ?? 0) + 1);
    }
  }
  return [...scores]
    .map(([filename, score]) => ({ fw: data.firmwares.get(filename)!, score }))
    .sort((a, b) => b.score - a.score || compareFirmware(a.fw, b.fw))
    .slice(0, limit)
    .map((entry) => entry.fw);
}

export const paths = {
  firmware: (fw: Pick<Firmware, "slug">) => `/firmware/${fw.slug}/`,
  device: (d: Pick<Device, "slug">) => `/device/${d.slug}/`,
  family: (f: Pick<Family, "slug">) => `/device/family/${f.slug}/`,
  model: (m: Pick<RetailModel, "slug">) => `/model/${m.slug}/`,
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

/** Devices that share the most firmware files with the given one. */
export function similarDevices(data: SiteData, device: Device, limit = 12): Device[] {
  if (device.generic) return [];
  const scores = new Map<string, number>();
  for (const filename of device.firmwares) {
    for (const other of data.firmwares.get(filename)!.devices) {
      if (other !== device.name) scores.set(other, (scores.get(other) ?? 0) + 1);
    }
  }
  return [...scores]
    .map(([name, score]) => ({ device: data.devices.get(name)!, score }))
    .filter((entry) => !entry.device.generic)
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

/** Firmwares grouped by build year (newest year first), with undated files last. */
export function firmwaresByYear(data: SiteData): { year: string; firmwares: Firmware[] }[] {
  const groups = new Map<string, Firmware[]>();
  for (const fw of data.firmwareList) {
    const year = fw.buildDate?.slice(0, 4) ?? UNDATED;
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year)!.push(fw);
  }
  return [...groups].map(([year, firmwares]) => ({ year, firmwares }));
}

/** Short brand name for display, e.g. "Redline (GSS)" → "Redline". */
export const brandName = (publisher: string) => publisher.replace(/ \(.*\)$/, "");
