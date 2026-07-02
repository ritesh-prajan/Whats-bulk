import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  HelpCircle,
  QrCode,
  FileSpreadsheet,
  Settings,
  ShieldAlert,
  Paperclip,
  RefreshCw,
  Plus,
} from "lucide-react";

interface FaqModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FaqItem {
  question: string;
  answer: React.ReactNode;
  icon: React.ReactNode;
  category: "connection" | "data" | "safety" | "media";
}

export default function FaqModal({ isOpen, onClose }: FaqModalProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const categories = [
    { id: "all", name: "All Questions" },
    { id: "connection", name: "Connection" },
    { id: "data", name: "Data & Templates" },
    { id: "safety", name: "Safety & Limits" },
    { id: "media", name: "Media & Files" },
  ];

  const faqItems: FaqItem[] = [
    {
      category: "connection",
      icon: <QrCode className="w-4 h-4 text-emerald-400" />,
      question: "How do I link my WhatsApp account?",
      answer: (
        <p className="leading-relaxed">
          Ensure the server is running and wait 15 seconds for startup initialization. Once initialized, a QR Code will render in the <b>WhatsApp Linker</b> card. Open WhatsApp on your phone, navigate to <b>Linked Devices ➔ Link a Device</b>, and scan the QR Code.
        </p>
      ),
    },
    {
      category: "connection",
      icon: <RefreshCw className="w-4 h-4 text-sky-400" />,
      question: "What should I do if the connection is stuck or failing?",
      answer: (
        <div className="space-y-2">
          <p>If Puppeteer locks or loading fails, try these actions in order:</p>
          <ul className="list-disc pl-4 space-y-1 text-neutral-400">
            <li>Click <b>Soft Refresh</b> in the top bar to restart Puppeteer while retaining session data.</li>
            <li>Click <b>Disconnect</b> in the top bar to clear credentials and scan a new QR code.</li>
            <li>Use <b>Hard Reset</b> inside the terminal panel to completely wipe local file locks and restore a clean slate.</li>
          </ul>
        </div>
      ),
    },
    {
      category: "data",
      icon: <FileSpreadsheet className="w-4 h-4 text-blue-400" />,
      question: "What spreadsheet format is supported?",
      answer: (
        <p className="leading-relaxed">
          The pipeline accepts standard Excel files (<b>.xlsx</b>). Download the pre-formatted blueprint spreadsheet via the <b>Template</b> button inside the Excel Data card, fill in your fields, and drop it in to map instantly.
        </p>
      ),
    },
    {
      category: "data",
      icon: <FileSpreadsheet className="w-4 h-4 text-indigo-400" />,
      question: "How do dynamic template placeholders work?",
      answer: (
        <p className="leading-relaxed">
          You can reference any spreadsheet header column name in your campaign text by wrapping it in curly braces. For instance, if you have a column named <code>name</code> and <code>city</code>, using <code>{"\"Hello {name} from {city}!\""}</code> will compile into customized messages for each recipient.
        </p>
      ),
    },
    {
      category: "safety",
      icon: <ShieldAlert className="w-4 h-4 text-amber-500" />,
      question: "How do I prevent my WhatsApp account from getting banned?",
      answer: (
        <div className="space-y-2">
          <p>WhatsApp utilizes automated filters to flag bulk spam behavior. To secure your account, practice these precautions:</p>
          <ul className="list-disc pl-4 space-y-1 text-neutral-400">
            <li><b>Human Delays</b>: Keep cooldown delay between messages at 5-15 seconds.</li>
            <li><b>Batching Intervals</b>: Use batch pauses (e.g. pause for 3-5 minutes every 20 messages).</li>
            <li><b>Dynamic Text</b>: Avoid sending identical copy; use placeholders to keep every message unique.</li>
            <li><b>Limits</b>: Keep large broadcasts under 500 contacts per device per day.</li>
          </ul>
        </div>
      ),
    },
    {
      category: "media",
      icon: <Paperclip className="w-4 h-4 text-pink-400" />,
      question: "Can I send media attachments or documents?",
      answer: (
        <p className="leading-relaxed">
          Yes! You can attach files up to 10MB. The engine supports **images** (jpeg/png), **videos** (mp4), **audios** (mp3/ogg), **PDFs**, and **Word documents** (.doc/.docx). These will be dispatched as media messages with your custom text as the caption.
        </p>
      ),
    },
  ];

  const filteredItems = faqItems.filter(
    (item) => activeCategory === "all" || item.category === activeCategory
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/85 backdrop-blur-md"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", duration: 0.4 }}
          className="relative w-full max-w-2xl bg-zinc-950/90 border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="p-6 bg-zinc-900/60 border-b border-white/5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center shadow-lg">
                <HelpCircle className="w-5 h-5 text-brand" />
              </div>
              <div className="text-left">
                <span className="text-[10px] font-bold text-brand uppercase tracking-widest leading-none">
                  Faq Helper
                </span>
                <h4 className="text-sm font-bold text-white tracking-tight mt-0.5">
                  Frequently Asked Questions
                </h4>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-900/60 border border-white/5 flex items-center justify-center text-neutral-400 hover:text-white transition-all cursor-pointer hover:border-white/15"
            >
              <X size={15} />
            </button>
          </div>

          {/* Categories Tab selector */}
          <div className="px-6 py-3 bg-zinc-900/30 border-b border-white/5 flex gap-2 overflow-x-auto shrink-0 custom-scrollbar select-none">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  setExpandedIndex(null);
                }}
                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 border ${
                  activeCategory === cat.id
                    ? "bg-brand text-black border-brand font-black"
                    : "bg-zinc-900 border-white/5 text-gray-400 hover:text-white"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Accordion Questions List */}
          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-3">
            {filteredItems.map((item, idx) => {
              const isExpanded = expandedIndex === idx;
              return (
                <div
                  key={idx}
                  className={`border rounded-2xl bg-zinc-900/40 transition-all duration-300 ${
                    isExpanded ? "border-brand/30 shadow-[0_4px_20px_rgba(37,211,102,0.03)]" : "border-white/5 hover:border-white/10"
                  }`}
                >
                  {/* Collapsible trigger Header */}
                  <button
                    onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                    className="w-full p-4 flex items-center justify-between text-left gap-4 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-zinc-950 rounded-lg border border-white/5">
                        {item.icon}
                      </div>
                      <span className="text-xs font-bold text-white tracking-wide">
                        {item.question}
                      </span>
                    </div>
                    <div
                      className={`text-gray-500 transform transition-transform duration-300 ${
                        isExpanded ? "rotate-45 text-brand" : ""
                      }`}
                    >
                      <Plus size={16} />
                    </div>
                  </button>

                  {/* Body container */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden border-t border-white/5"
                      >
                        <div className="p-4 text-xs text-neutral-300 font-medium leading-relaxed bg-zinc-950/20 text-left font-sans select-text">
                          {item.answer}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {filteredItems.length === 0 && (
              <p className="text-center py-12 text-xs text-gray-500 font-mono italic">
                No questions found under this category.
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
