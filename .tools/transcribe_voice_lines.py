import json
import sys

sys.path.insert(0, r"C:\Users\liang\OneDrive\Desktop\Fates Entwined main\.tools\python-audio")
from faster_whisper import WhisperModel

source, output = sys.argv[1], sys.argv[2]
model = WhisperModel("small", device="cpu", compute_type="int8", download_root=r"C:\Users\liang\OneDrive\Desktop\Fates Entwined main\.tools\whisper-models")
segments, info = model.transcribe(
    source,
    beam_size=5,
    word_timestamps=True,
    vad_filter=False,
    condition_on_previous_text=False,
    language="el",
    no_speech_threshold=1.0,
)
result = {"language": info.language, "language_probability": info.language_probability, "segments": []}
for segment in segments:
    result["segments"].append({
        "start": segment.start,
        "end": segment.end,
        "text": segment.text.strip(),
        "words": [
            {"start": word.start, "end": word.end, "word": word.word}
            for word in (segment.words or [])
        ],
    })
with open(output, "w", encoding="utf-8") as handle:
    json.dump(result, handle, ensure_ascii=False, indent=2)
