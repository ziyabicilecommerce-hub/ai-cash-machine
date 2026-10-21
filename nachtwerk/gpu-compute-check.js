/** Real WebGPU compute dispatch and readback. This is NOT generative AI. */
export async function verifyGPUCompute(gpu) {
  if (!gpu?.requestAdapter) throw Error('WebGPU nicht verfügbar');
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw Error('Kein WebGPU-Adapter verfügbar');
  const device = await adapter.requestDevice();
  try {
    const shader = device.createShaderModule({code:`@group(0) @binding(0) var<storage, read_write> data: array<u32>;
      @compute @workgroup_size(4) fn main(@builtin(global_invocation_id) id: vec3<u32>) {
        data[id.x] = (id.x + 1u) * 7u;
      }`});
    const pipeline = device.createComputePipeline({layout:'auto',compute:{module:shader,entryPoint:'main'}});
    const buffer = device.createBuffer({size:16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
    const readback = device.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try {
      const bindGroup = device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer}}]});
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bindGroup);pass.dispatchWorkgroups(1);pass.end();
      encoder.copyBufferToBuffer(buffer,0,readback,0,16);device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const values=Array.from(new Uint32Array(readback.getMappedRange().slice(0)));
      readback.unmap();
      if (values.join(',')!=='7,14,21,28') throw Error('GPU-Rechenergebnis falsch');
      return {passed:true,values,videoGeneration:false};
    } finally {buffer.destroy();readback.destroy();}
  } finally {device.destroy();}
}
