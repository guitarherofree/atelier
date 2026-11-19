// RSS and Atom feeds as opportunity sources.
import { XMLParser } from 'fast-xml-parser';
import { clean } from '../extract/html.mjs';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text', cdataPropName: false, processEntities: true });

const text = (v) => {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  return String(v['#text'] ?? '');
};

const stripTags = (s) => clean(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' '));

export function looksLikeFeed(body) {
  return /^\s*(<\?xml[^>]*>\s*)?<(rss|feed|rdf:RDF)\b/i.test(String(body || '').slice(0, 500));
}

/** @returns {Array<{ title, url, summary, published }>} */
export function parseFeed(xml) {
  let doc;
  try { doc = parser.parse(xml); } catch { return []; }
  const out = [];
  const channel = doc?.rss?.channel || doc?.['rdf:RDF'];
  const items = channel ? [].concat(channel.item || doc?.['rdf:RDF']?.item || []) : [].concat(doc?.feed?.entry || []);
  for (const it of items) {
    let link = text(it.link);
    if (!link && it.link) {
      const links = [].concat(it.link);
      link = (links.find((l) => !l['@rel'] || l['@rel'] === 'alternate') || links[0])?.['@href'] || '';
    }
    const summary = stripTags(text(it['content:encoded']) || text(it.description) || text(it.content) || text(it.summary));
    out.push({ title: clean(text(it.title)), url: link.trim(), summary, published: text(it.pubDate || it.published || it.updated || it['dc:date']) });
  }
  return out.filter((x) => x.url);
}
