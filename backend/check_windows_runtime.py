"""Frozen Windows smoke check: native DLLs and bundled ONNX VAD, no downloads."""

import json
import re
import sys
from pathlib import Path


def main():
    import llama_cpp
    import numpy as np
    import sherpa_onnx

    from backend.asr import load_model_catalog, model_directory_name

    catalog = load_model_catalog()
    if any(model['runtime'] == 'mlx-audio' for model in catalog.values()):
        raise RuntimeError('Windows catalog must use Sherpa ONNX, not MLX')
    model = catalog['silero-vad']
    backend = Path(sys.executable).resolve().parent.parent.parent
    vad_path = (
        backend
        / 'bundled-models'
        / model_directory_name('silero-vad', model['revision'])
        / model['files'][0]
    )
    config = sherpa_onnx.VadModelConfig()
    config.silero_vad.model = str(vad_path)
    config.sample_rate = 16000
    config.num_threads = 1
    config.provider = 'cpu'
    detector = sherpa_onnx.VoiceActivityDetector(config, buffer_size_in_seconds=2)
    detector.accept_waveform(np.zeros(16000, dtype=np.float32))
    detector.flush()
    if not detector.empty():
        raise RuntimeError('Silence unexpectedly classified as speech')
    # Import alone does not catch llama backend initialization/DLL failures.
    llama_cpp.llama_backend_init()
    llama_cpp.llama_backend_free()
    # 校验实际 DLL 的编译能力，防止构建参数未生效或旧 wheel 被打进安装包。
    system_info = llama_cpp.llama_print_system_info().decode('utf-8')
    features = dict(re.findall(r'(\w+) = (\d+)', system_info))
    if features.get('AVX2') != '1' or any(
        name.startswith('AVX512') and enabled == '1' for name, enabled in features.items()
    ):
        raise RuntimeError(f'Windows llama runtime requires AVX2 without AVX512: {system_info}')
    print(json.dumps({'asr': 'sherpa-onnx', 'vad': 'passed', 'llama': 'passed'}))
