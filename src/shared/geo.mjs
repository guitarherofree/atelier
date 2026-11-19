// Place names used to read locations and eligibility rules. Plain data, no lookups over the network.

const REGION_COUNTRIES = {
  'North America': ['United States', 'Canada', 'Mexico'],
  'Latin America & Caribbean': [
    'Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Costa Rica', 'Cuba', 'Dominican Republic', 'Ecuador', 'El Salvador',
    'Guatemala', 'Haiti', 'Honduras', 'Jamaica', 'Nicaragua', 'Panama', 'Paraguay', 'Peru', 'Puerto Rico', 'Trinidad and Tobago',
    'Uruguay', 'Venezuela', 'Bahamas', 'Barbados', 'Belize', 'Guyana', 'Suriname',
  ],
  Europe: [
    'Albania', 'Andorra', 'Armenia', 'Austria', 'Azerbaijan', 'Belarus', 'Belgium', 'Bosnia and Herzegovina', 'Bulgaria', 'Croatia',
    'Cyprus', 'Czech Republic', 'Denmark', 'Estonia', 'Finland', 'France', 'Georgia (country)', 'Germany', 'Greece', 'Hungary',
    'Iceland', 'Ireland', 'Italy', 'Kosovo', 'Latvia', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Malta', 'Moldova', 'Monaco',
    'Montenegro', 'Netherlands', 'North Macedonia', 'Norway', 'Poland', 'Portugal', 'Romania', 'Russia', 'San Marino', 'Serbia',
    'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland', 'Turkey', 'Ukraine', 'United Kingdom',
  ],
  'Middle East': ['Bahrain', 'Egypt', 'Iran', 'Iraq', 'Israel', 'Jordan', 'Kuwait', 'Lebanon', 'Oman', 'Palestine', 'Qatar', 'Saudi Arabia', 'Syria', 'United Arab Emirates', 'Yemen'],
  Africa: [
    'Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi', 'Cameroon', 'Cape Verde', 'Côte d’Ivoire', 'DR Congo',
    'Ethiopia', 'Gabon', 'Gambia', 'Ghana', 'Guinea', 'Kenya', 'Lesotho', 'Liberia', 'Madagascar', 'Malawi', 'Mali', 'Mauritania',
    'Mauritius', 'Morocco', 'Mozambique', 'Namibia', 'Niger', 'Nigeria', 'Rwanda', 'Senegal', 'Sierra Leone', 'Somalia',
    'South Africa', 'South Sudan', 'Sudan', 'Tanzania', 'Togo', 'Tunisia', 'Uganda', 'Zambia', 'Zimbabwe',
  ],
  Asia: [
    'Afghanistan', 'Bangladesh', 'Bhutan', 'Cambodia', 'China', 'Hong Kong', 'India', 'Indonesia', 'Japan', 'Kazakhstan',
    'Kyrgyzstan', 'Laos', 'Macau', 'Malaysia', 'Maldives', 'Mongolia', 'Myanmar', 'Nepal', 'Pakistan', 'Philippines', 'Singapore',
    'South Korea', 'Sri Lanka', 'Taiwan', 'Tajikistan', 'Thailand', 'Timor-Leste', 'Uzbekistan', 'Vietnam',
  ],
  Oceania: ['Australia', 'New Zealand', 'Fiji', 'Papua New Guinea', 'Samoa', 'Tonga'],
};

export const REGIONS = Object.keys(REGION_COUNTRIES);

export const COUNTRIES = Object.entries(REGION_COUNTRIES).flatMap(([region, names]) => names.map((name) => ({ name: name.replace(' (country)', ''), region, georgia: name === 'Georgia (country)' })));

// Other ways a country is written on opportunity pages.
const ALIASES = {
  'United States': ['USA', 'U.S.A.', 'U.S.', 'US', 'United States of America'],
  'United Kingdom': ['UK', 'U.K.', 'Great Britain', 'Britain', 'England', 'Scotland', 'Wales', 'Northern Ireland'],
  Netherlands: ['The Netherlands', 'Holland'],
  'Czech Republic': ['Czechia'],
  'South Korea': ['Korea', 'Republic of Korea'],
  'United Arab Emirates': ['UAE'],
  'DR Congo': ['Democratic Republic of the Congo', 'DRC'],
  'Côte d’Ivoire': ["Cote d'Ivoire", 'Ivory Coast'],
  Turkey: ['Türkiye', 'Turkiye'],
  Mexico: ['México'],
  Spain: ['España'],
  Germany: ['Deutschland'],
};

