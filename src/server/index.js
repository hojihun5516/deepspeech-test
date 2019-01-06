#!/usr/bin/env node

const Fs = require('fs');
const Sox = require('sox-stream');
const Ds = require('./index.js');
const argparse = require('argparse');
const MemoryStream = require('memory-stream');
const Wav = require('node-wav');
const Duplex = require('stream').Duplex;
const util = require('util');

// 이 상수는 빔 탐색 디코더를 제어합니다.

// 후보 전사를 만들 때 CTC 디코더에서 사용되는 빔 너비
const BEAM_WIDTH = 500;

// CTC 디코더의 알파 하이퍼 매개 변수. 언어 모델 무게
const LM_ALPHA = 0.75;

// CTC 디코더의 베타 하이퍼 매개 변수. 단어 삽입 보너스.
const LM_BETA = 1.85;


// 이 상수는 사용 된 그래프의 모양에 연결됩니다 (변경 사항을 변경 함).
// 첫 번째 레이어의 지오메트리), 동일한 상수를 사용해야합니다.
// 훈련 중에 사용되었습니다.

// 사용할 MFCC 기능의 수
const N_FEATURES = 26;

// 입력 벡터에서 타임 스텝을 생성하는 데 사용되는 컨텍스트 창의 크기
const N_CONTEXT = 9;

// var VersionAction = function VersionAction(options) {
//   options = options || {};
//   options.nargs = 0;
//   argparse.Action.call(this, options);
// }
// util.inherits(VersionAction, argparse.Action);

// VersionAction.prototype.call = function(parser) {
//   Ds.printVersions();
  
//   process.exit(0);
// }

const MODEL = '../../models/output_graph.pb'
const ALPHABET = '../../models/alphabet.txt'
const LM = '../../models/lm.binary'
const TRIE = '../../models/trie'
const audio = '../../models/audio.wav'


// var parser = new argparse.ArgumentParser({addHelp: true, description: 'Running DeepSpeech inference.'});
// parser.addArgument(['--model'], {required: true, help: 'Path to the model (protocol buffer binary file)'});
// parser.addArgument(['--alphabet'], {required: true, help: 'Path to the configuration file specifying the alphabet used by the network'});
// parser.addArgument(['--lm'], {help: 'Path to the language model binary file', nargs: '?'});
// parser.addArgument(['--trie'], {help: 'Path to the language model trie file created with native_client/generate_trie', nargs: '?'});
// parser.addArgument(['--audio'], {required: true, help: 'Path to the audio file to run (WAV format)'});
// parser.addArgument(['--version'], {action: VersionAction, help: 'Print version and exits'})
// var args = parser.parseArgs();

function totalTime(hrtimeValue) {
  return (hrtimeValue[0] + hrtimeValue[1] / 1000000000).toPrecision(4);
}

const buffer = Fs.readFileSync(audio);
const result = Wav.decode(buffer);

if (result.sampleRate < 16000) {
  console.error('Warning: original sample rate (' + result.sampleRate + ') is lower than 16kHz. Up-sampling might produce erratic speech recognition.');
}

function bufferToStream(buffer) {
  var stream = new Duplex();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

var audioStream = new MemoryStream();
bufferToStream(buffer).
  pipe(Sox({
    global: {
      'no-dither': true,
    },
    output: {
      bits: 16,
      rate: 16000,
      channels: 1,
      encoding: 'signed-integer',
      endian: 'little',
      compression: 0.0,
      type: 'raw'
    }
  })).
  pipe(audioStream);

audioStream.on('finish', () => {
  audioBuffer = audioStream.toBuffer();

  console.error('Loading model from file %s', MODEL);
  const model_load_start = process.hrtime();
  var model = new Ds.Model(MODEL, N_FEATURES, N_CONTEXT, ALPHABET, BEAM_WIDTH);
  const model_load_end = process.hrtime(model_load_start);
  console.error('Loaded model in %ds.', totalTime(model_load_end));

  if (LM && TRIE) {
    console.error('Loading language model from files %s %s', LM, TRIE);
    const lm_load_start = process.hrtime();
    model.enableDecoderWithLM(ALPHABET, LM, TRIE,
                              LM_ALPHA, LM_BETA);
    const lm_load_end = process.hrtime(lm_load_start);
    console.error('Loaded language model in %ds.', totalTime(lm_load_end));
  }

  const inference_start = process.hrtime();
  console.error('Running inference.');
  const audioLength = (audioBuffer.length / 2) * ( 1 / 16000);

   // buffer는 char *이기 때문에 buffer_size의 절반을 사용합니다. while
  // LocalDsSTT ()는 짧은 예상 *
  console.log(model.stt(audioBuffer.slice(0, audioBuffer.length / 2), 16000));
  const inference_stop = process.hrtime(inference_start);
  console.error('Inference took %ds for %ds audio file.', totalTime(inference_stop), audioLength.toPrecision(4));
});