class DaraCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(4096);
    this.offset = 0;
    this.port.onmessage = (event) => {
      if (event.data === "flush") {
        if (this.offset)
          this.port.postMessage(this.samples.slice(0, this.offset));
        this.offset = 0;
        this.port.postMessage({ flushed: true });
      }
    };
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input) {
      for (let i = 0; i < input.length; i++) {
        this.samples[this.offset++] = input[i];
        if (this.offset === this.samples.length) {
          this.port.postMessage(this.samples, [this.samples.buffer]);
          this.samples = new Float32Array(4096);
          this.offset = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("dara-capture", DaraCapture);
