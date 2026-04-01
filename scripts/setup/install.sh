#!/bin/bash

# AI视频转录器安装脚本

echo "🚀 AI视频转录器安装脚本"
echo "=========================="

# 检查Python版本
echo "检查Python环境..."
python_version=$(python3 --version 2>&1 | cut -d' ' -f2)
if [[ -z "$python_version" ]]; then
    echo "❌ 未找到Python3，请先安装Python 3.8或更高版本"
    exit 1
fi
echo "✅ Python版本: $python_version"

# 检查uv
if ! command -v uv &> /dev/null; then
    echo "❌ 未找到 uv，请先安装 uv"
    exit 1
fi
echo "✅ uv 已安装"

# 安装Python依赖
echo ""
echo "安装Python依赖..."
uv pip install -r requirements.txt -r backend/requirements-dev.txt

if [ $? -eq 0 ]; then
    echo "✅ Python依赖安装完成"
else
    echo "❌ Python依赖安装失败"
    exit 1
fi

# 检查FFmpeg
echo ""
echo "检查FFmpeg..."
if command -v ffmpeg &> /dev/null; then
    echo "✅ FFmpeg已安装"
else
    echo "⚠️  FFmpeg未安装，正在尝试安装..."
    
    # 检测操作系统
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y ffmpeg
        elif command -v yum &> /dev/null; then
            sudo yum install -y ffmpeg
        else
            echo "❌ 无法自动安装FFmpeg，请手动安装"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install ffmpeg
        else
            echo "❌ 请先安装Homebrew，然后运行: brew install ffmpeg"
        fi
    else
        echo "❌ 不支持的操作系统，请手动安装FFmpeg"
    fi
fi

# 创建必要的目录
echo ""
echo "创建必要的目录..."
mkdir -p backend/temp backend/downloads backend/logs
echo "✅ 目录创建完成"

# 设置权限
chmod +x scripts/start.py

echo ""
echo "🎉 安装完成!"
echo ""
echo "使用方法:"
echo "  1. 配置 .env.local 和 frontend/.env.local"
echo ""
echo "  2. 启动服务:"
echo "     make start-backend"
echo "     make start-frontend"
echo ""
echo "  3. 打开浏览器访问: http://localhost:3000"
echo ""
echo "支持的视频平台:"
echo "  - YouTube"
echo "  - Bilibili"
echo "  - 其他yt-dlp支持的平台"
