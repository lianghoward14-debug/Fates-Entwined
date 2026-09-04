import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "python-audio"))
from faster_whisper import WhisperModel

source_dir = Path(sys.argv[1])
output = Path(sys.argv[2])
ids = [int(value) for value in sys.argv[3:]]
model = WhisperModel(
    "small", device="cpu", compute_type="int8",
    download_root=str(Path(__file__).parent / "whisper-models"),
)
result = {}
for global_id in ids:
    local_id = global_id - 473
    source = source_dir / f"voice-line-{local_id:03d}.mp3"
    segments, _ = model.transcribe(
        str(source), beam_size=5, word_timestamps=True, vad_filter=False,
        condition_on_previous_text=False, language="el", no_speech_threshold=1.0,
    )
    result[str(global_id)] = [
        {
            "start": segment.start,
            "end": segment.end,
            "text": segment.text.strip(),
            "words": [
                {"start": word.start, "end": word.end, "word": word.word}
                for word in (segment.words or [])
            ],
        }
        for segment in segments
    ]
output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
