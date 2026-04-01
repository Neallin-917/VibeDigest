import os
import sys
import argparse
import logging

# 添加路径以确保能引用到项目依赖
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import litellm
except ImportError:
    print("❌ 错误: 未找到 litellm 库。请运行 'uv pip install litellm'")
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="快速测试 OpenAI-compatible 本地 LLM 连接 (不读取 .env)")
    parser.add_argument("--url", default="http://localhost:11434/v1", help="本地 API Base URL (默认: Ollama)")
    parser.add_argument("--model", required=True, help="要测试的模型名称 (如 qwen2.5:7b)")
    parser.add_argument("--key", default="sk-dummy", help="API Key (如果有)")
    parser.add_argument("--verbose", action="store_true", help="显示详细调试信息")

    args = parser.parse_args()

    if args.verbose:
        litellm.set_verbose = True
    
    litellm.drop_params = True

    print("-" * 50)
    print(f"📡 目标地址: {args.url}")
    print(f"🤖 测试模型: {args.model}")
    print("-" * 50)

    try:
        print("⏳ 正在发送测试请求...")
        response = litellm.completion(
            model=args.model,
            messages=[{"role": "user", "content": "你好，请确认你是否工作正常，并简短回复。"}],
            base_url=args.url,
            api_key=args.key,
            temperature=0.1,
            max_tokens=50
        )
        
        print("\n✨ 连接成功！")
        print(f"📝 响应内容: {response.choices[0].message.content}")
        print("-" * 50)
        
    except Exception as e:
        print("\n💥 连接失败！")
        print(f"错误类型: {type(e).__name__}")
        print(f"详细错误: {str(e)}")
        
        if "Connection refused" in str(e):
            print("\n💡 提示: 请检查服务是否已启动，或者 URL 是否填写正确。")
        elif "404" in str(e):
            print("\n💡 提示: 请检查模型名称是否拼写正确，或服务端是否已加载该模型。")
        print("-" * 50)
        sys.exit(1)

if __name__ == "__main__":
    main()
