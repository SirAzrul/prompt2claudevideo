"""Render src/video.html frame demi frame (Playwright) lalu gabung dengan audio guna ffmpeg."""
import json, os, subprocess, sys
from concurrent.futures import ProcessPoolExecutor
from playwright.sync_api import sync_playwright

FPS, DUR, W, H = 30, 30, 1080, 1920
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FR = os.path.join(ROOT, "build", "frames")
timing = open(os.path.join(ROOT, "build", "timing.json")).read()

def work(rng):
    a, b = rng
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args=["--no-sandbox"])
        pg = br.new_page(viewport={"width": W, "height": H})
        pg.add_init_script(f"window.TIMING = {timing};")
        pg.goto("file://" + os.path.join(ROOT, "src", "video.html"))
        pg.wait_for_timeout(400)
        for i in range(a, b):
            pg.evaluate(f"seek({i / FPS})")
            pg.screenshot(path=f"{FR}/f{i:04d}.jpg", type="jpeg", quality=93)
        br.close()

if __name__ == "__main__":
    os.makedirs(FR, exist_ok=True)
    n = FPS * DUR
    only = [int(x) for x in sys.argv[1:]]  # nombor frame untuk semakan pantas
    if only:
        work((0, 0))
        with sync_playwright() as p:
            br = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args=["--no-sandbox"]); pg = br.new_page(viewport={"width": W, "height": H})
            pg.add_init_script(f"window.TIMING = {timing};")
            pg.goto("file://" + os.path.join(ROOT, "src", "video.html")); pg.wait_for_timeout(400)
            for i in only:
                pg.evaluate(f"seek({i / FPS})"); pg.screenshot(path=f"{ROOT}/build/prev_{i:04d}.png")
            br.close()
        sys.exit()
    k = 4; step = n // k
    ranges = [(i*step, n if i == k-1 else (i+1)*step) for i in range(k)]
    with ProcessPoolExecutor(k) as ex: list(ex.map(work, ranges))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", f"{FR}/f%04d.jpg",
        "-i", os.path.join(ROOT, "build", "narration_30.wav"), "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-crf", "18", "-preset", "medium", "-c:a", "aac", "-b:a", "160k", "-t", str(DUR), "-movflags", "+faststart",
        os.path.join(ROOT, "output", "video_30s.mp4")], check=True)
    print("siap")
