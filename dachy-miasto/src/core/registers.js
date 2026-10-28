// Interpretation of municipal register data joined by scripts/fetch-registers.mjs.
// These are planning signals for a first screening, not legal findings.

// Kraków is a city with county rights: parcels of Gmina Kraków and Powiat Kraków (grodzki) are both city land.
export const CITY_GROUPS = Object.freeze(['municipal', 'municipalShared', 'county']);

/** Ownership description from the MSIP layer → group. Perpetual usufruct usually means the building belongs to the usufructuary. */
export function ownershipGroup(description) {
  const value = typeof description === 'string' ? description.trim() : '';
  if (!value) return null;
  if (/^Gmina Kraków\s*-\s*współwłasność/i.test(value)) return 'municipalShared';
  if (/^Gmina Kraków\s*-\s*właściciel/i.test(value)) {
    if (/wieczyst/i.test(value)) return 'municipalLease';
    if (/inni właściciele/i.test(value)) return 'municipalShared';
    return 'municipal';
  }
  if (/^Powiat Kraków/i.test(value)) return /wieczyst/i.test(value) ? 'municipalLease' : 'county';
  if (/Skarb Państwa/i.test(value)) return 'state';
  return 'other';
}

/** True / false when register data is present for the roof; undefined when it was not loaded. */
export function isCityLand(roof) {
  if (!('ownership' in roof)) return undefined;
  return CITY_GROUPS.includes(roof.ownership?.group);
}

/**
 * Heritage signals, strongest first. 'permit' needs a conservator's permit for works on the building or in the area;
 * 'opinion' means the municipal inventory or a protected zone where the conservator should be consulted.
 */
export function heritageFlags(roof) {
  const flags = [];
  if (roof.monument?.kind === 'register') flags.push({ key: 'register', level: 'permit', label: roof.monument.number });
  if (roof.urbanLayout) flags.push({ key: 'urbanLayout', level: 'permit', label: roof.urbanLayout });
  if (roof.culturalPark) flags.push({ key: 'culturalPark', level: 'permit', label: roof.culturalPark });
  if (roof.unesco === 'area') flags.push({ key: 'unesco', level: 'permit', label: null });
  if (roof.monument?.kind === 'inventory') flags.push({ key: 'inventory', level: 'opinion', label: roof.monument.address });
  if (roof.heritageArea) flags.push({ key: 'heritageArea', level: 'opinion', label: null });
  if (roof.unesco === 'buffer') flags.push({ key: 'unescoBuffer', level: 'opinion', label: null });
  return flags;
}

export const needsConservator = roof => heritageFlags(roof).some(flag => flag.level === 'permit');
