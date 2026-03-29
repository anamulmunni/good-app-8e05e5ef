// Curated free sample short videos from Pexels (CC0 / free to use)
// These auto-populate the Reels section so users always have content to watch

export interface SampleReel {
  id: string;
  video_url: string;
  caption: string;
  creator: string;
  category: string;
}

export const SAMPLE_REELS: SampleReel[] = [
  // Nature & Scenery
  { id: "s1", video_url: "https://videos.pexels.com/video-files/3571264/3571264-sd_506_960_25fps.mp4", caption: "🌊 সমুদ্রের ঢেউয়ের শান্তি", creator: "Nature Vibes", category: "nature" },
  { id: "s2", video_url: "https://videos.pexels.com/video-files/1409899/1409899-sd_640_360_25fps.mp4", caption: "🌅 সূর্যাস্তের রং", creator: "Sky Lover", category: "nature" },
  { id: "s3", video_url: "https://videos.pexels.com/video-files/2491284/2491284-sd_640_360_24fps.mp4", caption: "🌿 সবুজ প্রকৃতির মাঝে", creator: "Green World", category: "nature" },
  { id: "s4", video_url: "https://videos.pexels.com/video-files/1826896/1826896-sd_640_360_30fps.mp4", caption: "🌸 ফুলের সৌন্দর্য", creator: "Floral Art", category: "nature" },
  { id: "s5", video_url: "https://videos.pexels.com/video-files/3194277/3194277-sd_506_960_30fps.mp4", caption: "🌧️ বৃষ্টির দিনে মন ভালো", creator: "Rain Mood", category: "nature" },
  { id: "s6", video_url: "https://videos.pexels.com/video-files/856974/856974-sd_640_360_30fps.mp4", caption: "⛰️ পাহাড়ের চূড়ায়", creator: "Mountain Life", category: "nature" },
  { id: "s7", video_url: "https://videos.pexels.com/video-files/1093662/1093662-sd_640_360_30fps.mp4", caption: "🌻 রোদেলা সকাল", creator: "Morning Vibes", category: "nature" },
  { id: "s8", video_url: "https://videos.pexels.com/video-files/2795173/2795173-sd_506_960_25fps.mp4", caption: "🍂 শরতের পাতা ঝরা", creator: "Autumn Days", category: "nature" },

  // City & Travel
  { id: "s9", video_url: "https://videos.pexels.com/video-files/3129671/3129671-sd_506_960_25fps.mp4", caption: "🏙️ শহরের রাতের আলো", creator: "City Explorer", category: "city" },
  { id: "s10", video_url: "https://videos.pexels.com/video-files/3015510/3015510-sd_506_960_24fps.mp4", caption: "🚗 রাস্তায় ড্রাইভিং", creator: "Road Trip", category: "city" },
  { id: "s11", video_url: "https://videos.pexels.com/video-files/2759477/2759477-sd_506_960_25fps.mp4", caption: "✈️ ভ্রমণের আনন্দ", creator: "Wanderlust", category: "travel" },
  { id: "s12", video_url: "https://videos.pexels.com/video-files/4065924/4065924-sd_506_960_25fps.mp4", caption: "🌃 নিওন লাইটে শহর", creator: "Neon City", category: "city" },

  // Food
  { id: "s13", video_url: "https://videos.pexels.com/video-files/3298572/3298572-sd_506_960_25fps.mp4", caption: "🍕 খাবারের ভালোবাসা", creator: "Food Lover", category: "food" },
  { id: "s14", video_url: "https://videos.pexels.com/video-files/3252122/3252122-sd_506_960_25fps.mp4", caption: "☕ এক কাপ চায়ে সুখ", creator: "Tea Time", category: "food" },
  { id: "s15", video_url: "https://videos.pexels.com/video-files/4253248/4253248-sd_506_960_25fps.mp4", caption: "🍰 মিষ্টি মুহূর্ত", creator: "Sweet Life", category: "food" },

  // Animals
  { id: "s16", video_url: "https://videos.pexels.com/video-files/4884243/4884243-sd_506_960_25fps.mp4", caption: "🐱 বিড়ালের কিউটনেস", creator: "Cat World", category: "animals" },
  { id: "s17", video_url: "https://videos.pexels.com/video-files/4562551/4562551-sd_506_960_25fps.mp4", caption: "🐶 কুকুরের ভালোবাসা", creator: "Dog Life", category: "animals" },
  { id: "s18", video_url: "https://videos.pexels.com/video-files/5528181/5528181-sd_506_960_25fps.mp4", caption: "🦋 প্রজাপতির উড়াল", creator: "Wildlife", category: "animals" },

  // Aesthetic & Mood
  { id: "s19", video_url: "https://videos.pexels.com/video-files/4434242/4434242-sd_506_960_25fps.mp4", caption: "✨ এসথেটিক ভাইবস", creator: "Aesthetic", category: "aesthetic" },
  { id: "s20", video_url: "https://videos.pexels.com/video-files/4763824/4763824-sd_506_960_25fps.mp4", caption: "🌙 রাতের নীরবতা", creator: "Night Owl", category: "aesthetic" },
  { id: "s21", video_url: "https://videos.pexels.com/video-files/5377684/5377684-sd_506_960_25fps.mp4", caption: "💫 স্বপ্নের মতো মুহূর্ত", creator: "Dream World", category: "aesthetic" },
  { id: "s22", video_url: "https://videos.pexels.com/video-files/4812203/4812203-sd_506_960_25fps.mp4", caption: "🎭 আর্ট ও ক্রিয়েটিভিটি", creator: "Art Studio", category: "aesthetic" },

  // Water & Ocean  
  { id: "s23", video_url: "https://videos.pexels.com/video-files/1093665/1093665-sd_640_360_30fps.mp4", caption: "🏖️ সমুদ্র সৈকতে একদিন", creator: "Beach Life", category: "nature" },
  { id: "s24", video_url: "https://videos.pexels.com/video-files/1918465/1918465-sd_640_360_24fps.mp4", caption: "💧 পানির প্রবাহ", creator: "Water Flow", category: "nature" },

  // Sky & Space
  { id: "s25", video_url: "https://videos.pexels.com/video-files/857251/857251-sd_640_360_30fps.mp4", caption: "☁️ মেঘের রাজ্যে", creator: "Cloud Nine", category: "sky" },
  { id: "s26", video_url: "https://videos.pexels.com/video-files/854669/854669-sd_640_360_30fps.mp4", caption: "🌌 তারার আকাশ", creator: "Stargazer", category: "sky" },

  // Lifestyle
  { id: "s27", video_url: "https://videos.pexels.com/video-files/4065388/4065388-sd_506_960_25fps.mp4", caption: "🎵 মিউজিক ভাইবস", creator: "Music Mood", category: "lifestyle" },
  { id: "s28", video_url: "https://videos.pexels.com/video-files/5752729/5752729-sd_506_960_25fps.mp4", caption: "📚 পড়াশোনার সময়", creator: "Study Life", category: "lifestyle" },
  { id: "s29", video_url: "https://videos.pexels.com/video-files/4066797/4066797-sd_506_960_25fps.mp4", caption: "🎨 রঙের খেলা", creator: "Color Play", category: "lifestyle" },
  { id: "s30", video_url: "https://videos.pexels.com/video-files/3944076/3944076-sd_506_960_25fps.mp4", caption: "🏃 ফিটনেস গোল", creator: "Fit Life", category: "lifestyle" },

  // More nature
  { id: "s31", video_url: "https://videos.pexels.com/video-files/2330767/2330767-sd_640_360_24fps.mp4", caption: "🌈 রংধনু দেখা দিলো", creator: "Rainbow", category: "nature" },
  { id: "s32", video_url: "https://videos.pexels.com/video-files/3843536/3843536-sd_506_960_25fps.mp4", caption: "🔥 আগুনের শিখা", creator: "Fire Art", category: "aesthetic" },
  { id: "s33", video_url: "https://videos.pexels.com/video-files/4328713/4328713-sd_506_960_25fps.mp4", caption: "🌺 গোলাপের বাগান", creator: "Rose Garden", category: "nature" },
  { id: "s34", video_url: "https://videos.pexels.com/video-files/4434165/4434165-sd_506_960_25fps.mp4", caption: "🎐 বাতাসের গান", creator: "Wind Song", category: "aesthetic" },
  { id: "s35", video_url: "https://videos.pexels.com/video-files/5147626/5147626-sd_506_960_25fps.mp4", caption: "💐 সুন্দর সকাল", creator: "Good Morning", category: "nature" },

  // More city
  { id: "s36", video_url: "https://videos.pexels.com/video-files/2675513/2675513-sd_506_960_25fps.mp4", caption: "🌉 ব্রিজের আলো", creator: "Bridge View", category: "city" },
  { id: "s37", video_url: "https://videos.pexels.com/video-files/4169576/4169576-sd_506_960_25fps.mp4", caption: "🎡 ফেরিস হুইল", creator: "Fun Time", category: "city" },
  { id: "s38", video_url: "https://videos.pexels.com/video-files/4793729/4793729-sd_506_960_25fps.mp4", caption: "🏗️ আধুনিক স্থাপত্য", creator: "Architecture", category: "city" },

  // More aesthetic
  { id: "s39", video_url: "https://videos.pexels.com/video-files/4920465/4920465-sd_506_960_25fps.mp4", caption: "🕯️ মোমবাতির আলো", creator: "Candle Light", category: "aesthetic" },
  { id: "s40", video_url: "https://videos.pexels.com/video-files/4999610/4999610-sd_506_960_25fps.mp4", caption: "💜 বেগুনি স্বপ্ন", creator: "Purple Dream", category: "aesthetic" },
];

// Shuffle and return sample reels
export function getShuffledSampleReels(): SampleReel[] {
  const shuffled = [...SAMPLE_REELS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
