export const SITE_NAME = "Dahua Firmware Finder";
export const SITE_TAGLINE = "Find firmware that may be compatible with your Dahua, Amcrest or Lorex device";
export const CONTACT_URL = "https://ipcamtalk.com/members/deathcamel57.206868/";
export const DATA_REPO_URL = "https://github.com/DeathCamel58/amcrest-compatible-finder";
export const SITE_REPO_URL = "https://github.com/DeathCamel58/dahua-firmware-compatible-site";

export const nav = [
  { name: "Devices", href: "/device/" },
  { name: "Firmware", href: "/firmware/" },
  { name: "Amcrest models", href: "/amcrest/" },
  { name: "How to", href: "/#how-to" },
];

export const plural = (count: number, word: string, pluralWord = `${word}s`) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? word : pluralWord}`;
