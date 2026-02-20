#!/usr/bin/env python3
"""
ProfitLayer 宣传图生成器
整合多张截图，添加品牌元素和文案
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

# 配置
BANNER_WIDTH = 1920
BANNER_HEIGHT = 1080
BACKGROUND_COLOR = (10, 15, 25)  # 深蓝黑色
ACCENT_COLOR = (59, 130, 246)    # 蓝色
TEXT_COLOR = (255, 255, 255)     # 白色
SUBTITLE_COLOR = (156, 163, 175) # 灰色

def create_gradient_background(width, height):
    """创建渐变背景"""
    img = Image.new('RGB', (width, height), BACKGROUND_COLOR)
    draw = ImageDraw.Draw(img)
    
    # 添加径向渐变效果
    for i in range(height):
        alpha = int((i / height) * 30)
        color = tuple(min(255, c + alpha) for c in BACKGROUND_COLOR)
        draw.line([(0, i), (width, i)], fill=color)
    
    return img

def add_glow_effect(img, radius=20):
    """添加发光效果"""
    return img.filter(ImageFilter.GaussianBlur(radius=radius))

def create_promo_banner():
    """创建主宣传图"""
    
    # 创建背景
    banner = create_gradient_background(BANNER_WIDTH, BANNER_HEIGHT)
    draw = ImageDraw.Draw(banner)
    
    # 加载字体（尝试系统字体）
    try:
        title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 120)
        subtitle_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 48)
        feature_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 36)
    except:
        # 如果找不到字体，使用默认字体
        title_font = ImageFont.load_default()
        subtitle_font = ImageFont.load_default()
        feature_font = ImageFont.load_default()
    
    # 绘制主标题
    title = "ProfitLayer"
    title_bbox = draw.textbbox((0, 0), title, font=title_font)
    title_width = title_bbox[2] - title_bbox[0]
    title_x = (BANNER_WIDTH - title_width) // 2
    
    # 添加发光效果（标题阴影）
    shadow_offset = 4
    draw.text((title_x + shadow_offset, 150 + shadow_offset), title, 
              fill=(0, 0, 0, 128), font=title_font)
    draw.text((title_x, 150), title, fill=ACCENT_COLOR, font=title_font)
    
    # 绘制副标题
    subtitle = "AI-Driven Multi-Chain DeFi Yield Optimizer"
    subtitle_bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    subtitle_width = subtitle_bbox[2] - subtitle_bbox[0]
    subtitle_x = (BANNER_WIDTH - subtitle_width) // 2
    draw.text((subtitle_x, 300), subtitle, fill=TEXT_COLOR, font=subtitle_font)
    
    # 绘制特性列表
    features = [
        "🤖 AI Risk Scoring & Portfolio Optimization",
        "⛓️  10+ Chains (EVM + Aptos + Solana)",
        "🔒 Enterprise Security (2FA + AES-256)",
        "📊 Real-time Dashboard & Analytics"
    ]
    
    feature_y = 450
    for feature in features:
        feature_bbox = draw.textbbox((0, 0), feature, font=feature_font)
        feature_width = feature_bbox[2] - feature_bbox[0]
        feature_x = (BANNER_WIDTH - feature_width) // 2
        draw.text((feature_x, feature_y), feature, fill=SUBTITLE_COLOR, font=feature_font)
        feature_y += 80
    
    # 绘制底部信息
    footer = "github.com/w7wnwpfj26-art/profit-layer  •  MIT License  •  200+ Protocols"
    footer_bbox = draw.textbbox((0, 0), footer, font=feature_font)
    footer_width = footer_bbox[2] - footer_bbox[0]
    footer_x = (BANNER_WIDTH - footer_width) // 2
    draw.text((footer_x, BANNER_HEIGHT - 100), footer, fill=ACCENT_COLOR, font=feature_font)
    
    # 添加装饰线条
    line_y = 380
    line_margin = 400
    draw.line([(line_margin, line_y), (BANNER_WIDTH - line_margin, line_y)], 
              fill=ACCENT_COLOR, width=3)
    
    return banner

def create_screenshot_collage():
    """创建截图拼贴"""
    
    # 加载截图
    screenshots = [
        'pools_screenshot.png',
        'positions_page_screenshot.png', 
        'wallet_screenshot.png'
    ]
    
    collage_width = 1920
    collage_height = 1080
    
    # 创建背景
    collage = create_gradient_background(collage_width, collage_height)
    
    # 计算每张图片的位置和大小
    img_width = (collage_width - 80) // 3  # 3张图，间距20px
    img_height = 700
    y_offset = 250
    
    for i, screenshot in enumerate(screenshots):
        if not os.path.exists(screenshot):
            print(f"⚠️  Screenshot not found: {screenshot}")
            continue
        
        try:
            img = Image.open(screenshot)
            # 调整大小保持比例
            img.thumbnail((img_width, img_height), Image.Resampling.LANCZOS)
            
            # 添加圆角
            mask = Image.new('L', img.size, 0)
            draw = ImageDraw.Draw(mask)
            draw.rounded_rectangle([(0, 0), img.size], radius=20, fill=255)
            img.putalpha(mask)
            
            # 计算位置
            x_offset = 20 + i * (img_width + 20)
            
            # 添加阴影
            shadow = Image.new('RGBA', (img.width + 20, img.height + 20), (0, 0, 0, 0))
            shadow_draw = ImageDraw.Draw(shadow)
            shadow_draw.rounded_rectangle([(10, 10), (img.width + 10, img.height + 10)], 
                                         radius=20, fill=(0, 0, 0, 100))
            shadow = shadow.filter(ImageFilter.GaussianBlur(radius=10))
            collage.paste(shadow, (x_offset - 5, y_offset - 5), shadow)
            
            # 粘贴图片
            collage.paste(img, (x_offset, y_offset), img)
            
        except Exception as e:
            print(f"❌ Error processing {screenshot}: {e}")
    
    # 添加标题
    draw = ImageDraw.Draw(collage)
    try:
        title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 80)
        subtitle_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 36)
    except:
        title_font = ImageFont.load_default()
        subtitle_font = ImageFont.load_default()
    
    title = "ProfitLayer Dashboard"
    title_bbox = draw.textbbox((0, 0), title, font=title_font)
    title_width = title_bbox[2] - title_bbox[0]
    draw.text(((collage_width - title_width) // 2, 80), title, fill=TEXT_COLOR, font=title_font)
    
    subtitle = "Professional-Grade DeFi Portfolio Management"
    subtitle_bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    subtitle_width = subtitle_bbox[2] - subtitle_bbox[0]
    draw.text(((collage_width - subtitle_width) // 2, 180), subtitle, fill=SUBTITLE_COLOR, font=subtitle_font)
    
    return collage

def main():
    """主函数"""
    print("🎨 Creating ProfitLayer promotional banners...")
    
    # 创建输出目录
    os.makedirs("promo", exist_ok=True)
    
    # 生成主宣传图
    print("1️⃣  Generating main banner...")
    banner = create_promo_banner()
    banner.save("promo/profitlayer-banner.png", quality=95)
    print("✅ Saved: promo/profitlayer-banner.png")
    
    # 生成截图拼贴
    print("2️⃣  Creating screenshot collage...")
    collage = create_screenshot_collage()
    collage.save("promo/profitlayer-screenshots.png", quality=95)
    print("✅ Saved: promo/profitlayer-screenshots.png")
    
    # 生成Twitter卡片 (1200x628)
    print("3️⃣  Creating Twitter card...")
    twitter_card = banner.resize((1200, 628), Image.Resampling.LANCZOS)
    twitter_card.save("promo/profitlayer-twitter-card.png", quality=95)
    print("✅ Saved: promo/profitlayer-twitter-card.png")
    
    # 生成GitHub社交预览 (1280x640)
    print("4️⃣  Creating GitHub social preview...")
    github_preview = banner.resize((1280, 640), Image.Resampling.LANCZOS)
    github_preview.save("promo/profitlayer-github-preview.png", quality=95)
    print("✅ Saved: promo/profitlayer-github-preview.png")
    
    print("\n🎉 All promotional materials created successfully!")
    print("\n📂 Files saved in ./promo/ directory:")
    print("   - profitlayer-banner.png (1920x1080)")
    print("   - profitlayer-screenshots.png (1920x1080)")
    print("   - profitlayer-twitter-card.png (1200x628)")
    print("   - profitlayer-github-preview.png (1280x640)")

if __name__ == "__main__":
    main()
