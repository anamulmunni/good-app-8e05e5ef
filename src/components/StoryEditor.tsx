import { useState, useRef, useEffect, useCallback } from "react";
import { X, Type, Music, Check, Search, Loader2, Palette, AlignCenter, Pause, Play } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { STORY_MUSIC_LIBRARY, StoryMusicTrack, buildStoredMusicValue } from "@/lib/story-music";

const TEXT_COLORS = [
  "#FFFFFF", "#000000", "#FF0000", "#00FF00", "#0000FF",
  "#FFFF00", "#FF69B4", "#00FFFF", "#FF6600", "#9900FF",
];

const FONT_SIZES = [20, 28, 36, 48, 60];

type Props = {
  imageFile: File;
  onClose: () => void;
  onPublish: (editedFile: File, musicName?: string) => void;
  isPending: boolean;
};

export default function StoryEditor({ imageFile, onClose, onPublish, isPending }: Props) {
  const [imageUrl, setImageUrl] = useState("");
  const [overlayText, setOverlayText] = useState("");
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [fontSize, setFontSize] = useState(36);
  const [textPosition, setTextPosition] = useState({ x: 0.5, y: 0.5 });
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [musicQuery, setMusicQuery] = useState("");
  const [selectedMusic, setSelectedMusic] = useState<StoryMusicTrack | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    const img = new Image();
    img.src = url;
    img.onload = () => { imgRef.current = img; };
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const filteredMusic = STORY_MUSIC_LIBRARY.filter((m) =>
    m.title.toLowerCase().includes(musicQuery.toLowerCase()) ||
    m.artist.toLowerCase().includes(musicQuery.toLowerCase()) ||
    m.genre.toLowerCase().includes(musicQuery.toLowerCase())
  );

  const playPreview = (song: StoryMusicTrack) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const audio = new Audio(song.audioUrl);
    audio.volume = 0.55;
    audioRef.current = audio;
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    audio.onended = () => setIsPlaying(false);
  };

  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
  };

  const selectMusic = (song: StoryMusicTrack) => {
    setSelectedMusic(song);
    playPreview(song);
    setShowMusicPicker(false);
  };

  const handleTextDrag = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const x = Math.max(0.1, Math.min(0.9, (clientX - rect.left) / rect.width));
    const y = Math.max(0.1, Math.min(0.9, (clientY - rect.top) / rect.height));
    setTextPosition({ x, y });
  }, [isDragging]);

  const publishStory = async () => {
    if (!imgRef.current) return;
    stopPreview();

    const img = imgRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    if (overlayText.trim()) {
      const scale = img.naturalWidth / 400;
      const drawFontSize = fontSize * scale;
      ctx.font = `bold ${drawFontSize}px sans-serif`;
      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = drawFontSize * 0.15;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      const x = textPosition.x * canvas.width;
      const y = textPosition.y * canvas.height;
      const maxWidth = canvas.width * 0.85;
      const words = overlayText.split(" ");
      const lines: string[] = [];
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(testLine).width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);

      const lineHeight = drawFontSize * 1.3;
      const startY = y - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, i) => {
        ctx.fillText(line, x, startY + i * lineHeight);
      });
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "story.jpg", { type: "image/jpeg" });
      const musicValue = selectedMusic ? buildStoredMusicValue(selectedMusic) : undefined;
      onPublish(file, musicValue);
    }, "image/jpeg", 0.9);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] bg-black flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 bg-black/80">
        <button onClick={() => { stopPreview(); onClose(); }} className="p-2 text-white">
          <X className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowTextEditor(!showTextEditor); setShowMusicPicker(false); }}
            className={`p-2.5 rounded-full ${showTextEditor ? "bg-white text-black" : "bg-white/20 text-white"}`}
          >
            <Type className="w-5 h-5" />
          </button>
          <button
            onClick={() => { setShowMusicPicker(!showMusicPicker); setShowTextEditor(false); }}
            className={`p-2.5 rounded-full ${showMusicPicker ? "bg-white text-black" : "bg-white/20 text-white"}`}
          >
            <Music className="w-5 h-5" />
          </button>
        </div>

        <button
          onClick={publishStory}
          disabled={isPending}
          className="px-5 py-2 bg-blue-600 text-white rounded-full text-sm font-bold disabled:opacity-50"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "শেয়ার করুন"}
        </button>
      </div>

      <div
        className="flex-1 flex items-center justify-center relative overflow-hidden"
        ref={containerRef}
        onMouseMove={handleTextDrag}
        onTouchMove={handleTextDrag}
        onMouseUp={() => setIsDragging(false)}
        onTouchEnd={() => setIsDragging(false)}
      >
        {imageUrl && <img src={imageUrl} alt="" className="max-w-full max-h-full object-contain" />}

        {overlayText && (
          <div
            className="absolute cursor-move select-none"
            style={{
              left: `${textPosition.x * 100}%`,
              top: `${textPosition.y * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
            onMouseDown={() => setIsDragging(true)}
            onTouchStart={() => setIsDragging(true)}
          >
            <p
              style={{
                color: textColor,
                fontSize: `${fontSize}px`,
                fontWeight: "bold",
                textShadow: "2px 2px 8px rgba(0,0,0,0.7)",
                textAlign: "center",
                maxWidth: "80vw",
                wordBreak: "break-word",
                lineHeight: 1.3,
              }}
            >
              {overlayText}
            </p>
          </div>
        )}

        {selectedMusic && (
          <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 bg-black/60 rounded-full px-3 py-2">
            <Music className="w-4 h-4 text-white shrink-0" />
            <p className="text-white text-xs truncate flex-1">{selectedMusic.title} - {selectedMusic.artist}</p>
            <button
              onClick={() => (isPlaying ? stopPreview() : playPreview(selectedMusic))}
              className="text-white/80 hover:text-white p-1"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button onClick={() => { stopPreview(); setSelectedMusic(null); }} className="text-white/60 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showTextEditor && (
          <motion.div initial={{ y: 200 }} animate={{ y: 0 }} exit={{ y: 200 }} className="bg-gray-900 px-4 py-3 space-y-3">
            <input
              value={overlayText}
              onChange={(e) => setOverlayText(e.target.value)}
              placeholder="টেক্সট লিখুন..."
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm border-none outline-none placeholder:text-gray-500"
              autoFocus
            />

            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-gray-400 shrink-0" />
              <div className="flex gap-2 overflow-x-auto">
                {TEXT_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setTextColor(color)}
                    className={`w-7 h-7 rounded-full shrink-0 border-2 ${textColor === color ? "border-white scale-110" : "border-gray-600"}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <AlignCenter className="w-4 h-4 text-gray-400 shrink-0" />
              <div className="flex gap-2">
                {FONT_SIZES.map((size) => (
                  <button
                    key={size}
                    onClick={() => setFontSize(size)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${fontSize === size ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300"}`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-gray-500 text-xs text-center">💡 টেক্সট ড্র্যাগ করে সরানো যাবে</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMusicPicker && (
          <motion.div initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }} className="bg-gray-900 max-h-[50vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  value={musicQuery}
                  onChange={(e) => setMusicQuery(e.target.value)}
                  placeholder="গান খুঁজুন..."
                  className="w-full bg-gray-800 text-white rounded-full pl-10 pr-4 py-2.5 text-sm border-none outline-none placeholder:text-gray-500"
                  autoFocus
                />
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-2 py-2 space-y-0.5">
              {filteredMusic.map((song) => (
                <button
                  key={song.id}
                  onClick={() => selectMusic(song)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                    selectedMusic?.id === song.id ? "bg-blue-600/20" : "hover:bg-gray-800"
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center shrink-0">
                    <Music className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{song.title}</p>
                    <p className="text-gray-400 text-xs truncate">{song.artist} · {song.genre}</p>
                  </div>
                  {selectedMusic?.id === song.id && <Check className="w-5 h-5 text-blue-500 shrink-0" />}
                </button>
              ))}

              {filteredMusic.length === 0 && <p className="text-gray-500 text-sm text-center py-6">কোনো গান পাওয়া যায়নি</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
