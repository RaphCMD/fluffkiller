from onnxruntime.quantization import quantize_dynamic, QuantType

# quantize_dynamic(
#     model_input="fluff-onnx/model.onnx",
#     model_output="fluff-onnx/model-quant.onnx",
#     weight_type=QuantType.QInt8  # or QuantType.QUInt8
# )

import onnx
model = onnx.load("fluff-model/model.onnx")
onnx.checker.check_model(model)
print(onnx.helper.printable_graph(model.graph))
