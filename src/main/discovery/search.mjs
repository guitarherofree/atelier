// Searching beyond your sources. Three ways, chosen in Settings › Search:
//   browser  opens the search in the Atelier browser (nothing sent anywhere except the search engine you pick)
//   brave    Brave Search API with your own key
//   claude   Claude with web search (needs the Claude API provider in Settings › AI)
import { aiSearch } from '../aitasks.mjs';

export const ENGINES = {
  duckduckgo: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  bing: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  brave: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}`,
};

export function suggestedQueries(profile, year = new Date().getFullYear() + 1) {
  const disc = (profile?.disciplines || []).slice(0, 3);
  const themes = (profile?.themes || []).slice(0, 2);
  const out = [];
  for (const d of disc.length ? disc : ['artist']) {
    out.push(`${d.toLowerCase()} residency open call ${year}`);
    out.push(`funded ${d.toLowerCase()} residency ${year} no application fee`);
    out.push(`grant for ${d.toLowerCase()} artists ${year} deadline`);
  }
  out.splice(3, 0, `time and space artist residency ${year} self-directed no required output`);
  for (const t of themes) out.push(`artist residency ${t.toLowerCase()} ${year}`);
  if (profile?.basedIn) out.push(`artist grant ${profile.basedIn.split(',').slice(-2).join(' ').trim()} ${year}`);
  return [...new Set(out)].slice(0, 8);
}

export async function braveSearch({ query, key, fetchImpl = globalThis.fetch }) {
  const res = await fetchImpl(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20&safesearch=moderate`, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': key },
  });
  if (res.status === 401 || res.status === 403) throw new Error('Brave Search rejected the key. Check it in Settings › Search.');
  if (res.status === 429) throw new Error('Brave Search rate limit reached. Try again later.');
  if (!res.ok) throw new Error(`Brave Search returned ${res.status}.`);
  const json = await res.json();
  return (json?.web?.results || []).map((r) => ({ title: r.title, url: r.url, snippet: (r.description || '').replace(/<[^>]+>/g, ''), age: r.age || r.page_age || '' }));
}

export async function runSearch({ query, provider, db, keychain, assistant, knownUrls = [] }) {
  if (!query?.trim()) throw new Error('Type something to search for.');
  if (provider === 'brave') {
    const key = await keychain.get('brave');
    if (!key) throw new Error('Add a Brave Search API key in Settings › Search, or search in the Atelier browser.');
    return { provider, results: await braveSearch({ query, key }) };
  }
  if (provider === 'claude') {
    if (assistant.provider !== 'anthropic') throw new Error('Searching with Claude needs the Claude API provider in Settings › AI.');
    const r = await aiSearch(assistant, { query, profile: db.profile, exclude: knownUrls });
    return { provider, results: r.results, sources: r.sources };
  }
  const engine = ENGINES[db.settings.search.engine] || ENGINES.duckduckgo;
  return { provider: 'browser', openUrl: engine(query), results: [] };
}