export const US_STATES = [
  ['Alabama', 'AL'], ['Alaska', 'AK'], ['Arizona', 'AZ'], ['Arkansas', 'AR'], ['California', 'CA'], ['Colorado', 'CO'],
  ['Connecticut', 'CT'], ['Delaware', 'DE'], ['Florida', 'FL'], ['Georgia', 'GA'], ['Hawaii', 'HI'], ['Idaho', 'ID'],
  ['Illinois', 'IL'], ['Indiana', 'IN'], ['Iowa', 'IA'], ['Kansas', 'KS'], ['Kentucky', 'KY'], ['Louisiana', 'LA'],
  ['Maine', 'ME'], ['Maryland', 'MD'], ['Massachusetts', 'MA'], ['Michigan', 'MI'], ['Minnesota', 'MN'], ['Mississippi', 'MS'],
  ['Missouri', 'MO'], ['Montana', 'MT'], ['Nebraska', 'NE'], ['Nevada', 'NV'], ['New Hampshire', 'NH'], ['New Jersey', 'NJ'],
  ['New Mexico', 'NM'], ['New York', 'NY'], ['North Carolina', 'NC'], ['North Dakota', 'ND'], ['Ohio', 'OH'], ['Oklahoma', 'OK'],
  ['Oregon', 'OR'], ['Pennsylvania', 'PA'], ['Rhode Island', 'RI'], ['South Carolina', 'SC'], ['South Dakota', 'SD'],
  ['Tennessee', 'TN'], ['Texas', 'TX'], ['Utah', 'UT'], ['Vermont', 'VT'], ['Virginia', 'VA'], ['Washington', 'WA'],
  ['West Virginia', 'WV'], ['Wisconsin', 'WI'], ['Wyoming', 'WY'], ['District of Columbia', 'DC'],
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One matcher per place: [canonical name, kind, region, regex]
const MATCHERS = [];
for (const c of COUNTRIES) {
  if (c.georgia) continue; // "Georgia" is matched as the US state unless written "Georgia (country)" / Tbilisi
  const names = [c.name, ...(ALIASES[c.name] || [])];
  const short = names.filter((n) => n.length <= 4 && /^[A-Z.]+$/.test(n));
  const long = names.filter((n) => !short.includes(n));
  const parts = long.map(escape);
  // Short uppercase abbreviations (USA, UK, UAE) must match case-sensitively.
  if (parts.length) MATCHERS.push([c.name, 'country', c.region, new RegExp(`(?<![\\p{L}])(${parts.join('|')})(?![\\p{L}])`, 'iu')]);
  if (short.length) MATCHERS.push([c.name, 'country', c.region, new RegExp(`(?<![\\p{L}.])(${short.map(escape).join('|')})(?![\\p{L}])(?!\\s*([Dd]ollars?|\\$|[Cc]ents))`, 'u')]);
}
for (const [name, abbr] of US_STATES) {
  MATCHERS.push([name, 'state', 'North America', new RegExp(`(?<![\\p{L}])${escape(name)}(?![\\p{L}])`, 'iu')]);
  MATCHERS.push([name, 'state', 'North America', new RegExp(`,\\s*${abbr}(?![\\p{L}])`, 'u')]);
}
MATCHERS.push(['Georgia (country)', 'country', 'Europe', /Tbilisi|Georgia \(country\)|Republic of Georgia/i]);

/** Countries and US states mentioned in a piece of text. */
export function findPlaces(text) {
  const s = String(text || '');
  const out = [];
  const seen = new Set();
  for (const [name, kind, region, re] of MATCHERS) {
    if (seen.has(name)) continue;
    const m = re.exec(s);
    if (m) {
      seen.add(name);
      out.push({ name, kind, region, index: m.index });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

export function regionOf(placeName) {
  if (!placeName) return null;
  if (US_STATES.some(([n]) => n === placeName)) return 'North America';
  const c = COUNTRIES.find((x) => x.name === placeName || (x.georgia && placeName === 'Georgia (country)'));
  return c?.region || null;
}

/** True if a place you list (country or state) satisfies a place an opportunity mentions. */
export function placeMatches(yours, theirs) {
  if (!yours || !theirs) return false;
  if (yours === theirs) return true;
  // A US state satisfies "United States"; "United States" alone doesn't satisfy a specific state.
  if (theirs === 'United States' && US_STATES.some(([n]) => n === yours)) return true;
  // Regions: "Europe", "North America" …
  if (REGIONS.includes(theirs)) return regionOf(yours) === theirs;
  return false;
}

export function canonicalPlaces(list) {
  const out = new Set();
  for (const item of list || []) {
    for (const p of findPlaces(item)) out.add(p.name);
    if (REGIONS.includes(item)) out.add(item);
  }
  return [...out];
}
