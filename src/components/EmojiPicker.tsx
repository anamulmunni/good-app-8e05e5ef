import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

const EMOJI_CATEGORIES = [
  {
    name: "Smileys",
    emojis: ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎","🤓","🧐","😕","😟","🙁","☹️","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖"]
  },
  {
    name: "Gestures",
    emojis: ["👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🦾","🦿","🦵","🦶","👂","🦻","👃","🧠","🫀","🫁","🦷","🦴","👀","👁️","👅","👄"]
  },
  {
    name: "Hearts",
    emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","♥️","🫶","💑","💏","👨‍❤️‍👨","👩‍❤️‍👩"]
  },
  {
    name: "Animals",
    emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🐣","🐥","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜"]
  },
  {
    name: "Objects",
    emojis: ["🔥","⭐","🌟","✨","⚡","💥","🎉","🎊","🎈","🎁","🏆","🥇","🥈","🥉","⚽","🏀","🏈","⚾","🎾","🎮","🎯","🎲","🎵","🎶","🎤","🎧","🎸","🎹","🎺","🎻","📱","💻","⌚","📷","🔔","🔑","💎","💰","💳","🛒"]
  },
];

type EmojiPickerProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
};

export default function EmojiPicker({ isOpen, onClose, onSelect }: EmojiPickerProps) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 280, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-white dark:bg-card border-t border-gray-100 dark:border-border overflow-hidden"
        >
          {/* Category tabs */}
          <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 dark:border-border/50 overflow-x-auto scrollbar-hide">
            {EMOJI_CATEGORIES.map((cat, i) => (
              <button
                key={cat.name}
                onClick={() => setActiveTab(i)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                  activeTab === i
                    ? "bg-blue-100 dark:bg-primary/20 text-blue-600 dark:text-primary"
                    : "text-gray-500 hover:bg-gray-100 dark:hover:bg-secondary"
                }`}
              >
                {cat.emojis[0]} {cat.name}
              </button>
            ))}
            <div className="ml-auto shrink-0">
              <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-secondary">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Emoji grid */}
          <div className="overflow-y-auto px-2 py-1.5" style={{ height: 230 }}>
            <div className="grid grid-cols-8 gap-0.5">
              {EMOJI_CATEGORIES[activeTab].emojis.map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  onClick={() => onSelect(emoji)}
                  className="w-10 h-10 flex items-center justify-center text-[22px] rounded-lg hover:bg-gray-100 dark:hover:bg-secondary active:scale-90 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}