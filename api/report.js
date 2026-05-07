/**
 * Vercel サーバーレス関数 — Supabase プロキシ
 * Supabaseの認証情報はサーバー側の環境変数にのみ保存し、
 * クライアントには一切公開しません。
 *
 * GET  /api/report?id=UUID  → Supabaseからレポートデータを取得
 * POST /api/report          → Supabaseにレポートデータを保存
 */
module.exports = async function handler(req, res) {
  // 同一オリジンのみ許可
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({
      error: 'サーバーのSupabase設定が未完了です。管理者にお問い合わせください。'
    });
  }

  const headers = {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
  };

  // ── GET: レポート取得 ──────────────────────────────
  if (req.method === 'GET') {
    const id = req.query && req.query.id;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ error: '無効なIDです' });
    }
    try {
      const r = await fetch(
        `${supabaseUrl}/rest/v1/reports?id=eq.${encodeURIComponent(id)}&select=data`,
        { headers }
      );
      if (!r.ok) {
        return res.status(r.status).json({ error: `データ取得失敗 (${r.status})` });
      }
      const rows = await r.json();
      if (!rows.length) {
        return res.status(404).json({ error: 'データが見つかりません（IDが無効か削除済みです）' });
      }
      return res.status(200).json(rows[0].data);
    } catch (e) {
      return res.status(500).json({ error: `接続失敗: ${e.message}` });
    }
  }

  // ── POST: レポート保存 ────────────────────────────
  if (req.method === 'POST') {
    const data = req.body;
    if (!data || data.version !== 1) {
      return res.status(400).json({ error: '無効なデータ形式です' });
    }
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/reports`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({ data }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => String(r.status));
        return res.status(r.status).json({ error: `保存失敗 (${r.status}): ${text}` });
      }
      const [record] = await r.json();
      return res.status(200).json({ id: record.id });
    } catch (e) {
      return res.status(500).json({ error: `接続失敗: ${e.message}` });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
