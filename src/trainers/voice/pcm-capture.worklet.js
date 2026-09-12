// In-memory microphone frames only. No storage, recognition, or network here.
class ChessUtterancePcm extends AudioWorkletProcessor {
  process(inputs) {
    const samples=inputs[0]?.[0]
    if(samples)this.port.postMessage(samples.slice())
    return true
  }
}
registerProcessor('chess-utterance-pcm',ChessUtterancePcm)
