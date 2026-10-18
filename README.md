# prompt2claudevideo

Video 30 saat (1080x1920, 9:16) daripada audio narasi "Guna Claude dengan betul".

- `assets/narration.wav` — audio asal
- `src/prep_audio.py` — pendekkan jeda panjang, anggar masa setiap perkataan (`build/timing.json`)
- `src/video.html` — animasi dipacu masa (`seek(t)`), termasuk highlight term dan sari kata karaoke
- `src/render.py` — render frame guna Playwright, gabung audio dengan ffmpeg
- `output/video_30s.mp4` — hasil akhir

Jalankan: `python3 src/prep_audio.py && python3 src/render.py`
