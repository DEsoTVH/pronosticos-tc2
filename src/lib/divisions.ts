// Códigos de división de Boxerbook → nombre en español (de menor a mayor peso).
export const DIVISIONS: { code: string; name: string }[] = [
  { code: "min", name: "Minimosca" },
  { code: "lfly", name: "Mosca ligero" },
  { code: "fly", name: "Mosca" },
  { code: "sfly", name: "Supermosca" },
  { code: "ban", name: "Gallo" },
  { code: "sban", name: "Supergallo" },
  { code: "fea", name: "Pluma" },
  { code: "sfea", name: "Superpluma" },
  { code: "lig", name: "Ligero" },
  { code: "slig", name: "Superligero" },
  { code: "wel", name: "Welter" },
  { code: "swel", name: "Superwelter" },
  { code: "mid", name: "Mediano" },
  { code: "smid", name: "Supermediano" },
  { code: "lhea", name: "Semipesado" },
  { code: "cru", name: "Crucero" },
  { code: "bri", name: "Bridgerweight" },
  { code: "hea", name: "Pesado" },
];

// Femeninas: mismo código con prefijo w_ (w_cru no existe en Boxerbook).
export const WOMEN_DIVISIONS = [
  { code: "w_atom", name: "Átomo" },
  ...DIVISIONS.filter((d) => d.code !== "cru" && d.code !== "bri").map((d) => ({
    code: `w_${d.code}`,
    name: d.name,
  })),
];

export const ALL_DIVISION_CODES = [
  ...DIVISIONS.map((d) => d.code),
  ...WOMEN_DIVISIONS.map((d) => d.code),
];

export function divisionName(code: string | null) {
  if (!code) return null;
  const all = [...DIVISIONS, ...WOMEN_DIVISIONS];
  const found = all.find((d) => d.code === code);
  if (!found) return code;
  return code.startsWith("w_") ? `${found.name} (F)` : found.name;
}

// "CL" → 🇨🇱
export function flag(country: string | null) {
  if (!country || country.length !== 2) return "";
  return String.fromCodePoint(
    ...country.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}
