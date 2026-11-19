// Instagram hashtag search through Meta's Graph API. Optional: it needs an Instagram professional
// account, a Meta app approved for "Instagram Public Content Access", and an access token.
// Meta limits each account to 30 different hashtags per 7 days, and recent_media covers the last 24 hours.
export class Instagram {
  constructor({ db, keychain, fetchImpl = globalThis.fetch }) {
    this.db = db;
    this.keychain = keychain;
    this.fetchImpl = fetchImpl;
  }

  async #get(path, params) {
    const s = this.db.settings.instagram;
    const token = await this.keychain.get('instagram');
    if (!token) throw Object.assign(new Error('Add an Instagram Graph API token in Settings › Instagram.'), { kind: 'needs-login' });
    if (!s.igUserId) throw Object.assign(new Error('Add your Instagram professional account ID in Settings › Instagram.'), { kind: 'needs-login' });
    const qs = new URLSearchParams({ ...params, user_id: s.igUserId, access_token: token });
    const res = await this.fetchImpl(`https://graph.facebook.com/${s.apiVersion || 'v23.0'}/${path}?${qs}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      const msg = json.error?.message || `HTTP ${res.status}`;
      const hint = /permission|feature|review/i.test(msg) ? ' Your Meta app needs approval for Instagram Public Content Access.' : '';
      throw Object.assign(new Error(`Instagram: ${msg}.${hint}`), { kind: res.status === 401 || res.status === 190 ? 'needs-login' : 'blocked' });
    }
    return json;
  }

  async recentMedia({ hashtags = ['artistresidency'] } = {}) {
    const out = [];
    const ids = this.db.state.data.instagramHashtagIds || (this.db.state.data.instagramHashtagIds = {});
    for (const raw of hashtags) {
      const tag = String(raw).replace(/^#/, '').trim().toLowerCase();
      if (!tag) continue;
      if (!ids[tag]) {
        const found = await this.#get('ig_hashtag_search', { q: tag });
        ids[tag] = found.data?.[0]?.id;
        this.db.state.save();
      }
      if (!ids[tag]) continue;
      const media = await this.#get(`${ids[tag]}/recent_media`, { fields: 'id,caption,permalink,timestamp,media_type', limit: '50' });
      for (const m of media.data || []) if (m.permalink && m.caption) out.push({ ...m, hashtag: tag });
    }
    return out;
  }
}
