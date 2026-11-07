import type { HwCode, HwDecoded } from "./raw";

/** A labelled hardware fact for the device-page hardware box. */
export interface HardwareRow {
  label: string;
  value: string;
}

// Only named codes are shown; an unmapped code (name null) is left to the raw-line disclosure, not a noisy "Unknown (0x..)" row.
const codeName = (c: HwCode | undefined): string | null => c?.name ?? null;
const yesNo = (b: boolean | undefined): string | null => (b === undefined ? null : b ? "Yes" : "No");

const cpuLabel = (mhz: number[] | undefined): string | null => {
  if (!mhz?.length) return null;
  return mhz.length > 1 ? `${mhz.length}× ${mhz.join(" / ")} MHz` : `${mhz[0]} MHz`;
};

/**
 * The hardware worth showing a camera owner, in display order. The pipeline only emits fields it rates
 * reliable, so every present field is shown; the uncertain ones live in the raw line behind a disclosure.
 * `socOverride` is the firmware's boot/kernel-detected SoC, preferred over the line's field 5 when known.
 */
export function hardwareRows(d: HwDecoded, socOverride?: string | null): HardwareRow[] {
  const videoOut = d.videoOut && d.videoOut.code !== "00" ? codeName(d.videoOut) : null;
  const pairs: [string, string | null][] = [
    ["Type", codeName(d.category)],
    ["Form factor", codeName(d.formFactor)],
    ["Sensor", codeName(d.sensor)],
    ["SoC", socOverride || codeName(d.soc)],
    ["Video channels", d.videoChannels && d.videoChannels > 1 ? String(d.videoChannels) : null],
    ["CPU", cpuLabel(d.cpuMhz)],
    ["RAM", d.ramMiB ? `${d.ramMiB} MiB` : null],
    ["Wi-Fi", yesNo(d.wifi)],
    ["microSD", yesNo(d.microSD)],
    ["Audio in", yesNo(d.audioIn)],
    ["Audio out", yesNo(d.audioOut)],
    ["Video out", videoOut],
  ];
  return pairs.filter((p): p is [string, string] => p[1] !== null).map(([label, value]) => ({ label, value }));
}

/** A stable key over the displayed fields, so different hardware revisions of one device can be told apart. */
export function variantKey(d: HwDecoded, socOverride?: string | null): string {
  return hardwareRows(d, socOverride)
    .map((r) => `${r.label}=${r.value}`)
    .join("|");
}
