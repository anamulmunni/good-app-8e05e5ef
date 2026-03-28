export type StoryMusicTrack = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  audioUrl: string;
};

const AUDIO_SAMPLES = [
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3",
];

const BASE_LIBRARY = [
  { id: "1", title: "Tum Hi Ho", artist: "Arijit Singh", genre: "Bollywood" },
  { id: "2", title: "Kesariya", artist: "Arijit Singh", genre: "Bollywood" },
  { id: "3", title: "Raataan Lambiyan", artist: "Jubin Nautiyal", genre: "Bollywood" },
  { id: "4", title: "Pasoori", artist: "Ali Sethi", genre: "Pop" },
  { id: "5", title: "Apna Bana Le", artist: "Arijit Singh", genre: "Bollywood" },
  { id: "6", title: "Maan Meri Jaan", artist: "King", genre: "Pop" },
  { id: "7", title: "Chaleya", artist: "Arijit Singh", genre: "Bollywood" },
  { id: "8", title: "Tera Ban Jaunga", artist: "Akhil Sachdeva", genre: "Bollywood" },
  { id: "9", title: "Shayad", artist: "Arijit Singh", genre: "Romance" },
  { id: "10", title: "Kahani Suno", artist: "Kaifi Khalil", genre: "Pop" },
  { id: "11", title: "O Maahi", artist: "Arijit Singh", genre: "Bollywood" },
  { id: "12", title: "Heeriye", artist: "Jasleen Royal", genre: "Pop" },
  { id: "13", title: "Dil Ko Karaar Aaya", artist: "Yasser Desai", genre: "Romance" },
  { id: "14", title: "Aaj Ki Raat", artist: "Arijit Singh", genre: "Bollywood" },
  { id: "15", title: "Perfect", artist: "Ed Sheeran", genre: "English" },
  { id: "16", title: "Shape of You", artist: "Ed Sheeran", genre: "English" },
  { id: "17", title: "Believer", artist: "Imagine Dragons", genre: "English" },
  { id: "18", title: "Faded", artist: "Alan Walker", genre: "EDM" },
  { id: "19", title: "Let Me Love You", artist: "DJ Snake", genre: "EDM" },
  { id: "20", title: "On My Way", artist: "Alan Walker", genre: "EDM" },
  { id: "21", title: "বাংলা গান ১", artist: "অজানা শিল্পী", genre: "Bangla" },
  { id: "22", title: "Mon Majhi Re", artist: "Arijit Singh", genre: "Bangla" },
  { id: "23", title: "Tomake Chai", artist: "Arijit Singh", genre: "Bangla" },
  { id: "24", title: "Tumi Jake Bhalobasho", artist: "Anupam Roy", genre: "Bangla" },
] as const;

export const STORY_MUSIC_LIBRARY: StoryMusicTrack[] = BASE_LIBRARY.map((track, idx) => ({
  ...track,
  audioUrl: AUDIO_SAMPLES[idx % AUDIO_SAMPLES.length],
}));

export function buildStoredMusicValue(track: StoryMusicTrack): string {
  return `track:${track.id}|${track.title} - ${track.artist}|url:${encodeURIComponent(track.audioUrl)}`;
}

export function resolveStoryMusic(storedValue: string | null | undefined): {
  track: StoryMusicTrack | null;
  label: string | null;
  audioUrl: string | null;
} {
  if (!storedValue) {
    return { track: null, label: null, audioUrl: null };
  }

  if (storedValue.startsWith("track:")) {
    const parts = storedValue.split("|");
    const idPart = parts[0] || "";
    const labelPart = parts[1] || null;
    const urlPart = parts.find((p) => p.startsWith("url:"));

    const trackId = idPart.replace("track:", "").trim();
    const track = STORY_MUSIC_LIBRARY.find((m) => m.id === trackId) || null;
    const decodedUrl = urlPart ? decodeURIComponent(urlPart.replace("url:", "")) : null;

    return {
      track,
      label: labelPart || (track ? `${track.title} - ${track.artist}` : storedValue),
      audioUrl: decodedUrl || track?.audioUrl || null,
    };
  }

  const legacyTrack = STORY_MUSIC_LIBRARY.find(
    (m) => storedValue === `${m.title} - ${m.artist}` || storedValue.includes(m.title)
  );

  if (legacyTrack) {
    return {
      track: legacyTrack,
      label: `${legacyTrack.title} - ${legacyTrack.artist}`,
      audioUrl: legacyTrack.audioUrl,
    };
  }

  return { track: null, label: storedValue, audioUrl: null };
}
