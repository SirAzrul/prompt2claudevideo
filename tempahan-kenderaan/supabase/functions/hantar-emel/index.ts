// Edge Function: hantar emel notifikasi.
// Dicetus oleh Database Webhook (INSERT pada jadual public.notifikasi).
//
// Secret yang diperlukan (supabase secrets set ...):
//   WEBHOOK_SECRET   - nilai yang sama dengan header x-webhook-secret pada webhook
//   RESEND_API_KEY   - kunci API Resend (atau tukar fungsi hantar() untuk SMTP)
//   EMEL_PENGHANTAR  - cth: "Tempahan Kenderaan <tempahan@domain-anda.my>"
//   APP_URL          - URL laman Netlify, tanpa slash di hujung
// SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY disediakan oleh Supabase secara automatik.
//
// Deploy dengan --no-verify-jwt kerana pengesahan dibuat melalui WEBHOOK_SECRET.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

async function hantar(kepada: string[], subjek: string, html: string) {
  if (!kepada.length) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("EMEL_PENGHANTAR"),
      to: kepada,
      subject: subjek,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

async function emelUntuk(peranan: string, id?: string | null): Promise<string[]> {
  let q = supabase.from("profiles").select("emel").eq("peranan", peranan).eq("aktif", true);
  if (id) q = q.eq("id", id);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((p) => p.emel);
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return new Response("Tidak dibenarkan", { status: 401 });
  }
  const { record } = await req.json();
  if (!record?.id) return new Response("Payload tidak sah", { status: 400 });

  try {
    const { data: r, error } = await supabase
      .from("requests")
      .select("*, pemohon:profiles!requests_pemohon_id_fkey(emel, nama)")
      .eq("id", record.request_id)
      .single();
    if (error) throw error;

    const pautan = `${Deno.env.get("APP_URL")}/#/permohonan/${r.id}`;
    const ringkas = `
      <p><b>No. rujukan:</b> ${esc(r.no_rujukan)}<br>
      <b>Pemohon:</b> ${esc(r.pemohon.nama)}<br>
      <b>Tujuan:</b> ${esc(r.tujuan)}<br>
      <b>Destinasi:</b> ${esc(r.destinasi)}<br>
      <b>Tarikh:</b> ${fmt(r.tarikh_mula)} hingga ${fmt(r.tarikh_tamat)}</p>
      <p><a href="${esc(pautan)}">Buka permohonan</a></p>`;

    let kepada: string[] = [];
    let subjek = "";
    let isi = "";

    switch (record.jenis) {
      case "diterima":
        kepada = [r.pemohon.emel];
        subjek = `Permohonan diterima (${r.no_rujukan})`;
        isi = `<p>Permohonan anda telah diterima. Simpan nombor rujukan untuk semakan status.</p>${ringkas}`;
        break;
      case "tugasan_penyemak":
        kepada = await emelUntuk("penyemak", r.penyemak_id);
        subjek = `Tugasan semakan baharu (${r.no_rujukan})`;
        isi = `<p>Ada permohonan yang menunggu semakan anda.</p>${ringkas}`;
        break;
      case "dipulangkan":
        kepada = [r.pemohon.emel];
        subjek = `Permohonan dipulangkan untuk pembetulan (${r.no_rujukan})`;
        isi = `<p>Permohonan anda perlu dibetulkan sebelum
          ${r.tarikh_akhir_pembetulan ? fmt(r.tarikh_akhir_pembetulan) : "tarikh yang ditetapkan"}.</p>
          <p><b>Catatan penyemak:</b> ${esc(r.catatan_semakan)}</p>${ringkas}`;
        break;
      case "tugasan_pelulus":
        kepada = await emelUntuk("pelulus");
        subjek = `Menunggu kelulusan (${r.no_rujukan})`;
        isi = `<p>Ada permohonan yang menunggu keputusan anda.</p>${ringkas}`;
        break;
      case "keputusan":
        kepada = [r.pemohon.emel];
        if (r.status === "diluluskan") {
          subjek = `Permohonan diluluskan (${r.no_rujukan})`;
          isi = `<p>Permohonan anda diluluskan.</p>${ringkas}`;
        } else {
          subjek = `Permohonan tidak diluluskan (${r.no_rujukan})`;
          isi = `<p>Permohonan anda tidak diluluskan.</p>
            <p><b>Sebab:</b> ${esc(r.sebab_tolak)}</p>${ringkas}`;
        }
        break;
      case "dibatalkan":
        kepada = [r.pemohon.emel];
        subjek = `Permohonan dibatalkan (${r.no_rujukan})`;
        isi = `<p>Permohonan telah dibatalkan.</p>${ringkas}`;
        break;
      case "tamat_tempoh":
        kepada = [r.pemohon.emel];
        subjek = `Permohonan tamat tempoh (${r.no_rujukan})`;
        isi = `<p>Permohonan ditutup kerana pembetulan tidak dihantar dalam tempoh yang ditetapkan.
          Sila buat permohonan baharu jika masih perlu.</p>${ringkas}`;
        break;
      default:
        throw new Error(`Jenis notifikasi tidak dikenali: ${record.jenis}`);
    }

    await hantar(kepada, subjek, isi);
    await supabase.from("notifikasi")
      .update({ dihantar_pada: new Date().toISOString(), ralat: null })
      .eq("id", record.id);
    return new Response("OK");
  } catch (e) {
    await supabase.from("notifikasi")
      .update({ ralat: String(e).slice(0, 500) })
      .eq("id", record.id);
    return new Response("Gagal hantar emel", { status: 500 });
  }
});
