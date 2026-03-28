export type StoryMusicTrack = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  audioUrl: string;
};

const AUDIO_SAMPLES = [
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/61/1d/3f/611d3f53-8d7b-8455-c66a-af21f28db1cb/mzaf_3524364971696240598.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview113/v4/7f/59/3f/7f593fb3-8594-c204-dd28-3300eeb72fdf/mzaf_5581929441312244285.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/99/0c/38/990c381b-0530-8c0d-87a9-18b050b97f0a/mzaf_10418866714500530894.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview126/v4/62/33/1e/62331ea8-d1df-027d-fe75-ac16a519323d/mzaf_14381883946572745360.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview122/v4/09/51/0d/09510dea-6579-5cd0-b13b-696abc2c520b/mzaf_10718921821360997069.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/49/c8/c0/49c8c0eb-6a72-d639-02d2-d55fa0034b89/mzaf_6556689839136809010.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview126/v4/87/61/a9/8761a939-8e1c-678e-b186-09401480b314/mzaf_2211340113577128300.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/61/a9/59/61a95964-c914-f0fe-b99b-4348851c13ee/mzaf_750697725323217609.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/69/08/d6/6908d60e-563f-5d07-9bb5-737c9d90b59d/mzaf_9263362903198979589.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/78/23/75/78237534-1462-7779-165f-502bf22bed03/mzaf_15915982225370167762.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview116/v4/2d/c6/db/2dc6dbd2-5b6e-1650-dfc5-675907b0cc5b/mzaf_14301656417513282389.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/14/9b/ac/149bac62-12f1-2f55-a742-f38429b94c83/mzaf_17225240189976438593.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/71/44/d7/7144d73b-8adf-8c3f-6569-0be4cdaea2ec/mzaf_6701275063881530022.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/d1/90/95/d190958b-cb33-34b6-83d2-4d88b6ff1348/mzaf_8015651280578447253.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/c7/ba/bc/c7babc66-f598-aaa6-bcf6-307281795817/mzaf_16337361235117168274.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/44/c7/4f/44c74f0d-72dc-6143-d4d0-ba14d661ca0d/mzaf_9566898362556366703.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/7d/9c/8d/7d9c8d77-dc2c-6ab5-540a-063016ea0ee2/mzaf_13607919425161609621.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/f4/32/01/f43201b9-4bba-7654-2e43-d59e2d907e9f/mzaf_2440137894989713967.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/c3/d4/97/c3d497dd-d07c-ce2e-8fd8-53a4bc455d69/mzaf_8436241318329539958.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/18/7d/84/187d8423-7afb-ca00-0b58-4827b8f59b78/mzaf_4061403498102724235.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/72/e2/73/72e27320-2edd-1f03-aeca-54b7ab7abb0e/mzaf_8263246653446496245.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/c7/04/bd/c704bd29-fb73-31f2-9bf9-f4495b3a6000/mzaf_4118832859430908924.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/3b/a8/76/3ba8760e-78b9-0a68-5afa-ef3a83e5f044/mzaf_12526767281237329437.plus.aac.p.m4a",
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/6c/43/9b/6c439b15-aaba-6913-9f00-a55b07a0270c/mzaf_12068586767976177621.plus.aac.p.m4a",
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

    let decodedUrl: string | null = null;
    if (urlPart) {
      try {
        decodedUrl = decodeURIComponent(urlPart.replace("url:", ""));
      } catch {
        decodedUrl = null;
      }
    }

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
