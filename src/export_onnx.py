"""Export checkpoint to ONNX + verify parity.
Run: python src/export_onnx.py --ckpt outputs/best.pt --out outputs/best.onnx
Requires: pip install onnx onnxruntime
"""
import argparse

import torch
import timm


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", default="outputs/best.pt")
    ap.add_argument("--out", default="outputs/best.onnx")
    args = ap.parse_args()

    ckpt = torch.load(args.ckpt, map_location="cpu", weights_only=True)
    classes = ckpt["classes"]
    size = ckpt.get("img_size", 224)
    model = timm.create_model(ckpt["model"], pretrained=False, num_classes=len(classes))
    model.load_state_dict(ckpt["state"])
    model.eval()

    dummy = torch.randn(1, 3, size, size)
    torch.onnx.export(model, dummy, args.out, input_names=["input"],
                      output_names=["logits"], dynamic_axes={"input": {0: "batch"},
                      "logits": {0: "batch"}}, opset_version=17, dynamo=False)
    print("exported:", args.out)

    with torch.no_grad():
        ref = model(dummy).softmax(1)[0]

    import onnxruntime as ort
    sess = ort.InferenceSession(args.out, providers=["CPUExecutionProvider"])
    import numpy as np
    out = sess.run(None, {"input": dummy.numpy()})[0]
    prob = torch.from_numpy(out).softmax(1)[0]
    diff = (ref - prob).abs().max().item()
    print(f"parity max_diff={diff:.2e} pred={classes[int(prob.argmax())]}")
    assert diff < 1e-4, f"ONNX parity failed diff={diff}"
    print("ONNX OK")


if __name__ == "__main__":
    main()
