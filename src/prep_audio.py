"""Analisis narration.wav: potong jeda panjang, anggar masa setiap perkataan, tulis build/timing.json."""
import json, wave
import numpy as np

SR_FRAME = 0.01
MIN_GAP = 0.18      # jeda minimum yang dikira
NEW_GAP = 0.12      # jeda baru (saat) selepas dipendekkan
HEAD, TAIL, TOTAL = 0.35, 0.0, 30.0

PHRASES = [
 ("p1",  "Claude* boleh membantu kita bekerja dengan lebih bijak*"),
 ("p2",  "tetapi penggunaannya perlu dilakukan dengan cara yang betul*"),
 ("p3a", "Pertama* berikan arahan yang jelas* dan spesifik*"),
 ("p3b", "supaya Claude memahami hasil yang kita mahukan"),
 ("p4a", "Kedua* berikan konteks* yang mencukupi"),
 ("p4b", "seperti tujuan* sasaran pengguna* dan format output* yang diperlukan"),
 ("p5a", "Ketiga* semak semula* setiap hasil yang dijana"),
 ("p5b", "Jangan terus terima bulat-bulat kerana AI* juga boleh melakukan kesilapan*"),
 ("p6a", "Ingat gunakan Claude sebagai rakan* berfikir*"),
 ("p6b", "bukan pengganti* pemikiran kita"),
]
SYL = {"claude":1.5,"boleh":2,"membantu":3,"kita":2,"bekerja":3,"dengan":2,"lebih":2,"bijak":2,
 "tetapi":3,"penggunaannya":5,"perlu":2,"dilakukan":4,"cara":2,"yang":1,"betul":2,"pertama":3,
 "berikan":3,"arahan":3,"jelas":2,"dan":1,"spesifik":3,"supaya":3,"memahami":4,"hasil":2,"mahukan":3,
 "kedua":3,"konteks":2,"mencukupi":4,"seperti":3,"tujuan":3,"sasaran":3,"pengguna":3,"format":2,
 "output":2,"diperlukan":4,"ketiga":3,"semak":2,"semula":3,"setiap":3,"dijana":3,"jangan":2,"terus":2,
 "terima":3,"bulat-bulat":4,"kerana":3,"ai":2,"juga":2,"melakukan":4,"kesilapan":4,"ingat":2,
 "gunakan":3,"sebagai":3,"rakan":2,"berfikir":3,"bukan":2,"pengganti":4,"pemikiran":4}

w = wave.open("assets/narration.wav"); sr = w.getframerate()
x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
hop = int(sr * SR_FRAME)
n = len(x) // hop
rms = np.sqrt((x[: n*hop].reshape(n, hop) ** 2).mean(1))
db = 20 * np.log10(rms + 1e-9)
quiet = db < -35

# cari jeda
gaps, i = [], 0
while i < n:
    if quiet[i]:
        j = i
        while j < n and quiet[j]: j += 1
        if (j - i) * SR_FRAME >= MIN_GAP: gaps.append([i*SR_FRAME, j*SR_FRAME])
        i = j
    else: i += 1
lead = gaps[0][1] if gaps and gaps[0][0] == 0 else 0
tail_start = gaps[-1][0] if gaps and gaps[-1][1] >= n*SR_FRAME - 0.02 else n*SR_FRAME
inner = [g for g in gaps if g[0] > 0.01 and g[1] < n*SR_FRAME - 0.02]

# bina audio baru: HEAD + (suara + jeda pendek) ...
segs, cur = [], lead
for g in inner:
    segs.append((cur, g[0])); cur = g[1]
segs.append((cur, tail_start))
pad = lambda s: np.zeros(int(sr*s), np.float32)
out, newt, t = [pad(HEAD)], [], HEAD
for k, (a, b) in enumerate(segs):
    chunk = x[int(a*sr):int(b*sr)].copy()
    f = int(0.004*sr); chunk[:f] *= np.linspace(0,1,f); chunk[-f:] *= np.linspace(1,0,f)
    out.append(chunk); newt.append((t, t + len(chunk)/sr)); t += len(chunk)/sr
    if k < len(segs)-1: out.append(pad(NEW_GAP)); t += NEW_GAP
speech_end = t
out.append(pad(max(0, TOTAL - t)))
y = np.concatenate(out)[: int(TOTAL*sr)]
with wave.open("build/narration_30.wav", "wb") as o:
    o.setnchannels(1); o.setsampwidth(2); o.setframerate(sr)
    o.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
print("speech selesai pada", round(speech_end, 2), "s; segmen suara:", len(segs))

# anggar masa perkataan: garis masa "voiced" dengan syllable-weight
words = []
for pid, txt in PHRASES:
    for tok in txt.split():
        key = tok.endswith("*"); clean = tok.rstrip("*")
        words.append(dict(phrase=pid, w=clean, key=key, syl=SYL[clean.lower()]))
tot = sum(wd["syl"] for wd in words)
voiced = sum(b-a for a,b in newt)
def v2t(v):  # voiced-offset -> masa sebenar
    for a,b in newt:
        if v <= b-a: return a+v
        v -= b-a
    return newt[-1][1]
# sempadan frasa: kira jangkaan, snap ke jeda terdekat (monotonic)
gap_mid = [(newt[k][1] + newt[k+1][0]) / 2 for k in range(len(newt)-1)]
bounds_idx, cum = [], 0
phr_syl = {}
for wd in words: phr_syl[wd["phrase"]] = phr_syl.get(wd["phrase"], 0) + wd["syl"]
order = [p for p,_ in PHRASES]
exp, c = [], 0
for p in order[:-1]:
    c += phr_syl[p]; exp.append(v2t(c / tot * voiced))
snapped, last = [], -1
for e in exp:
    cands = [(abs(gm-e), k) for k, gm in enumerate(gap_mid) if k > last]
    d, k = min(cands); snapped.append(gap_mid[k]); last = k
edges = [HEAD] + snapped + [speech_end]
res, ph = [], {}
for pi, p in enumerate(order):
    a, b = edges[pi], edges[pi+1]
    ws = [wd for wd in words if wd["phrase"] == p]
    s = sum(wd["syl"] for wd in ws); cur = a
    for wd in ws:
        d = (b-a) * wd["syl"]/s
        res.append(dict(w=wd["w"], key=wd["key"], phrase=p, s=round(cur,3), e=round(cur+d,3))); cur += d
    ph[p] = [round(a,3), round(b,3)]
json.dump(dict(words=res, phrases=ph, speechEnd=round(speech_end,3)), open("build/timing.json","w"), ensure_ascii=False, indent=1)
for p in order: print(p, ph[p])
