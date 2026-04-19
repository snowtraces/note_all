import os

# 设置 Hugging Face 配置（必须在导入 transformers/sentence_transformers 之前设置）
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"

from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer
import torch

app = Flask(__name__)
CORS(app)

# 加载 BGE-small-zh 模型
# 如果本地没有模型文件，会自动从 HuggingFace 下载
# model_name = 'BAAI/bge-small-zh-v1.5'
model_name = './libs/bge-small-zh-v1.5'
print(f"Loading model: {model_name}...")
model = SentenceTransformer(model_name)
print("Model loaded successfully.")

@app.route('/v1/embeddings', methods=['POST'])
def get_embeddings():
    data = request.json
    if not data or 'input' not in data:
        return jsonify({"error": "Missing 'input' field"}), 400
    
    input_text = data['input']
    model_id = data.get('model', 'bge-small-zh')

    # 支持数组输入或单条文本输入
    if isinstance(input_text, str):
        texts = [input_text]
    elif isinstance(input_text, list):
        texts = input_text
    else:
        return jsonify({"error": "Invalid 'input' format, must be string or list of strings"}), 400

    # 生成向量
    embeddings = model.encode(texts, normalize_embeddings=True)
    
    # 构建符合 OpenAI 风格的返回结构
    result_data = []
    for i, emb in enumerate(embeddings):
        result_data.append({
            "object": "embedding",
            "index": i,
            "embedding": emb.tolist()
        })

    return jsonify({
        "object": "list",
        "data": result_data,
        "model": model_id,
        "usage": {
            "prompt_tokens": 0,  # 离线模型暂不计算 token
            "total_tokens": 0
        }
    })

@app.route('/ping', methods=['GET'])
def ping():
    return jsonify({"status": "ok", "model": model_name})

if __name__ == '__main__':
    # 默认运行在 8001 端口，避免与 Go 后端 (8080) 冲突
    app.run(host='0.0.0.0', port=8001)
