from PIL import Image, ImageDraw
import math

def create_gold_icon(size=256):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Outer dark obsidian circle with subtle gold rim
    pad = int(size * 0.04)
    # Background circle
    draw.ellipse([pad, pad, size - pad, size - pad], fill=(12, 12, 16, 255), outline=(212, 175, 55, 230), width=int(size * 0.035))
    
    # Inner gold decorative circle
    inner_pad = int(size * 0.12)
    draw.ellipse([inner_pad, inner_pad, size - inner_pad, size - inner_pad], outline=(170, 124, 17, 180), width=int(size * 0.015))
    
    # Gold film sprocket holes
    center = size / 2
    radius = size * 0.32
    num_sprockets = 6
    sprocket_r = int(size * 0.04)
    for i in range(num_sprockets):
        angle = i * (2 * math.pi / num_sprockets)
        sx = center + radius * math.cos(angle)
        sy = center + radius * math.sin(angle)
        draw.ellipse([sx - sprocket_r, sy - sprocket_r, sx + sprocket_r, sy + sprocket_r], fill=(245, 215, 127, 255), outline=(138, 100, 8, 255), width=2)
    
    # Center Play Triangle in rich gold
    t_center_x = center + int(size * 0.02)
    t_center_y = center
    t_size = int(size * 0.16)
    
    # Triangle points
    p1 = (t_center_x - t_size * 0.8, t_center_y - t_size)
    p2 = (t_center_x - t_size * 0.8, t_center_y + t_size)
    p3 = (t_center_x + t_size * 1.1, t_center_y)
    
    # Fill play triangle
    draw.polygon([p1, p2, p3], fill=(245, 215, 127, 255))
    draw.line([p1, p2, p3, p1], fill=(255, 240, 179, 255), width=int(size * 0.02))
    
    return img

# Generate multi-resolution Windows ICO
base_img = create_gold_icon(256)
sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
icon_images = [create_gold_icon(s[0]) for s in sizes]

base_img.save("video_cleaner.ico", format="ICO", sizes=sizes)
base_img.save("frontend/public/favicon.ico", format="ICO", sizes=sizes)
print("Successfully generated video_cleaner.ico and frontend/public/favicon.ico")
