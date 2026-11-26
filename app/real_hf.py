import time
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

MODEL_PATH = str(Path(__file__).resolve().parent.parent / "models" / "qwen2.5-1.5b")

def diagnose_spring_boot_error():
    # 1. Check whether we have an NVIDIA GPU (CUDA) or CPU
    has_cuda = torch.cuda.is_available()
    device_name = torch.cuda.get_device_name(0) if has_cuda else "CPU"
    print(f"[1/6] Running on hardware: {device_name}")

    # 2. Load the Tokenizer (String <-> Integer ID lookup dictionary)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
    print(f"[2/6] Tokenizer loaded. Total vocabulary size: {tokenizer.vocab_size:,} tokens")

    # 3. Configure 4-bit Quantization (compresses model 4x if NVIDIA GPU is available)
    quant_config = None
    if has_cuda:
        print("yes nVidia available")
        quant_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16,
            bnb_4bit_use_double_quant=True,
        )

    # 4. Load the 1.5 Billion neural network weights from ./models/qwen2.5-1.5b
    print("[3/6] Loading model.safetensors into memory...")
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_PATH,
        device_map="auto",
        quantization_config=quant_config,
        torch_dtype=torch.bfloat16 if has_cuda else torch.float32,
    )
    mem_mb = model.get_memory_footprint() / (1024 ** 2)
    print(f"[4/6] Model loaded! Exact RAM/VRAM used: {mem_mb:.2f} MB")

    # 5. Real-world backend input: A Java Spring Boot production exception
    spring_boot_log = """
    2026-11-19 10:14:22.411 ERROR [payment-service] o.h.e.jdbc.spi.SqlExceptionHelper :
    HikariPool-1 - Connection is not available, request timed out after 30000ms.
    Caused by: org.postgresql.util.PSQLException: FATAL: remaining connection slots are reserved
    """
    messages = [
        {
            "role": "system",
            "content": "You are a Senior Java & Database SRE. Diagnose the error in 3 short bullet points: Root Cause, Immediate Fix, and Long-Term Prevention.",
        },
        {
            "role": "user",
            "content": f"Diagnose this production log:\n{spring_boot_log}",
        },
    ]

    # Convert message list -> Model-specific prompt string -> PyTorch Tensor of integers
    prompt_str = tokenizer.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )
    inputs = tokenizer(prompt_str, return_tensors="pt").to(model.device)
    input_len = inputs["input_ids"].shape[1]

    print(f"[5/6] Prompt converted into {input_len} integer token IDs.")
    print(f"      First 10 token IDs: {inputs['input_ids'][0][:10].tolist()}")

    # 6. Generate diagnosis token-by-token
    print("[6/6] Running neural network forward passes...\n")
    start = time.perf_counter()
    with torch.no_grad():  # Disables gradient tracking (saves 50% memory during inference)
        output_ids = model.generate(
            **inputs,
            max_new_tokens=180,
            temperature=0.1,   # Low temperature = factual, deterministic engineering answer
            do_sample=True,
        )
    elapsed = time.perf_counter() - start

    # Slice off the input prompt tokens so we only decode the newly generated reply
    new_tokens = output_ids[0][input_len:]
    diagnosis = tokenizer.decode(new_tokens, skip_special_tokens=True)

    print("=== AI SRE DIAGNOSIS ===")
    print(diagnosis)
    print("========================")
    print(f"Speed: {len(new_tokens)} tokens generated in {elapsed:.2f}s ({len(new_tokens)/elapsed:.1f} tokens/sec)")


if __name__ == "__main__":
    diagnose_spring_boot_error()
