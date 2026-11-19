// Placing opportunities on the map. Location names (never anything about you) are looked up with
// OpenStreetMap's Nominatim service, at most one request per second, and cached on this Mac.
// Turn this off in Settings › Map and set positions by hand instead.
import path from 'node:path';
import { JsonFile } from './store.mjs';
import config from '../config.mjs';
import { fieldText } from '../shared/schema.mjs';

export class Geocoder {
  constructor({ dir, fetchImpl = globalThis.fetch }) {
    this.cache = new JsonFile(path.join(dir, 'geocache.json'), { version: 1, entries: {} });
    this.fetchImpl = fetchImpl;
    this.last = 0;
    this.queue = Promise.resolve();
  }

  static queryFor(opp) {
    const loc = fieldText('location', opp.fields?.location).replace(/\b(online|virtual|remote|hybrid)\b/gi, '').replace(/\s+/g, ' ').trim();
    if (!loc || loc.length < 3) return null;
    return loc.replace(/^[,\s-]+|[,\s-]+$/g, '').slice(0, 120);
  }

  lookup(query) {
    const key = query.toLowerCase();
    if (key in this.cache.data.entries) return Promise.resolve(this.cache.data.entries[key]);
    // One request at a time, one per second (Nominatim's usage policy).
    this.queue = this.queue.catch(() => null).then(async () => {
      if (key in this.cache.data.entries) return this.cache.data.entries[key];
      const wait = this.last + 1100 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      const url = `${process.env.ATELIER_GEOCODE_ENDPOINT || config.geocoding.endpoint}?format=jsonv2&limit=1&addressdetails=0&q=${encodeURIComponent(query)}`;
      const res = await this.fetchImpl(url, { headers: { 'User-Agent': config.geocoding.userAgent, 'Accept-Language': 'en' } });
      if (!res.ok) throw new Error(`Map lookup failed (${res.status})`);
      const list = await res.json();
      const hit = list?.[0];
      const entry = hit ? { lat: Number(hit.lat), lon: Number(hit.lon), label: hit.display_name, type: hit.addresstype || hit.type, at: new Date().toISOString() } : null;
      this.cache.data.entries[key] = entry;
      this.cache.save();
      return entry;
    });
    return this.queue;
  }

  flush() {
    if (this.cache.pending) this.cache.flush();
  }
}
