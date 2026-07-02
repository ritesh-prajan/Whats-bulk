import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Send,
  Upload,
  Settings,
  Terminal,
  QrCode,
  FileSpreadsheet,
  CheckCircle,
  Play,
  Sparkles,
  HelpCircle,
  Eye,
} from "lucide-react";

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Step {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  color: string;
}

export default function TutorialModal({ isOpen, onClose }: TutorialModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps: Step[] = [
    {
      title: "Welcome to WHATS-BULK",
      subtitle: "Enterprise-grade WhatsApp Campaign Engine",
      icon: <Sparkles className="w-8 h-8 text-brand animate-pulse" />,
      color: "from-emerald-500/20 to-teal-500/10",
      content: (
        <div className="space-y-4 text-center">
          <p className="text-sm text-neutral-300 leading-relaxed max-w-md mx-auto">
            Experience high-performance, dynamic bulk WhatsApp messaging designed for modern outreach pipelines. This tutorial will briefly walk you through its core capabilities so you can get started seamlessly.
          </p>
          <div className="grid grid-cols-3 gap-3 pt-4">
            <div className="bg-zinc-900/60 p-3 rounded-xl border border-white/5 flex flex-col items-center">
              <QrCode className="w-5 h-5 text-emerald-400 mb-1" />
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">1. Link</span>
              <p className="text-[9px] text-neutral-500 text-center mt-1 leading-tight">Secure session with QR code</p>
            </div>
            <div className="bg-zinc-900/60 p-3 rounded-xl border border-white/5 flex flex-col items-center">
              <Upload className="w-5 h-5 text-blue-400 mb-1" />
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">2. Upload</span>
              <p className="text-[9px] text-neutral-500 text-center mt-1 leading-tight">Excel sheet mapping</p>
            </div>
            <div className="bg-zinc-900/60 p-3 rounded-xl border border-white/5 flex flex-col items-center">
              <Send className="w-5 h-5 text-brand mb-1" />
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">3. Launch</span>
              <p className="text-[9px] text-neutral-500 text-center mt-1 leading-tight">Realtime delivery</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "1. Scan & Authenticate",
      subtitle: "Connecting Your Account",
      icon: <QrCode className="w-8 h-8 text-emerald-400" />,
      color: "from-emerald-500/20 to-green-500/10",
      content: (
        <div className="space-y-4">
          <p className="text-sm text-neutral-300 leading-relaxed">
            Link your WhatsApp account using the QR code in the <b>WhatsApp Linker</b> panel:
          </p>
          <div className="space-y-2 bg-zinc-950/60 p-3 rounded-xl border border-white/5 font-mono text-xs text-neutral-400">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span>DISCONNECTED: Client starting up...</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
              <span>QR READY: Scan from your device's Linked Devices screen</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>CONNECTED: Ready to dispatch high-speed campaigns!</span>
            </div>
          </div>
          <p className="text-[11px] text-neutral-500 leading-tight italic">
            💡 Pro-Tip: You can use the "Soft Refresh" reload button to safely recreate connections without losing your login status.
          </p>
        </div>
      ),
    },
    {
      title: "2. Bulk Contact & Mapping",
      subtitle: "Uploading Excel Lists with Smart Variables",
      icon: <FileSpreadsheet className="w-8 h-8 text-blue-400" />,
      color: "from-blue-500/20 to-indigo-500/10",
      content: (
        <div className="space-y-4">
          <p className="text-sm text-neutral-300 leading-relaxed">
            Drag & drop or upload your recipient spreadsheet in the <b>Contact Pipeline</b>. Our smart mapper will instantly auto-detect key headers:
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-white/5">
              <div className="font-bold text-white mb-1">Dynamic Placeholders</div>
              <p className="text-[10px] text-neutral-400 leading-tight">
                Use variables like <code className="text-brand bg-brand/10 px-1 rounded">{"{{name}}"}</code> inside your template to personalize every message dynamically.
              </p>
            </div>
            <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-white/5">
              <div className="font-bold text-white mb-1">Multi-Format Attachments</div>
              <p className="text-[10px] text-neutral-400 leading-tight">
                Attach images, PDF files, custom titles, and message text blocks with dynamic parameters.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "3. Advanced Settings",
      subtitle: "Avoid Bans with Human Simulation Behavior",
      icon: <Settings className="w-8 h-8 text-amber-400" />,
      color: "from-amber-500/20 to-orange-500/10",
      content: (
        <div className="space-y-4">
          <p className="text-sm text-neutral-300 leading-relaxed">
            Fine-tune delivery parameters in the <b>Engine Settings</b> panel to ensure secure, compliant dispatching:
          </p>
          <ul className="space-y-2 text-xs text-neutral-300">
            <li className="flex items-start gap-2">
              <span className="text-amber-400 font-bold shrink-0">⏱️ Min/Max Delay:</span>
              <span>Sets the humanized interval between messages (e.g., 5-15 seconds) to mimic user behavior.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400 font-bold shrink-0">🛑 Safety Limits:</span>
              <span>Halt sending after a specific limit to stay within carrier quotas.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400 font-bold shrink-0">📊 Batch Sizes:</span>
              <span>Set batch parameters for large scale campaigns.</span>
            </li>
          </ul>
        </div>
      ),
    },
    {
      title: "4. Mission Control & Terminal",
      subtitle: "Real-time Tracking & Interactive Logs",
      icon: <Terminal className="w-8 h-8 text-pink-400 animate-pulse" />,
      color: "from-pink-500/20 to-red-500/10",
      content: (
        <div className="space-y-4">
          <p className="text-sm text-neutral-300 leading-relaxed">
            Monitor campaigns live using <b>Mission Control</b> and the <b>Interactive Terminal Logs</b>:
          </p>
          <div className="space-y-2 bg-zinc-950/60 p-3 rounded-xl border border-white/5 font-mono text-[10px]">
            <div className="flex justify-between border-b border-white/5 pb-1 mb-1.5">
              <span className="text-neutral-500">REALTIME PIPELINE MONITOR</span>
              <span className="text-brand animate-pulse">● LIVE</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Total Contacts Loaded:</span>
              <span className="text-white font-bold">142</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-emerald-400">Sent Success Rate:</span>
              <span className="text-emerald-400 font-bold">98%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sky-400">Time Left (Est.):</span>
              <span className="text-sky-400 font-bold">~2 mins</span>
            </div>
          </div>
          <p className="text-[11px] text-neutral-500 leading-tight">
            Read granular feedback from the sandbox console, inspect warning codes, trace transmission paths, and export raw logs easily.
          </p>
        </div>
      ),
    },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem("whats_bulk_tutorial_seen", "true");
    onClose();
    setCurrentStep(0);
  };

  const handleSkip = () => {
    handleComplete();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleSkip}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", duration: 0.5 }}
          className="relative w-full max-w-lg bg-zinc-950/90 border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8),0_0_30px_rgba(37,211,102,0.05)] flex flex-col"
        >
          {/* Top Decorative Color Accent */}
          <div
            className={`h-24 bg-gradient-to-b ${steps[currentStep].color} flex items-center justify-between px-6 border-b border-white/5 shrink-0`}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900/80 border border-white/10 flex items-center justify-center shadow-lg">
                {steps[currentStep].icon}
              </div>
              <div className="text-left">
                <span className="text-[10px] font-bold text-brand uppercase tracking-widest leading-none">
                  Tutorial Guide
                </span>
                <h4 className="text-sm font-bold text-white tracking-tight mt-0.5">
                  {steps[currentStep].subtitle}
                </h4>
              </div>
            </div>

            <button
              onClick={handleSkip}
              className="w-8 h-8 rounded-full bg-zinc-900/60 border border-white/5 flex items-center justify-center text-neutral-400 hover:text-white transition-all cursor-pointer hover:border-white/15"
              title="Skip Tutorial"
            >
              <X size={15} />
            </button>
          </div>

          {/* Main Body */}
          <div className="p-6 md:p-8 flex-1 flex flex-col min-h-0 overflow-y-auto">
            <div className="flex-1 space-y-4">
              <div className="text-left">
                <h2 className="text-xl font-bold text-white tracking-tight leading-snug">
                  {steps[currentStep].title}
                </h2>
              </div>

              {/* Dynamic Step Content */}
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="text-left"
              >
                {steps[currentStep].content}
              </motion.div>
            </div>

            {/* Stepped Progress Dots */}
            <div className="flex items-center justify-center gap-1.5 pt-8 pb-4">
              {steps.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentStep(index)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === currentStep ? "w-8 bg-brand" : "w-1.5 bg-neutral-800 hover:bg-neutral-700"
                  }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>

            {/* Action Bar */}
            <div className="flex justify-between items-center mt-auto border-t border-white/5 pt-4">
              {/* Skip or Back */}
              <div>
                {currentStep > 0 ? (
                  <button
                    onClick={handleBack}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-neutral-400 hover:text-white transition-all cursor-pointer bg-transparent border border-transparent rounded-full"
                  >
                    <ChevronLeft size={14} />
                    Back
                  </button>
                ) : (
                  <button
                    onClick={handleSkip}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-neutral-500 hover:text-neutral-300 transition-all cursor-pointer"
                  >
                    Skip Setup
                  </button>
                )}
              </div>

              {/* Next/Complete Button */}
              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 bg-brand text-black px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider hover:bg-brand/95 transition-all shadow-[0_4px_12px_rgba(37,211,102,0.15)] cursor-pointer hover:shadow-[0_4px_20px_rgba(37,211,102,0.3)] hover:scale-[1.02] active:scale-95"
              >
                {currentStep === steps.length - 1 ? (
                  <>
                    Launch App
                    <Play size={13} className="fill-current" />
                  </>
                ) : (
                  <>
                    Next Step
                    <ChevronRight size={13} />
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
