import os
import cv2
import numpy as np
import subprocess
from pathlib import Path
from backend.video.ffprobe import get_ffmpeg_path

OUTPUT_DIR = Path("test_assets")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

WIDTH = 640
HEIGHT = 360
FPS = 30

def create_synthetic_texture(w=WIDTH, h=HEIGHT) -> np.ndarray:
    """Generates an organic background texture with gradients and shapes."""
    img = np.zeros((h, w, 3), dtype=np.uint8)
    for y in range(h):
        for x in range(w):
            img[y, x] = [
                int(50 + 50 * np.sin(x / 40.0)),
                int(80 + 40 * np.cos(y / 30.0)),
                int(120 + 60 * np.sin((x + y) / 50.0))
            ]
    # Add some geometric landscape elements
    cv2.circle(img, (w // 4, h // 3), 50, (180, 200, 240), -1)
    cv2.rectangle(img, (w // 2, h // 2), (w * 3 // 4, h * 4 // 5), (40, 100, 60), -1)
    return img

def create_photo(index: int, w=WIDTH, h=HEIGHT) -> np.ndarray:
    """Generates rich still photos for slideshows."""
    img = np.zeros((h, w, 3), dtype=np.uint8)
    colors = [
        ((30, 60, 160), (200, 150, 50), "PORTRAIT PHOTO"),
        ((80, 140, 40), (20, 200, 220), "LANDSCAPE PHOTO"),
        ((140, 50, 120), (240, 200, 80), "EDITORIAL STILL")
    ]
    bg_col, fg_col, label = colors[index % len(colors)]
    img[:] = bg_col
    cv2.circle(img, (w // 2, h // 2), 90, fg_col, -1)
    cv2.putText(img, label, (w // 4, h // 2 + 10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    cv2.putText(img, f"Slide #{index + 1}", (w // 3, h // 2 + 50), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
    return img

def add_audio_track(temp_video: str, final_video: str, duration: float):
    """Adds a clean synthesized audio track using FFmpeg to ensure full format compliance."""
    ffmpeg_cmd = get_ffmpeg_path()
    cmd = [
        ffmpeg_cmd, "-y",
        "-i", temp_video,
        "-f", "lavfi", "-i", f"sine=frequency=440:sample_rate=44100:duration={duration}",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        final_video
    ]
    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    if os.path.exists(temp_video):
        os.remove(temp_video)

def generate_test_a_real_footage():
    """Test A: Real continuous footage with natural movement and parallax. Expected: KEEP."""
    filename = "test_a_real_continuous_footage.mp4"
    final_path = str(OUTPUT_DIR / filename)
    temp_path = str(OUTPUT_DIR / f"temp_{filename}")
    
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(temp_path, fourcc, FPS, (WIDTH, HEIGHT))
    
    duration = 6.0 # 6 seconds
    total_frames = int(duration * FPS)
    bg = create_synthetic_texture()
    
    for f in range(total_frames):
        t = f / FPS
        frame = bg.copy()
        # Foreground moving organic object with speed
        obj_x = int(100 + 350 * (0.5 + 0.5 * np.sin(t * 2.0)))
        obj_y = int(150 + 80 * np.cos(t * 3.0))
        cv2.circle(frame, (obj_x, obj_y), 35, (0, 165, 255), -1)
        
        # Second independent moving element
        obj2_x = int(450 - 250 * (0.5 + 0.5 * np.cos(t * 1.5)))
        obj2_y = int(80 + 40 * np.sin(t * 2.5))
        cv2.rectangle(frame, (obj2_x - 20, obj2_y - 20), (obj2_x + 20, obj2_y + 20), (255, 50, 50), -1)
        
        # Natural sensor noise simulation
        noise = np.random.normal(0, 3.5, frame.shape).astype(np.int16)
        noisy_frame = np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        
        cv2.putText(noisy_frame, "Real Continuous Footage", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        out.write(noisy_frame)
        
    out.release()
    add_audio_track(temp_path, final_path, duration)
    print(f"Generated {final_path}")

def generate_test_b_static_slideshow():
    """Test B: Slideshow of static images. Expected: REMOVE."""
    filename = "test_b_static_slideshow.mp4"
    final_path = str(OUTPUT_DIR / filename)
    temp_path = str(OUTPUT_DIR / f"temp_{filename}")
    
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(temp_path, fourcc, FPS, (WIDTH, HEIGHT))
    
    slides = [create_photo(0), create_photo(1), create_photo(2)]
    slide_dur = 3.0 # 3s per slide = 9s total
    frames_per_slide = int(slide_dur * FPS)
    
    for slide in slides:
        for _ in range(frames_per_slide):
            out.write(slide)
            
    out.release()
    add_audio_track(temp_path, final_path, slide_dur * len(slides))
    print(f"Generated {final_path}")

def generate_test_c_ken_burns_zoom():
    """Test C: Slideshow with Ken Burns zoom. Expected: REMOVE."""
    filename = "test_c_ken_burns_zoom.mp4"
    final_path = str(OUTPUT_DIR / filename)
    temp_path = str(OUTPUT_DIR / f"temp_{filename}")
    
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(temp_path, fourcc, FPS, (WIDTH, HEIGHT))
    
    duration = 6.0
    total_frames = int(duration * FPS)
    # High-res base still photo
    base_photo = np.zeros((HEIGHT * 2, WIDTH * 2, 3), dtype=np.uint8)
    for y in range(HEIGHT * 2):
        for x in range(WIDTH * 2):
            base_photo[y, x] = [int(100 + 80 * np.sin(x / 80)), int(120 + 60 * np.cos(y / 60)), 180]
    cv2.circle(base_photo, (WIDTH, HEIGHT), 150, (30, 220, 240), -1)
    cv2.putText(base_photo, "KEN BURNS PHOTO", (WIDTH - 150, HEIGHT), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 3)

    for f in range(total_frames):
        # Progressively crop and resize (pure digital zoom in)
        zoom_factor = 1.0 + 0.35 * (f / total_frames)
        crop_w = int((WIDTH * 2) / zoom_factor)
        crop_h = int((HEIGHT * 2) / zoom_factor)
        cx, cy = WIDTH, HEIGHT
        x1 = cx - crop_w // 2
        y1 = cy - crop_h // 2
        crop = base_photo[y1:y1 + crop_h, x1:x1 + crop_w]
        frame = cv2.resize(crop, (WIDTH, HEIGHT), interpolation=cv2.INTER_LINEAR)
        out.write(frame)

    out.release()
    add_audio_track(temp_path, final_path, duration)
    print(f"Generated {final_path}")

def generate_test_d_slow_camera_movement():
    """Test D: Real footage with slow camera movement and parallax. Expected: KEEP."""
    filename = "test_d_slow_camera_movement.mp4"
    final_path = str(OUTPUT_DIR / filename)
    temp_path = str(OUTPUT_DIR / f"temp_{filename}")
    
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(temp_path, fourcc, FPS, (WIDTH, HEIGHT))
    
    duration = 6.0
    total_frames = int(duration * FPS)
    bg = create_synthetic_texture(WIDTH + 200, HEIGHT)
    
    for f in range(total_frames):
        t = f / FPS
        # Slow camera pan (background moves at speed 1, foreground at speed 2 for 3D parallax)
        pan_x = int(t * 15)
        frame = bg[:, pan_x:pan_x + WIDTH].copy()
        
        # Closer foreground object moving faster (parallax effect!)
        fg_x = int(300 - t * 40)
        fg_y = 200
        if 0 <= fg_x < WIDTH:
            cv2.circle(frame, (fg_x, fg_y), 45, (0, 255, 120), -1)
            
        # Subtle sensor noise
        noise = np.random.normal(0, 3.0, frame.shape).astype(np.int16)
        noisy_frame = np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        
        cv2.putText(noisy_frame, "Real Footage (Slow Pan + Parallax)", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        out.write(noisy_frame)
        
    out.release()
    add_audio_track(temp_path, final_path, duration)
    print(f"Generated {final_path}")

def generate_test_e_mixed_video():
    """
    Test E: Mixed sequence:
    00:00 - 00:04: Real footage (KEEP)
    00:04 - 00:08: Static image (REMOVE)
    00:08 - 00:12: Zoom image (REMOVE)
    00:12 - 00:13.5: Transition dip to black (REMOVE)
    00:13.5 - 00:18: Real footage (KEEP)
    """
    filename = "test_e_mixed_video.mp4"
    final_path = str(OUTPUT_DIR / filename)
    temp_path = str(OUTPUT_DIR / f"temp_{filename}")
    
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(temp_path, fourcc, FPS, (WIDTH, HEIGHT))
    
    total_dur = 18.0
    bg = create_synthetic_texture()
    static_slide = create_photo(1)
    
    # 1. 0s to 4s: Real footage
    for f in range(int(4.0 * FPS)):
        t = f / FPS
        frame = bg.copy()
        cv2.circle(frame, (int(200 + 100 * np.sin(t * 3)), 180), 40, (0, 200, 255), -1)
        noise = np.random.normal(0, 3.0, frame.shape).astype(np.int16)
        noisy = np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        cv2.putText(noisy, "1. Real Footage (0-4s)", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        out.write(noisy)
        
    # 2. 4s to 8s: Static image
    for _ in range(int(4.0 * FPS)):
        slide_frame = static_slide.copy()
        cv2.putText(slide_frame, "2. Static Slide (4-8s)", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        out.write(slide_frame)
        
    # 3. 8s to 12s: Zoom image (Ken Burns)
    base_photo = np.zeros((HEIGHT * 2, WIDTH * 2, 3), dtype=np.uint8)
    base_photo[:] = (60, 40, 140)
    cv2.circle(base_photo, (WIDTH, HEIGHT), 120, (50, 230, 120), -1)
    cv2.putText(base_photo, "3. KEN BURNS ZOOM (8-12s)", (WIDTH - 180, HEIGHT), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
    for f in range(int(4.0 * FPS)):
        zf = 1.0 + 0.3 * (f / (4.0 * FPS))
        cw = int((WIDTH * 2) / zf)
        ch = int((HEIGHT * 2) / zf)
        crop = base_photo[HEIGHT - ch//2 : HEIGHT + ch//2, WIDTH - cw//2 : WIDTH + cw//2]
        frame = cv2.resize(crop, (WIDTH, HEIGHT))
        out.write(frame)
        
    # 4. 12s to 13.5s: Transition Dip to Black
    for f in range(int(1.5 * FPS)):
        t_trans = f / (1.5 * FPS)
        # Fade down then up
        lum_factor = 4 * (t_trans - 0.5) ** 2
        black_frame = (bg * lum_factor).astype(np.uint8)
        cv2.putText(black_frame, "4. Transition (Dip to Black)", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1)
        out.write(black_frame)
        
    # 5. 13.5s to 18s: Real footage
    for f in range(int(4.5 * FPS)):
        t = f / FPS
        frame = bg.copy()
        cv2.circle(frame, (int(400 - 120 * np.cos(t * 2)), int(200 + 40 * np.sin(t * 3))), 35, (255, 100, 50), -1)
        noise = np.random.normal(0, 3.0, frame.shape).astype(np.int16)
        noisy = np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        cv2.putText(noisy, "5. Real Footage (13.5-18s)", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        out.write(noisy)
        
    out.release()
    add_audio_track(temp_path, final_path, total_dur)
    print(f"Generated {final_path}")

def generate_test_f_talking_head():
    """Test F: Talking-head footage (stationary body, subtle mouth/blinking micro-motions). Expected: KEEP."""
    filename = "test_f_talking_head.mp4"
    final_path = str(OUTPUT_DIR / filename)
    temp_path = str(OUTPUT_DIR / f"temp_{filename}")
    
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(temp_path, fourcc, FPS, (WIDTH, HEIGHT))
    
    duration = 5.0
    total_frames = int(duration * FPS)
    
    # Base talking head portrait
    base = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    base[:] = (60, 70, 80) # Office backdrop
    cv2.rectangle(base, (WIDTH//4, HEIGHT//3), (WIDTH*3//4, HEIGHT), (140, 100, 80), -1) # Torso/Shoulders
    cv2.ellipse(base, (WIDTH//2, HEIGHT//3 + 20), (50, 70), 0, 0, 360, (180, 150, 130), -1) # Face
    
    for f in range(total_frames):
        t = f / FPS
        frame = base.copy()
        
        # Subtle head micro-sway (breathing)
        head_drift = int(1.5 * np.sin(t * 1.5))
        
        # Eyes blinking (every 2 seconds)
        eye_open = 4 if int(t * 2) % 4 != 3 else 1
        cv2.circle(frame, (WIDTH//2 - 20, HEIGHT//3 + head_drift), eye_open, (40, 40, 40), -1)
        cv2.circle(frame, (WIDTH//2 + 20, HEIGHT//3 + head_drift), eye_open, (40, 40, 40), -1)
        
        # Mouth moving / talking
        mouth_h = int(2 + 5 * abs(np.sin(t * 8.0)))
        cv2.ellipse(frame, (WIDTH//2, HEIGHT//3 + 45 + head_drift), (12, mouth_h), 0, 0, 360, (70, 50, 90), -1)
        
        # Real camera sensor noise
        noise = np.random.normal(0, 2.8, frame.shape).astype(np.int16)
        noisy = np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        cv2.putText(noisy, "Talking Head (Subtle Micro-Motion)", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        out.write(noisy)
        
    out.release()
    add_audio_track(temp_path, final_path, duration)
    print(f"Generated {final_path}")

def generate_all():
    print("Generating synthetic test videos A through F...")
    generate_test_a_real_footage()
    generate_test_b_static_slideshow()
    generate_test_c_ken_burns_zoom()
    generate_test_d_slow_camera_movement()
    generate_test_e_mixed_video()
    generate_test_f_talking_head()
    print("All test videos generated in test_assets/")

if __name__ == "__main__":
    generate_all()
