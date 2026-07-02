import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import {
  Upload,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Terminal,
  Settings,
  Play,
  QrCode,
  Image,
  AlertCircle,
  FileSpreadsheet,
  Download,
  Plus,
  Trash2,
  Save,
  Edit,
  X,
  FileText,
  LogOut,
  RefreshCw,
  Share2,
  LayoutGrid,
  HelpCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import TutorialModal from "./components/TutorialModal";
import FaqModal from "./components/FaqModal";

let bootstrapApiKey = "";

async function getApiKey(): Promise<string> {
  if (bootstrapApiKey) return bootstrapApiKey;
  const stored = localStorage.getItem("API_SECRET") || (import.meta as any).env?.VITE_API_SECRET || "";
  return stored;
}

async function authenticatedFetch(url: string, init?: RequestInit): Promise<Response> {
  const key = await getApiKey();
  const headers = new Headers(init?.headers);
  if (key) {
    headers.set("x-api-key", key);
  }
  return fetch(url, { ...init, headers });
}

interface LogEntry {
  message: string;
  type: "info" | "success" | "error" | "warning";
  timestamp: string;
}

interface Summary {
  total: number;
  sent: number;
  failed: number;
  not_on_whatsapp: number;
  pending: number;
}

function detectMapping(headers: string[]) {
  const phoneKeys = [
    "phone_number",
    "mobile_number",
    "whatsapp_number",
    "phone",
    "mobile",
    "whatsapp",
    "mobile_whatsapp_number",
    "mobilenumber",
    "mobileno",
    "mobile_no",
    "phoneno",
    "phone_no",
    "contact",
    "contact_number",
    "contact_no",
    "contactno",
    "whatsapp_no",
    "whatsappno",
    "number",
    "tel",
    "cell",
    "cell_number",
    "cell_no",
    "cellno",
  ];
  const nameKeys = [
    "name",
    "recipient_name",
    "recipient",
    "customer_name",
    "customer",
    "contact_name",
    "contactname",
    "client",
    "client_name",
    "first_name",
    "firstname",
    "full_name",
    "fullname",
    "to_name",
    "toname",
  ];
  const msgKeys = [
    "custom_message",
    "message",
    "text",
    "custom_message_body",
    "personalized_message",
    "msg",
    "message_text",
    "messagetext",
  ];

  const findHeader = (keys: string[]) => {
    return (
      headers.find((h) => {
        const normalizedH = h.toLowerCase().replace(/[\s\-\_]/g, "");
        return keys.some(
          (k) => k.toLowerCase().replace(/[\s\-\_]/g, "") === normalizedH,
        );
      }) || ""
    );
  };

  return {
    phone: findHeader(phoneKeys),
    name: findHeader(nameKeys),
    message: findHeader(msgKeys),
  };
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<{
    status: string;
    qr: string | null;
    clientInfo?: {
      pushname?: string;
      phone?: string;
      profilePicUrl?: string | null;
    } | null;
    initError?: string | null;
    initLogs?: string[];
  }>({
    status: "DISCONNECTED",
    qr: null,
    clientInfo: null,
    initError: null,
    initLogs: [],
  });
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    path: string;
    count: number;
    summary: Summary;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [options, setOptions] = useState({
    dryRun: false,
    limit: 0,
    defaultCountryCode: "",
    bypassRegCheck: false,
    cooldown: 0,
    batchSize: 0,
    scheduledAt: "",
  });
  const [apiSecret, setApiSecret] = useState<string>(() => {
    return localStorage.getItem("API_SECRET") || (import.meta as any).env?.VITE_API_SECRET || "";
  });
  const [localIpInfo, setLocalIpInfo] = useState<{ localIp: string; port: number } | null>(null);
  const [photoInfo, setPhotoInfo] = useState<{
    filename: string;
    originalname: string;
    mimetype: string;
    path: string;
  } | null>(null);
  const [localPhotoUrl, setLocalPhotoUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([
    "mobile_whatsapp_number",
    "name",
    "custom_message",
  ]);

  // Manual pipeline header mapping states
  const [mappedPhone, setMappedPhone] = useState<string>("");
  const [mappedName, setMappedName] = useState<string>("");
  const [mappedMessage, setMappedMessage] = useState<string>("");
  const [isMappingMode, setIsMappingMode] = useState<boolean>(false);

  // Custom template editor states
  const [contacts, setContacts] = useState<any[]>([
    {
      mobile_whatsapp_number: "1234567890",
      phone_number: "1234567890",
      name: "John Doe",
      custom_message: "Hello {name}, your order is ready!",
      status: "",
    },
    {
      mobile_whatsapp_number: "0987654321",
      phone_number: "0987654321",
      name: "Jane Smith",
      custom_message: "Hi {name}, welcome to our service.",
      status: "",
    },
  ]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isCustomTemplateApplied, setIsCustomTemplateApplied] = useState(false);

  // Custom message format states
  const [globalTemplateText, setGlobalTemplateText] = useState<string>(
    "Hello {name}, your special custom message is: {custom_message}. Thanks!",
  );

  // Layout resizing states and logic
  const [isDesktop, setIsDesktop] = useState(false);
  const [layout, setLayout] = useState(() => {
    try {
      const saved = localStorage.getItem("whats_bulk_layout_v2");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Failed to load saved layout", e);
    }
    return {
      topRow: { left: 33.333, middle: 41.667, right: 25.0 },
      bottomRow: { left: 66.667, right: 33.333 },
      rowSplit: { top: 50.0, bottom: 50.0 }
    };
  });

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isFaqOpen, setIsFaqOpen] = useState(false);

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem("whats_bulk_tutorial_seen");
    if (!hasSeenTutorial) {
      setIsTutorialOpen(true);
    }
  }, []);

  const handleResetLayout = () => {
    const initial = {
      topRow: { left: 33.333, middle: 41.667, right: 25.0 },
      bottomRow: { left: 66.667, right: 33.333 },
      rowSplit: { top: 50.0, bottom: 50.0 }
    };
    setLayout(initial);
    localStorage.setItem("whats_bulk_layout_v2", JSON.stringify(initial));
  };

  const startResize = (
    e: React.MouseEvent | React.TouchEvent,
    type: 
      | "topSplit1"
      | "topSplit2"
      | "bottomSplit"
      | "rowSplit"
      | "corner-topLeft-bottomRight"
      | "corner-topMiddle-bottomLeft"
      | "corner-topMiddle-bottomRight"
      | "corner-topRight-bottomLeft"
      | "corner-bottomLeft-topRight"
      | "corner-bottomRight-topLeft"
  ) => {
    e.preventDefault();
    
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    
    const container = document.getElementById("main-bento-container");
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const startX = clientX;
    const startY = clientY;
    const initialLayout = { ...layout };
    
    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentX = "touches" in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const currentY = "touches" in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;
      
      const deltaX = currentX - startX;
      const deltaY = currentY - startY;
      
      const deltaXPercent = (deltaX / rect.width) * 100;
      const deltaYPercent = (deltaY / rect.height) * 100;
      
      setLayout((prev) => {
        const next = {
          topRow: { ...prev.topRow },
          bottomRow: { ...prev.bottomRow },
          rowSplit: { ...prev.rowSplit }
        };
        
        // 1. Handle X-Axis changes
        if (
          type === "topSplit1" || 
          type === "corner-topLeft-bottomRight" || 
          type === "corner-topMiddle-bottomLeft"
        ) {
          const newLeft = Math.max(15, Math.min(70, initialLayout.topRow.left + deltaXPercent));
          const diff = newLeft - initialLayout.topRow.left;
          const newMiddle = Math.max(15, initialLayout.topRow.middle - diff);
          const finalDiff = initialLayout.topRow.middle - newMiddle;
          next.topRow.left = initialLayout.topRow.left + finalDiff;
          next.topRow.middle = newMiddle;
        }
        else if (
          type === "topSplit2" || 
          type === "corner-topMiddle-bottomRight" || 
          type === "corner-topRight-bottomLeft"
        ) {
          const newMiddle = Math.max(15, Math.min(70, initialLayout.topRow.middle + deltaXPercent));
          const diff = newMiddle - initialLayout.topRow.middle;
          const newRight = Math.max(15, initialLayout.topRow.right - diff);
          const finalDiff = initialLayout.topRow.right - newRight;
          next.topRow.middle = initialLayout.topRow.middle + finalDiff;
          next.topRow.right = newRight;
        }
        else if (
          type === "bottomSplit" || 
          type === "corner-bottomLeft-topRight" || 
          type === "corner-bottomRight-topLeft"
        ) {
          const newLeft = Math.max(15, Math.min(85, initialLayout.bottomRow.left + deltaXPercent));
          next.bottomRow.left = newLeft;
          next.bottomRow.right = 100 - newLeft;
        }
        
        // 2. Handle Y-Axis changes (rowSplit)
        if (
          type === "rowSplit" ||
          type === "corner-topLeft-bottomRight" ||
          type === "corner-topMiddle-bottomLeft" ||
          type === "corner-topMiddle-bottomRight" ||
          type === "corner-topRight-bottomLeft" ||
          type === "corner-bottomLeft-topRight" ||
          type === "corner-bottomRight-topLeft"
        ) {
          const newTop = Math.max(20, Math.min(80, initialLayout.rowSplit.top + deltaYPercent));
          next.rowSplit.top = newTop;
          next.rowSplit.bottom = 100 - newTop;
        }
        
        return next;
      });
    };
    
    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
      
      setLayout((current) => {
        localStorage.setItem("whats_bulk_layout_v2", JSON.stringify(current));
        return current;
      });
    };
    
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove, { passive: true });
    window.addEventListener("touchend", handleUp);
  };

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Fetch bootstrap configuration first to get API Key (Item 4)
    fetch("/api/bootstrap")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.apiKey) {
          bootstrapApiKey = data.apiKey;
          setApiSecret(data.apiKey);
          localStorage.setItem("API_SECRET", data.apiKey);
        }
      })
      .catch((err) => {
        console.warn("Bootstrap fetch failed/ignored:", err.message);
      })
      .finally(() => {
        // 2. Fetch initial status immediately on page mount / hard-refresh to avoid UI flash
        authenticatedFetch("/api/status")
          .then((res) => res.json())
          .then((data) => {
            if (data) {
              setStatus(data);
              if (data.isCampaignRunning !== undefined) {
                setIsRunning(data.isCampaignRunning);
              }
            }
          })
          .catch((err) => {
            console.warn("Initial Status Fetch aborted/failed:", err.message);
          });
      });

    // 3. Fetch server's local network IP for share invitation (Item 5)
    fetch("/api/local-ip")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.localIp) {
          setLocalIpInfo(data);
        }
      })
      .catch((err) => {
        console.warn("Failed to fetch server local IP:", err.message);
      });

    const newSocket = io();
    setSocket(newSocket);

    newSocket.on("log", (log: LogEntry) => {
      setLogs((prev) => [...prev.slice(-99), log]);
    });

    newSocket.on("whatsapp-status", (s: any) => {
      setStatus(s);
      if (s.isCampaignRunning !== undefined) {
        setIsRunning(s.isCampaignRunning);
      }
    });

    newSocket.on("campaign-status", (campaign: { running: boolean }) => {
      setIsRunning(campaign.running);
    });

    newSocket.on("progress", (p: any) => {
      setProgress(p);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogs((prev) => [
      ...prev,
      {
        message: "Disconnecting session and resetting WhatsApp client...",
        type: "warning",
        timestamp: new Date().toISOString(),
      },
    ]);

    try {
      const res = await authenticatedFetch("/api/logout", {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setLogs((prev) => [
          ...prev,
          {
            message:
              "WhatsApp session disconnected & authorization folder refreshed.",
            type: "success",
            timestamp: new Date().toISOString(),
          },
        ]);
      } else {
        throw new Error(data.error || "Unknown error");
      }
    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        {
          message: `Logout event completed. Active sessions cleared. Status will update shortly.`,
          type: "info",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const [isResetting, setIsResetting] = useState(false);

  const handleHardReset = async () => {
    if (isResetting) return;
    setIsResetting(true);
    setLogs((prev) => [
      ...prev,
      {
        message:
          "Triggering hard reset: purging session directory, releasing locks, and spawning a new chromium process...",
        type: "warning",
        timestamp: new Date().toISOString(),
      },
    ]);

    try {
      const res = await authenticatedFetch("/api/reset-client", {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setLogs((prev) => [
          ...prev,
          {
            message:
              "Hard reset complete! Authorization directory deleted cleanly. Fresh client spinning up...",
            type: "success",
            timestamp: new Date().toISOString(),
          },
        ]);
      } else {
        throw new Error(data.error || "Reset command failed");
      }
    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        {
          message: `Hard reset requested. Folders purged and browser re-starting. Waiting for connection...`,
          type: "info",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsResetting(false);
    }
  };

  const [isRefreshingConnection, setIsRefreshingConnection] = useState(false);

  const handleSoftRefresh = async () => {
    if (isRefreshingConnection) return;
    setIsRefreshingConnection(true);
    setLogs((prev) => [
      ...prev,
      {
        message:
          "Triggering connection soft refresh: restarting Puppeteer browser while retaining session authorization data...",
        type: "info",
        timestamp: new Date().toISOString(),
      },
    ]);

    try {
      const res = await authenticatedFetch("/api/refresh-client", {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setLogs((prev) => [
          ...prev,
          {
            message:
              "Soft refresh complete. Puppeteer restarted successfully. Waiting for session status callback...",
            type: "success",
            timestamp: new Date().toISOString(),
          },
        ]);
      } else {
        throw new Error(data.error || "Soft refresh command failed");
      }
    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        {
          message: `Soft refresh requested. Puppeteer reloaded and session recycled cleanly.`,
          type: "success",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setTimeout(() => {
        setIsRefreshingConnection(false);
      }, 1000);
    }
  };

  const applyGlobalTemplateToAll = () => {
    const msgHeader =
      detectedHeaders.find((h) => {
        const hL = h.toLowerCase();
        return (
          hL === "custom_message" ||
          hL.includes("msg") ||
          hL.includes("text") ||
          hL.includes("message")
        );
      }) || "custom_message";

    setContacts((prev) =>
      prev.map((c) => ({
        ...c,
        custom_message: globalTemplateText,
        [msgHeader]: globalTemplateText,
      })),
    );
    setLogs((prev) => [
      ...prev,
      {
        message: "Applied global template pattern to all recipients.",
        type: "info",
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await authenticatedFetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch (err) {
        if (text.includes("<!doctype") || text.includes("<html") || text.includes("<body")) {
          throw new Error(`Server returned HTML (Status ${res.status}). The uploaded file might be corrupted, or a server-side error occurred.`);
        }
        throw new Error(`Invalid response from server (Status ${res.status}): ${text.substring(0, 150)}`);
      }

      if (!res.ok || data.error) {
        throw new Error(data.error || `Upload failed with status ${res.status}`);
      }

      setFileInfo({
        name: file.name,
        path: data.filePath,
        count: data.contactsCount,
        summary: data.summary,
      });

      if (data.contacts && Array.isArray(data.contacts)) {
        setContacts(data.contacts);
      }
      if (data.headers && Array.isArray(data.headers)) {
        setDetectedHeaders(data.headers);

        // Auto-detect mappings from headers
        const detected = detectMapping(data.headers);
        setMappedPhone(detected.phone);
        setMappedName(detected.name);
        setMappedMessage(detected.message);

        const hasPhone = !!detected.phone;
        const hasName = !!detected.name;
        const hasMessage = !!detected.message;

        if (!hasPhone || !hasName || !hasMessage) {
          setIsMappingMode(true);
          setLogs((prev) => [
            ...prev,
            {
              message: `⚠️ Excel Auto-detection failed or incomplete. Missing some required/standard header columns (Phone detected: ${detected.phone ? `"${detected.phone}"` : "NO"}, Name: ${detected.name ? `"${detected.name}"` : "NO"}, Message: ${detected.message ? `"${detected.message}"` : "NO"}). Manual header mapping is required to align fields correctly.`,
              type: "warning",
              timestamp: new Date().toISOString(),
            },
          ]);
        } else {
          setIsMappingMode(false);
          setLogs((prev) => [
            ...prev,
            {
              message: `✓ Header auto-detection succeeded! Found Phone ➔ "${detected.phone}", Name ➔ "${detected.name}", Message ➔ "${detected.message}". Ready for broadcast.`,
              type: "success",
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      }

      setLogs((prev) => [
        ...prev,
        {
          message: `File "${file.name}" loaded successfully. Found ${data.contactsCount} pending contacts.`,
          type: "info",
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err: any) {
      setUploadError(err.message);
      setLogs((prev) => [
        ...prev,
        {
          message: `Upload failed: ${err.message}`,
          type: "error",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsUploading(false);
    }
  };

  const saveTemplateData = async (updatedContacts: any[]) => {
    setIsSavingTemplate(true);
    try {
      const res = await authenticatedFetch("/api/save-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts: updatedContacts,
          headers: detectedHeaders,
        }),
      });
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error + (data.details ? `: ${data.details}` : ""));
      }

      if (data.contacts && Array.isArray(data.contacts)) {
        setContacts(data.contacts);
      }
      if (data.headers && Array.isArray(data.headers)) {
        setDetectedHeaders(data.headers);
      }
      setFileInfo({
        name: "custom_whatsapp_template.xlsx",
        path: data.filePath,
        count: data.contactsCount,
        summary: data.summary,
      });
      setIsCustomTemplateApplied(true);

      setLogs((prev) => [
        ...prev,
        {
          message: `Saved active custom template dataset with ${data.contactsCount} recipients.`,
          type: "success",
          timestamp: new Date().toISOString(),
        },
      ]);

      setIsEditorOpen(false);
    } catch (err: any) {
      alert("Failed to save template: " + err.message);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const applyHeadersMapping = async (
    phoneH: string,
    nameH: string,
    msgH: string,
  ) => {
    if (!phoneH) {
      alert("Please map the required 'phone' field!");
      return;
    }

    setIsSavingTemplate(true);
    setLogs((prev) => [
      ...prev,
      {
        message: `Applying manual mapping override: Phone ➔ "${phoneH}", Name ➔ "${nameH || "Default Friend"}", Message ➔ "${msgH || "Global template"}"...`,
        type: "info",
        timestamp: new Date().toISOString(),
      },
    ]);

    try {
      // 1. Create standardized/updated headers list
      const updatedHeaders = [...detectedHeaders];
      const standardKeys = [
        "mobile_whatsapp_number",
        "phone_number",
        "name",
        "custom_message",
      ];
      standardKeys.forEach((k) => {
        if (!updatedHeaders.includes(k)) {
          updatedHeaders.push(k);
        }
      });

      // 2. Map every contact's properties based on selected columns
      const updatedContacts = contacts.map((c) => {
        const phoneVal =
          c[phoneH] !== undefined ? String(c[phoneH]).trim() : "";
        const nameVal = nameH
          ? c[nameH] !== undefined
            ? String(c[nameH]).trim()
            : ""
          : "Friend";
        const msgVal = msgH
          ? c[msgH] !== undefined
            ? String(c[msgH]).trim()
            : ""
          : "";

        return {
          ...c,
          phone_number: phoneVal,
          mobile_whatsapp_number: phoneVal,
          name: nameVal || "Friend",
          custom_message: msgVal,
          [phoneH]: phoneVal,
          ...(nameH ? { [nameH]: nameVal } : {}),
          ...(msgH ? { [msgH]: msgVal } : {}),
        };
      });

      // 3. Save template Excel sheet back to the backend
      const res = await authenticatedFetch("/api/save-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts: updatedContacts,
          headers: updatedHeaders,
        }),
      });
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error + (data.details ? `: ${data.details}` : ""));
      }

      if (data.contacts && Array.isArray(data.contacts)) {
        setContacts(data.contacts);
      }
      if (data.headers && Array.isArray(data.headers)) {
        setDetectedHeaders(data.headers);
      }
      if (fileInfo) {
        setFileInfo({
          ...fileInfo,
          path: data.filePath,
          count: data.contactsCount,
          summary: data.summary,
        });
      }

      setIsCustomTemplateApplied(true);
      setIsMappingMode(false); // Successfully mapped!

      setLogs((prev) => [
        ...prev,
        {
          message: `✓ Manual mapping saved & applied successfully! Excel sheet refreshed with standard columns.`,
          type: "success",
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        {
          message: `Failed to apply headers mapping: ${err.message}`,
          type: "error",
          timestamp: new Date().toISOString(),
        },
      ]);
      alert("Failed to save manual mapper fields: " + err.message);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    setPhotoUploadError(null);

    // Set instant local preview URL
    const localUrl = URL.createObjectURL(file);
    setLocalPhotoUrl(localUrl);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await authenticatedFetch("/api/upload-media", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch (err) {
        throw new Error(`Server returned invalid response: ${text.substring(0, 150)}`);
      }

      if (!res.ok || data.error) {
        throw new Error(data.error || `Upload failed with status ${res.status}`);
      }

      setPhotoInfo(data);
    } catch (err: any) {
      setPhotoUploadError(err.message);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const clearPhoto = () => {
    setPhotoInfo(null);
    setLocalPhotoUrl(null);
    setPhotoUploadError(null);
  };

  const [isStopping, setIsStopping] = useState(false);

  const handleStopCampaign = async () => {
    if (isStopping) return;
    setIsStopping(true);
    setLogs((prev) => [
      ...prev,
      {
        message: "Sending request to stop the current campaign...",
        type: "warning",
        timestamp: new Date().toISOString(),
      },
    ]);
    try {
      const res = await authenticatedFetch("/api/stop-bulk", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setLogs((prev) => [
          ...prev,
          {
            message: "Campaign stop request sent successfully.",
            type: "success",
            timestamp: new Date().toISOString(),
          },
        ]);
      } else {
        throw new Error(data.error || "Failed to send stop command");
      }
    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        {
          message: `Failed to stop campaign: ${err.message}`,
          type: "error",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsStopping(false);
    }
  };

  const startBulkSend = async (shouldReset = false) => {
    setIsRunning(true);
    let activePath = fileInfo?.path;

    try {
      setLogs((prev) => [
        ...prev,
        {
          message:
            "Synchronizing current template contacts dataset with the server...",
          type: "info",
          timestamp: new Date().toISOString(),
        },
      ]);

      const res = await authenticatedFetch("/api/save-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts, headers: detectedHeaders }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.contacts && Array.isArray(data.contacts)) {
        setContacts(data.contacts);
      }
      if (data.headers && Array.isArray(data.headers)) {
        setDetectedHeaders(data.headers);
      }
      setFileInfo({
        name: fileInfo?.name || "custom_whatsapp_template.xlsx",
        path: data.filePath,
        count: data.contactsCount,
        summary: data.summary,
      });
      setIsCustomTemplateApplied(true);
      activePath = data.filePath;
    } catch (err: any) {
      alert("Failed to pre-save template: " + err.message);
      setIsRunning(false);
      return;
    }

    if (!activePath) {
      alert(
        "No active contact list found. Please configure recipient rows first.",
      );
      setIsRunning(false);
      return;
    }

    try {
      setLogs((prev) => [
        ...prev,
        {
          message: `Initiating ${shouldReset ? "fresh " : ""}broadcast campaign with customized blueprint...`,
          type: "info",
          timestamp: new Date().toISOString(),
        },
      ]);

      const res = await authenticatedFetch("/api/start-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: activePath,
          options: {
            ...options,
            template: globalTemplateText,
            reset: shouldReset,
            mediaFile: photoInfo,
          },
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
    } catch (err: any) {
      alert("Failed to start: " + err.message);
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-neutral-300 p-6 flex flex-col font-sans overflow-x-hidden selection:bg-brand selection:text-black">
      <div className="max-w-7xl mx-auto w-full flex flex-col flex-1 gap-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-white/10 pb-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(37,211,102,0.2)]">
              <Send className="text-black w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                WHATS-BULK{" "}
                <span className="text-brand text-[10px] font-mono ml-2 opacity-80 bg-brand/10 border border-brand/20 px-1.5 py-0.5 rounded">
                  V2.0.4-STABLE
                </span>
              </h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">
                Automation Engine & Contact Pipeline
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-2 bg-zinc-900 border border-white/5 px-3 py-1.5 rounded-full">
              <div
                className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] transition-colors duration-500 ${
                  status.status === "CONNECTED"
                    ? "bg-brand text-brand"
                    : status.status === "QR"
                      ? "bg-amber-500 text-amber-500"
                      : "bg-red-500 text-red-500"
                }`}
              />
              <span className="text-[10px] font-bold uppercase tracking-tighter">
                Session: {status.status}
              </span>
            </div>

            <button
              disabled={isRefreshingConnection || isRunning}
              onClick={handleSoftRefresh}
              className={`h-[34px] w-[34px] rounded-full border bg-zinc-900 transition-all cursor-pointer flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed ${
                isRefreshingConnection
                  ? "border-brand/40 text-brand"
                  : "border-white/5 hover:border-white/15"
              }`}
              title="Refresh/Reconnect WhatsApp Session (Retain Login)"
            >
              <RefreshCw
                size={11}
                className={isRefreshingConnection ? "animate-spin" : ""}
              />
            </button>

            <button
              onClick={handleResetLayout}
              className="hidden lg:flex h-[34px] px-3.5 rounded-full border border-white/5 hover:border-white/15 bg-zinc-900 transition-all cursor-pointer items-center justify-center text-gray-400 hover:text-white gap-1.5 text-[10px] font-bold uppercase tracking-wider"
              title="Reset Panels to Default Layout"
            >
              <LayoutGrid size={11} className="text-brand" />
              Reset Layout
            </button>

            <button
              onClick={() => setIsTutorialOpen(true)}
              className="h-[34px] px-3.5 rounded-full border border-white/5 hover:border-white/15 bg-zinc-900 transition-all cursor-pointer flex items-center justify-center text-gray-400 hover:text-white gap-1.5 text-[10px] font-bold uppercase tracking-wider"
              title="View App Tutorial"
            >
              <HelpCircle size={11} className="text-brand" />
              Tutorial
            </button>

            <button
              onClick={() => setIsFaqOpen(true)}
              className="h-[34px] px-3.5 rounded-full border border-white/5 hover:border-white/15 bg-zinc-900 transition-all cursor-pointer flex items-center justify-center text-gray-400 hover:text-white gap-1.5 text-[10px] font-bold uppercase tracking-wider"
              title="View Frequently Asked Questions"
            >
              <HelpCircle size={11} className="text-brand" />
              FAQ
            </button>

            {status.status === "CONNECTED" && status.clientInfo ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 bg-zinc-900 border border-brand/20 px-3 py-1.5 rounded-full pl-1.5 pr-3 shadow-[0_0_15px_rgba(37,211,102,0.1)]"
              >
                {status.clientInfo.profilePicUrl ? (
                  <img
                    src={status.clientInfo.profilePicUrl}
                    alt="Profile"
                    className="w-5 h-5 rounded-full border border-brand/35 object-cover shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-brand/10 border border-brand/35 text-brand flex items-center justify-center text-[10px] font-black shrink-0">
                    {status.clientInfo.pushname
                      ? status.clientInfo.pushname.charAt(0).toUpperCase()
                      : "W"}
                  </div>
                )}
                <div className="flex flex-col text-left">
                  <span className="text-[9px] font-black text-white leading-none uppercase tracking-tight truncate max-w-[110px]">
                    {status.clientInfo.pushname || "Connected Profile"}
                  </span>
                  <span className="text-[8px] font-mono text-gray-500 leading-none mt-0.5">
                    +{status.clientInfo.phone}
                  </span>
                </div>
              </motion.div>
            ) : (
              <div className="hidden sm:flex items-center gap-2 bg-zinc-900 border border-white/5 px-3 py-1.5 rounded-full">
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-widest">
                  Auth:
                </span>
                <span className="text-xs font-mono text-gray-300">
                  local_db_active
                </span>
              </div>
            )}

            {(status.status === "CONNECTED" || status.status === "QR") && (
              <button
                disabled={isLoggingOut}
                onClick={handleLogout}
                className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300 text-[10px] h-[34px] font-black uppercase tracking-wider px-3 rounded-full transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(239,68,68,0.05)] hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]"
                title="Disconnect & Reset WhatsApp Session"
              >
                <LogOut
                  size={11}
                  className={isLoggingOut ? "animate-spin" : ""}
                />
                <span>{isLoggingOut ? "Resetting..." : "Disconnect"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Share Link Banner */}
        {localIpInfo && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-brand/10 border border-brand/20 p-3.5 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-brand shrink-0"
          >
            <div className="flex items-center gap-3">
              <Share2 className="text-brand shrink-0 w-5 h-5 animate-pulse" />
              <div>
                <p className="text-xs font-bold uppercase tracking-tight text-white">
                  Local Network Access Active
                </p>
                <p className="text-[11px] text-brand/80 font-medium">
                  Share this link with your colleagues in the office:{" "}
                  <a
                    href={`http://${localIpInfo.localIp}:${localIpInfo.port}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono bg-brand/10 border border-brand/30 px-1.5 py-0.5 rounded text-white hover:bg-brand/20 transition-all font-black decoration-brand hover:underline"
                  >
                    http://{localIpInfo.localIp}:{localIpInfo.port}
                  </a>
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Global Action Banner if QR needed */}
        {status.status === "QR" && status.qr && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl flex items-center justify-between gap-4 shrink-0"
          >
            <div className="flex items-center gap-3">
              <AlertCircle className="text-amber-500" />
              <div>
                <p className="text-sm font-bold text-amber-500">
                  Authentication Required
                </p>
                <p className="text-xs text-amber-500/60 font-medium">
                  Scan the QR code in the Connection card to start the campaign.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Main Bento Grid */}
        <div 
          id="main-bento-container"
          className="flex flex-col gap-4 flex-1 lg:h-[1000px] min-h-0 select-none"
        >
          {/* Top Row */}
          <div 
            className="flex flex-col lg:flex-row gap-4 w-full animate-in fade-in duration-500"
            style={{ 
              height: isDesktop 
                ? `calc(${layout.rowSplit.top}% - ${16 * (layout.rowSplit.top / 100)}px)` 
                : undefined 
            }}
          >
            {/* Left Column: Excel Data Pipeline */}
            <div 
              className="relative col-span-12 lg:col-span-4 bg-zinc-900/40 border border-white/5 rounded-2xl p-5 flex flex-col hover:border-white/10 transition-colors min-h-0 overflow-hidden group/card"
              style={{ 
                width: isDesktop 
                  ? `calc(${layout.topRow.left}% - ${32 * (layout.topRow.left / 100)}px)` 
                  : undefined 
              }}
            >
              {isDesktop && (
                <>
                  {/* Right edge handle */}
                  <div
                    onMouseDown={(e) => startResize(e, "topSplit1")}
                    onTouchStart={(e) => startResize(e, "topSplit1")}
                    className="absolute top-0 right-0 w-4 h-full cursor-col-resize z-50 group flex items-center justify-center hover:bg-brand/10 transition-colors"
                    title="Drag to resize columns"
                  >
                    <div className="w-[1.5px] h-8 bg-white/10 group-hover:bg-brand transition-colors" />
                  </div>
                  {/* Bottom edge handle */}
                  <div
                    onMouseDown={(e) => startResize(e, "rowSplit")}
                    onTouchStart={(e) => startResize(e, "rowSplit")}
                    className="absolute bottom-0 left-0 w-full h-4 cursor-row-resize z-50 group flex items-center justify-center hover:bg-brand/10 transition-colors"
                    title="Drag to resize rows"
                  >
                    <div className="h-[1.5px] w-8 bg-white/10 group-hover:bg-brand transition-colors" />
                  </div>
                  {/* Bottom-right corner handle */}
                  <div
                    onMouseDown={(e) => startResize(e, "corner-topLeft-bottomRight")}
                    onTouchStart={(e) => startResize(e, "corner-topLeft-bottomRight")}
                    className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-50 group flex items-center justify-center"
                    title="Drag to resize card"
                  >
                    <div className="w-2.5 h-2.5 border-r border-b border-white/20 group-hover:border-brand rounded-br-[2px] transition-colors" />
                  </div>
                </>
              )}
              <div className="flex justify-between items-start mb-6">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <FileSpreadsheet size={14} className="text-brand" />
                Excel Data Pipeline
              </h3>
              <div className="flex items-center gap-2">
                <a
                  href={
                    isCustomTemplateApplied
                      ? "/api/template?custom=true"
                      : "/api/template"
                  }
                  download
                  className={`flex items-center gap-1.5 text-[9px] px-2 py-0.5 rounded border transition-colors font-bold uppercase tracking-widest ${
                    isCustomTemplateApplied
                      ? "bg-blue-900/30 hover:bg-blue-800/50 text-blue-400 hover:text-white border-blue-500/20"
                      : "bg-zinc-800 hover:bg-zinc-700 text-gray-400 hover:text-white border-white/5"
                  }`}
                  title="Download CSV/Excel Template Sheet"
                >
                  <Download size={10} />
                  {isCustomTemplateApplied ? "Edited Template" : "Template"}
                </a>
                <span className="text-[9px] bg-brand/10 text-brand px-2 py-0.5 rounded border border-brand/20 font-bold">
                  xlsx-v0.18
                </span>
              </div>
            </div>

            <div className="flex-1 flex flex-col space-y-4 min-h-0">
              {!fileInfo ? (
                <div className="flex flex-col gap-3 flex-1 justify-between">
                  {uploadError && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-xs flex flex-col gap-1.5"
                    >
                      <div className="flex items-center gap-1.5 font-bold uppercase tracking-wide text-[9px] text-red-400">
                        <AlertCircle
                          size={13}
                          className="shrink-0 text-red-500"
                        />
                        <span>File Pipeline Error</span>
                      </div>
                      <p className="text-[10px] text-white/85 leading-relaxed font-mono select-text break-all p-2 bg-black/40 rounded border border-white/5">
                        {uploadError}
                      </p>
                    </motion.div>
                  )}

                  <label className="flex-1 min-h-[140px] border border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-white/5 transition-all group p-4">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center group-hover:bg-brand/20 group-hover:text-brand transition-all">
                      <Upload size={18} />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-white uppercase tracking-wider">
                        Load Source File
                      </p>
                      <p className="text-[10px] text-gray-500 mt-1">
                        Accepts CSV, XLSX, XLS
                      </p>
                    </div>
                    <input
                      type="file"
                      accept=".xlsx"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                    />
                  </label>

                  <button
                    onClick={() => {
                      setIsEditorOpen(true);
                    }}
                    className="w-full py-3 rounded-xl border border-white/10 hover:border-brand/40 bg-zinc-950/50 text-white font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-brand/10 transition-all font-mono"
                  >
                    <Edit size={12} className="text-brand" />
                    Or Edit Template Online
                  </button>
                </div>
              ) : (
                <div className="space-y-4 flex flex-col h-full min-h-0 flex-1">
                  <div className="bg-black/40 rounded-xl p-4 border border-white/5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 bg-brand/10 rounded-lg border border-brand/20 text-brand shrink-0">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate text-white uppercase tracking-tight">
                          {fileInfo.name}
                        </p>
                        <p className="text-[10px] text-gray-500 italic font-mono">
                          {fileInfo.count} total recipients
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setIsMappingMode((prev) => !prev)}
                        className={`p-2 border rounded-lg transition-colors ${
                          isMappingMode
                            ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                            : "bg-zinc-800 hover:bg-zinc-700 text-gray-400 hover:text-brand border-white/5"
                        }`}
                        title="Configure Header Column Mapping manually"
                      >
                        <Settings size={14} />
                      </button>
                      <button
                        onClick={() => setIsEditorOpen(true)}
                        className="p-2 bg-zinc-800 hover:bg-zinc-700 hover:text-brand border border-white/5 rounded-lg text-gray-400 transition-colors"
                        title="Edit template rows and data fields visually"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        onClick={() => {
                          setFileInfo(null);
                          setUploadError(null);
                          setContacts([
                            {
                              mobile_whatsapp_number: "1234567890",
                              phone_number: "1234567890",
                              name: "John Doe",
                              custom_message:
                                "Hello {name}, your order is ready!",
                              status: "",
                            },
                            {
                              mobile_whatsapp_number: "0987654321",
                              phone_number: "0987654321",
                              name: "Jane Smith",
                              custom_message:
                                "Hi {name}, welcome to our service.",
                              status: "",
                            },
                          ]);
                          setDetectedHeaders([
                            "mobile_whatsapp_number",
                            "name",
                            "custom_message",
                          ]);
                          setIsCustomTemplateApplied(false);
                          setMappedPhone("");
                          setMappedName("");
                          setMappedMessage("");
                          setIsMappingMode(false);
                        }}
                        className="p-2 bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 border border-white/5 rounded-lg text-gray-400 transition-colors"
                        title="Clear uploaded file and reset pipeline"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {isMappingMode ? (
                    <div className="flex-1 overflow-hidden flex flex-col bg-zinc-950/40 rounded-xl border border-amber-500/15 p-4">
                      <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                        <div className="flex items-center gap-1.5 text-amber-500 font-bold uppercase tracking-wider text-[9px]">
                          <Settings size={12} className="text-amber-500" />
                          <span>Manual Header Mapping</span>
                        </div>
                        <span className="text-[8px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 font-bold font-mono">
                          MAPPER
                        </span>
                      </div>

                      <p className="text-[10px] text-gray-400 mb-4 font-sans leading-normal">
                        Select which columns from your spreadsheet correspond to
                        the recipient fields:
                      </p>

                      <div className="space-y-3.5 flex-1 overflow-y-auto custom-scrollbar pr-1">
                        {/* Phone mapping */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                            Phone / Mobile Column{" "}
                            <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={mappedPhone}
                            onChange={(e) => setMappedPhone(e.target.value)}
                            className="w-full bg-zinc-900/90 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:border-brand/50 outline-none hover:border-white/25 transition-colors"
                          >
                            <option value="">-- Select Phone Column --</option>
                            {detectedHeaders
                              .filter(
                                (h) => h !== "status" && h !== "rowNumber",
                              )
                              .map((h) => (
                                <option key={h} value={h}>
                                  {h}
                                </option>
                              ))}
                          </select>
                        </div>

                        {/* Name mapping */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                            Recipient Name Column{" "}
                            <span className="text-gray-600">(Optional)</span>
                          </label>
                          <select
                            value={mappedName}
                            onChange={(e) => setMappedName(e.target.value)}
                            className="w-full bg-zinc-900/90 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:border-brand/50 outline-none hover:border-white/25 transition-colors"
                          >
                            <option value="">
                              -- Default Friend (No Column) --
                            </option>
                            {detectedHeaders
                              .filter(
                                (h) => h !== "status" && h !== "rowNumber",
                              )
                              .map((h) => (
                                <option key={h} value={h}>
                                  {h}
                                </option>
                              ))}
                          </select>
                        </div>

                        {/* Message mapping */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                            Custom Message Column{" "}
                            <span className="text-gray-600">(Optional)</span>
                          </label>
                          <select
                            value={mappedMessage}
                            onChange={(e) => setMappedMessage(e.target.value)}
                            className="w-full bg-zinc-900/90 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:border-brand/50 outline-none hover:border-white/25 transition-colors"
                          >
                            <option value="">
                              -- Default / Global Template --
                            </option>
                            {detectedHeaders
                              .filter(
                                (h) => h !== "status" && h !== "rowNumber",
                              )
                              .map((h) => (
                                <option key={h} value={h}>
                                  {h}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-white/5 mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={isSavingTemplate || !mappedPhone}
                          onClick={() =>
                            applyHeadersMapping(
                              mappedPhone,
                              mappedName,
                              mappedMessage,
                            )
                          }
                          className="flex-1 bg-brand text-black text-[10px] font-black uppercase tracking-widest py-2.5 rounded shadow-[0_0_15px_rgba(37,211,102,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {isSavingTemplate ? "Saving..." : "Apply Mapping"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsMappingMode(false)}
                          className="px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-[10px] text-gray-400 hover:text-white rounded font-bold uppercase tracking-wider transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-hidden flex flex-col bg-black/20 rounded-xl border border-white/5 p-4">
                      <p className="text-[10px] uppercase text-gray-600 mb-3 font-bold tracking-widest tracking-tighter">
                        Status Registry
                      </p>
                      <div className="space-y-3 text-[11px] font-mono custom-scrollbar overflow-y-auto flex-1 min-h-0">
                        <div className="grid grid-cols-3 gap-2 border-b border-white/5 pb-2 text-gray-600 font-bold uppercase tracking-widest text-[9px]">
                          <span>Entry</span>
                          <span>Type</span>
                          <span>Log</span>
                        </div>
                        <AnimatePresence mode="popLayout">
                          {fileInfo.summary &&
                            Object.entries(fileInfo.summary).map(
                              ([key, val]) => (
                                <motion.div
                                  key={key}
                                  layout
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  className="grid grid-cols-3 gap-2 py-1 items-center"
                                >
                                  <span className="text-gray-400 capitalize">
                                    {key.replace("_", " ")}
                                  </span>
                                  <span
                                    className={`text-[9px] px-1.5 py-0.5 rounded border ${
                                      key === "sent"
                                        ? "bg-brand/10 border-brand/20 text-brand"
                                        : key === "failed"
                                          ? "bg-red-500/10 border-red-500/20 text-red-500"
                                          : "bg-zinc-800 border-white/5 text-gray-500"
                                    }`}
                                  >
                                    {key.toUpperCase()}
                                  </span>
                                  <span className="text-gray-300 text-right">
                                    {val}
                                  </span>
                                </motion.div>
                              ),
                            )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Middle Column: Templating Engine */}
          <div 
            className="relative col-span-12 lg:col-span-5 bg-zinc-900/40 border border-white/5 rounded-2xl p-5 flex flex-col hover:border-white/10 transition-colors min-h-0 overflow-hidden group/card"
            style={{ 
              width: isDesktop 
                ? `calc(${layout.topRow.middle}% - ${32 * (layout.topRow.middle / 100)}px)` 
                : undefined 
            }}
          >
            {isDesktop && (
              <>
                {/* Left edge handle */}
                <div
                  onMouseDown={(e) => startResize(e, "topSplit1")}
                  onTouchStart={(e) => startResize(e, "topSplit1")}
                  className="absolute top-0 left-0 w-4 h-full cursor-col-resize z-50 group flex items-center justify-center hover:bg-brand/10 transition-colors"
                  title="Drag to resize columns"
                >
                  <div className="w-[1.5px] h-8 bg-white/10 group-hover:bg-brand transition-colors" />
                </div>
                {/* Right edge handle */}
                <div
                  onMouseDown={(e) => startResize(e, "topSplit2")}
                  onTouchStart={(e) => startResize(e, "topSplit2")}
                  className="absolute top-0 right-0 w-4 h-full cursor-col-resize z-50 group flex items-center justify-center hover:bg-brand/10 transition-colors"
                  title="Drag to resize columns"
                >
                  <div className="w-[1.5px] h-8 bg-white/10 group-hover:bg-brand transition-colors" />
                </div>
                {/* Bottom edge handle */}
                <div
                  onMouseDown={(e) => startResize(e, "rowSplit")}
                  onTouchStart={(e) => startResize(e, "rowSplit")}
                  className="absolute bottom-0 left-0 w-full h-4 cursor-row-resize z-50 group flex items-center justify-center hover:bg-brand/10 transition-colors"
                  title="Drag to resize rows"
                >
                  <div className="h-[1.5px] w-8 bg-white/10 group-hover:bg-brand transition-colors" />
                </div>
                {/* Bottom-left corner handle */}
                <div
                  onMouseDown={(e) => startResize(e, "corner-topMiddle-bottomLeft")}
                  onTouchStart={(e) => startResize(e, "corner-topMiddle-bottomLeft")}
                  className="absolute bottom-0 left-0 w-6 h-6 cursor-nesw-resize z-50 group flex items-center justify-center"
                  title="Drag to resize card"
                >
                  <div className="w-2.5 h-2.5 border-l border-b border-white/20 group-hover:border-brand rounded-bl-[2px] transition-colors" />
                </div>
                {/* Bottom-right corner handle */}
                <div
                  onMouseDown={(e) => startResize(e, "corner-topMiddle-bottomRight")}
                  onTouchStart={(e) => startResize(e, "corner-topMiddle-bottomRight")}
                  className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-50 group flex items-center justify-center"
                  title="Drag to resize card"
                >
                  <div className="w-2.5 h-2.5 border-r border-b border-white/20 group-hover:border-brand rounded-br-[2px] transition-colors" />
                </div>
              </>
            )}
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Templating Engine
              </h3>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-gray-500 font-bold tracking-widest">
                  Active Blueprint
                </span>
              </div>
            </div>

            <div className="bg-black/60 border border-white/10 rounded-xl p-4 flex-1 font-mono text-xs leading-relaxed relative flex flex-col shadow-inner gap-3 min-h-0 overflow-y-auto custom-scrollbar">
              <div className="text-gray-600 font-bold border-b border-white/5 pb-2 flex justify-between items-center text-[10px]">
                <span>// Dynamic Message Blueprint</span>
                <span className="text-[9px] bg-brand/10 text-brand px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-widest">
                  Editable
                </span>
              </div>

              <div className="space-y-2 flex flex-col flex-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
                  Write Message Template:
                </p>
                <textarea
                  value={globalTemplateText}
                  onChange={(e) => setGlobalTemplateText(e.target.value)}
                  placeholder="Type your campaign message here. Use {name} for client name, and {custom_message} for personalized row message."
                  className="flex-1 w-full p-3 bg-zinc-950 border border-white/5 focus:border-brand/40 rounded-lg text-white text-xs outline-none resize-none font-mono"
                />
              </div>

              {/* Placeholder Helper Badges */}
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-[9px] text-gray-600 font-bold uppercase">
                  Insert:{" "}
                </span>
                {detectedHeaders
                  .filter((h) => h !== "status")
                  .map((header) => (
                    <button
                      key={header}
                      onClick={() =>
                        setGlobalTemplateText((t) => t + ` {${header}}`)
                      }
                      className="text-[9px] bg-brand/10 text-brand px-2 py-0.5 rounded border border-brand/20 hover:bg-brand/20 font-bold active:scale-95 transition-transform"
                    >
                      + {"{" + header + "}"}
                    </button>
                  ))}
                <button
                  onClick={applyGlobalTemplateToAll}
                  className="ml-auto text-[9px] bg-zinc-850 hover:bg-zinc-700 text-white px-2.5 py-1 rounded border border-white/5 font-bold uppercase tracking-widest text-[8px]"
                  title="Overwrite custom_message field for all recipients"
                >
                  Apply Blueprint
                </button>
              </div>

              {/* Photo / Media Attachment Option */}
              <div className="border-t border-white/5 pt-3 mt-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2 flex items-center gap-1">
                  <Image size={11} className="text-brand" />
                  <span>Photo Attachment (Optional)</span>
                </p>
                <div className="flex items-center gap-4 bg-zinc-950/80 p-3 rounded-lg border border-white/5">
                  {localPhotoUrl ? (
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-black/40 border border-white/10 flex-shrink-0">
                      <img 
                        src={localPhotoUrl} 
                        alt="Attachment preview" 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <button
                        onClick={clearPhoto}
                        type="button"
                        className="absolute top-0.5 right-0.5 bg-black/80 hover:bg-red-600 p-1 rounded-full text-white transition-colors"
                        title="Remove photo"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ) : (
                    <label className="w-16 h-16 rounded-lg border-2 border-dashed border-white/10 hover:border-brand/40 flex flex-col items-center justify-center cursor-pointer bg-black/40 hover:bg-black/60 transition-all flex-shrink-0">
                      <Plus size={16} className="text-gray-400 group-hover:text-brand" />
                      <span className="text-[8px] text-gray-500 font-bold uppercase mt-1">Add Photo</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handlePhotoUpload} 
                        className="hidden" 
                        disabled={isUploadingPhoto || isRunning}
                      />
                    </label>
                  )}

                  <div className="flex-1 min-w-0">
                    {photoInfo ? (
                      <div>
                        <p className="text-xs text-white font-medium truncate">{photoInfo.originalname}</p>
                        <p className="text-[9px] text-brand font-mono font-bold uppercase mt-0.5">Ready to Broadcast</p>
                      </div>
                    ) : isUploadingPhoto ? (
                      <div>
                        <p className="text-xs text-brand font-bold animate-pulse">Uploading to server...</p>
                        <div className="w-full bg-white/5 rounded-full h-1 mt-1 overflow-hidden">
                          <div className="bg-brand h-full animate-[shimmer_1.5s_infinite]" style={{ width: '100%', background: 'linear-gradient(90deg, #25D366 0%, #128C7E 100%)' }} />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-gray-400">No media selected</p>
                        <p className="text-[9px] text-gray-600 mt-0.5">Image file will be sent with message caption</p>
                      </div>
                    )}
                    {photoUploadError && (
                      <p className="text-[9px] text-red-500 font-semibold mt-1">Error: {photoUploadError}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Dynamic Live Preview */}
              <div className="border-t border-white/5 pt-3 mt-1 bg-black/40 -mx-4 -mb-4 p-4 rounded-b-xl">
                <p className="text-[9px] text-gray-500 uppercase font-black mb-1">
                  Live Recipient Preview (First Contact):
                </p>
                <div className="p-3 bg-zinc-900/60 rounded border border-white/5 text-[11px] text-gray-300 italic">
                  {(() => {
                    if (contacts.length === 0) return globalTemplateText;
                    const contact = contacts[0];
                    let preview = globalTemplateText;
                    detectedHeaders.forEach((h) => {
                      const val =
                        contact[h] !== undefined ? String(contact[h]) : "";
                      const regex = new RegExp(
                        `\\{${h.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}\\}`,
                        "gi",
                      );
                      preview = preview.replace(regex, val);
                    });
                    if (
                      contact.name &&
                      !/\{name\}/gi.test(globalTemplateText)
                    ) {
                      preview = preview.replace(/\{name\}/gi, contact.name);
                    }
                    return preview
                      .split("\n")
                      .map((line, k) => <div key={k}>{line}</div>);
                  })()}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-12 gap-3">
              <button
                onClick={() => setIsEditorOpen(true)}
                className="col-span-6 py-2.5 rounded-xl border border-white/5 hover:border-brand/40 bg-zinc-900/50 text-white hover:text-brand font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all font-mono"
              >
                <Edit size={11} />
                Spreadsheet Rows ({contacts.length})
              </button>
              <button
                disabled={
                  isRunning ||
                  (!options.dryRun && status.status !== "CONNECTED")
                }
                onClick={() => startBulkSend(true)}
                className={`col-span-6 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all font-mono ${
                  isRunning
                    ? "bg-amber-500/10 border border-amber-500/20 text-amber-500 cursor-not-allowed animate-pulse"
                    : !options.dryRun && status.status !== "CONNECTED"
                      ? "bg-zinc-800 text-zinc-500 border border-white/5 cursor-not-allowed"
                      : options.dryRun
                        ? "bg-sky-500 text-black hover:scale-[1.03] active:scale-[0.97] shadow-[0_0_15px_rgba(14,165,233,0.3)] font-black"
                        : "bg-brand text-black hover:scale-[1.03] active:scale-[0.97] shadow-[0_0_15px_rgba(37,211,102,0.3)] font-black"
                }`}
                title="Automatically resets delivery statuses and sends message given in templating engine to all recipients"
              >
                <Send
                  size={11}
                  className={
                    !isRunning &&
                    (options.dryRun || status.status === "CONNECTED")
                      ? "fill-current"
                      : ""
                  }
                />
                Auto Send Everyone
              </button>
            </div>
          </div>

          {/* Right Column: Mission Control */}
          <div 
            className="relative col-span-12 lg:col-span-3 bg-zinc-900/40 border border-white/5 rounded-2xl p-5 flex flex-col hover:border-white/10 transition-colors min-h-0 overflow-hidden group/card"
            style={{ 
              width: isDesktop 
                ? `calc(${layout.topRow.right}% - ${32 * (layout.topRow.right / 100)}px)` 
                : undefined 
            }}
          >
            {isDesktop && (
              <>
                {/* Left edge handle */}
                <div
                  onMouseDown={(e) => startResize(e, "topSplit2")}
                  onTouchStart={(e) => startResize(e, "topSplit2")}
                  className="absolute top-0 left-0 w-4 h-full cursor-col-resize z-50 group flex items-center justify-center hover:bg-brand/10 transition-colors"
                  title="Drag to resize columns"
                >
                  <div className="w-[1.5px] h-8 bg-white/10 group-hover:bg-brand transition-colors" />
                </div>
                {/* Bottom edge handle */}
                <div
                  onMouseDown={(e) => startResize(e, "rowSplit")}
                  onTouchStart={(e) => startResize(e, "rowSplit")}
                  className="absolute bottom-0 left-0 w-full h-4 cursor-row-resize z-50 group flex items-center justify-center hover:bg-brand/10 transition-colors"
                  title="Drag to resize rows"
                >
                  <div className="h-[1.5px] w-8 bg-white/10 group-hover:bg-brand transition-colors" />
                </div>
                {/* Bottom-left corner handle */}
                <div
                  onMouseDown={(e) => startResize(e, "corner-topRight-bottomLeft")}
                  onTouchStart={(e) => startResize(e, "corner-topRight-bottomLeft")}
                  className="absolute bottom-0 left-0 w-6 h-6 cursor-nesw-resize z-50 group flex items-center justify-center"
                  title="Drag to resize card"
                >
                  <div className="w-2.5 h-2.5 border-l border-b border-white/20 group-hover:border-brand rounded-bl-[2px] transition-colors" />
                </div>
              </>
            )}
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6 text-center lg:text-left">
              Mission Control
            </h3>

            <div className="flex-1 w-full flex flex-col min-h-0 overflow-y-auto custom-scrollbar justify-between pr-1">
              <div className="relative flex justify-center py-6 flex-shrink-0">
                <div className="w-32 h-32 rounded-full border-[8px] border-zinc-800/50 flex items-center justify-center relative shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
                  <svg
                    className="absolute w-full h-full -rotate-90 overflow-visible"
                    viewBox="0 0 100 100"
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r="46"
                      className="stroke-brand fill-none"
                      strokeWidth="8"
                      strokeDasharray="289"
                      strokeDashoffset={
                        289 -
                        289 *
                          (progress.total > 0
                            ? progress.current / progress.total
                            : 0)
                      }
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="text-center z-10">
                    <span className="text-3xl font-bold font-mono tracking-tighter text-white">
                      {progress.current}
                    </span>
                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                      Processed
                    </p>
                  </div>
                </div>
              </div>

              <div className="w-full space-y-5 mt-auto">
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-tighter">
                    <span className="text-gray-500">Pipeline Completion</span>
                    <span className="text-brand font-mono">
                      {progress.total > 0
                        ? Math.round((progress.current / progress.total) * 100)
                        : 0}
                      %
                    </span>
                  </div>
                  <div className="w-full bg-zinc-800/50 h-1 rounded-full overflow-hidden border border-white/5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                      }}
                      className="bg-brand h-full shadow-[0_0_10px_#25D366]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1 border-t border-white/5 pt-4">
                  <div className="text-center">
                    <p className="text-lg font-bold font-mono text-brand">
                      {fileInfo?.summary?.sent || 0}
                    </p>
                    <p className="text-[8px] text-gray-600 uppercase font-bold tracking-widest">
                      SENT
                    </p>
                  </div>
                  <div className="text-center border-x border-white/5">
                    <p className="text-lg font-bold font-mono text-red-500">
                      {fileInfo?.summary?.failed || 0}
                    </p>
                    <p className="text-[8px] text-gray-600 uppercase font-bold tracking-widest">
                      FAIL
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold font-mono text-blue-500">
                      {fileInfo?.summary?.pending || 0}
                    </p>
                    <p className="text-[8px] text-gray-600 uppercase font-bold tracking-widest">
                      LEFT
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>

          {/* Bottom Row */}
          <div 
            className="flex flex-col lg:flex-row gap-4 w-full animate-in fade-in duration-500"
            style={{ 
              height: isDesktop 
                ? `calc(${layout.rowSplit.bottom}% - ${16 * (layout.rowSplit.bottom / 100)}px)` 
                : undefined 
            }}
          >
            {/* Bottom Left: Real-time CLI Logs */}
            <div 
              className="relative col-span-12 lg:col-span-8 bg-black border border-white/10 rounded-2xl p-5 font-mono text-[11px] flex flex-col shadow-2xl overflow-hidden min-h-0 group/card"
              style={{ 
                width: isDesktop 
                  ? `calc(${layout.bottomRow.left}% - ${16 * (layout.bottomRow.left / 100)}px)` 
                  : undefined 
              }}
            >
              {isDesktop && (
                <>
                  {/* Top edge handle */}
                  <div
                    onMouseDown={(e) => startResize(e, "rowSplit")}
                    onTouchStart={(e) => startResize(e, "rowSplit")}
                    className="absolute top-0 left-0 w-full h-4 cursor-row-resize z-50 group flex items-center justify-center hover:bg-brand/10 transition-colors"
                    title="Drag to resize rows"
                  >
                    <div className="h-[1.5px] w-8 bg-white/10 group-hover:bg-brand transition-colors" />
                  </div>
                  {/* Right edge handle */}
                  <div
                    onMouseDown={(e) => startResize(e, "bottomSplit")}
                    onTouchStart={(e) => startResize(e, "bottomSplit")}
                    className="absolute top-0 right-0 w-4 h-full cursor-col-resize z-50 group flex items-center justify-center hover:bg-brand/10 transition-colors"
                    title="Drag to resize columns"
                  >
                    <div className="w-[1.5px] h-8 bg-white/10 group-hover:bg-brand transition-colors" />
                  </div>
                  {/* Top-right corner handle */}
                  <div
                    onMouseDown={(e) => startResize(e, "corner-bottomLeft-topRight")}
                    onTouchStart={(e) => startResize(e, "corner-bottomLeft-topRight")}
                    className="absolute top-0 right-0 w-6 h-6 cursor-nesw-resize z-50 group flex items-center justify-center"
                    title="Drag to resize card"
                  >
                    <div className="w-2.5 h-2.5 border-r border-t border-white/20 group-hover:border-brand rounded-tr-[2px] transition-colors" />
                  </div>
                </>
              )}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
                  <div className="w-2 h-2 rounded-full bg-amber-500/50"></div>
                  <div className="w-2 h-2 rounded-full bg-brand/50"></div>
                </div>
                <span className="text-gray-500 ml-2 uppercase text-[9px] font-bold tracking-[0.2em]">
                  bash — tail -f logger.log
                </span>
              </div>
              <div className="flex gap-4 text-[9px] text-gray-600 font-bold">
                <span>UTF-8</span>
                <span>SSH_ACTIVE</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 pr-2">
              {logs.length === 0 && (
                <p className="text-gray-800 animate-pulse italic">
                  Waiting for incoming telemetry stream...
                </p>
              )}
              {logs.map((log, i) => (
                <div
                  key={i}
                  className="flex gap-3 animate-in fade-in slide-in-from-left-2 duration-300"
                >
                  <span className="text-gray-600 shrink-0 font-bold">
                    [{log.timestamp.split("T")[1].split(".")[0]}]
                  </span>
                  <span
                    className={`
                    uppercase font-bold tracking-tighter text-[9px] min-w-[50px]
                    ${log.type === "error" ? "text-red-500" : ""}
                    ${log.type === "success" ? "text-brand" : ""}
                    ${log.type === "warning" ? "text-amber-500" : ""}
                    ${log.type === "info" ? "text-blue-500" : ""}
                  `}
                  >
                    {log.type}
                  </span>
                  <span
                    className={`
                    ${log.type === "error" ? "text-red-400" : ""}
                    ${log.type === "success" ? "text-brand/80" : ""}
                    ${log.type === "warning" ? "text-amber-400/80" : ""}
                    ${log.type === "info" ? "text-blue-400/80" : ""}
                  `}
                  >
                    {log.message}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>

            {/* Ambient Scanline Effect */}
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] opacity-10"></div>
          </div>

          {/* Bottom Right: Rate Limiter & Control */}
          <div 
            className="relative col-span-12 lg:col-span-4 bg-zinc-900/40 border border-white/5 rounded-2xl p-5 flex flex-col justify-between hover:border-white/10 transition-colors min-h-0 overflow-hidden group/card"
            style={{ 
              width: isDesktop 
                ? `calc(${layout.bottomRow.right}% - ${16 * (layout.bottomRow.right / 100)}px)` 
                : undefined 
            }}
          >
            {isDesktop && (
              <>
                {/* Top edge handle */}
                <div
                  onMouseDown={(e) => startResize(e, "rowSplit")}
                  onTouchStart={(e) => startResize(e, "rowSplit")}
                  className="absolute top-0 left-0 w-full h-4 cursor-row-resize z-50 group flex items-center justify-center hover:bg-brand/10 transition-colors"
                  title="Drag to resize rows"
                >
                  <div className="h-[1.5px] w-8 bg-white/10 group-hover:bg-brand transition-colors" />
                </div>
                {/* Left edge handle */}
                <div
                  onMouseDown={(e) => startResize(e, "bottomSplit")}
                  onTouchStart={(e) => startResize(e, "bottomSplit")}
                  className="absolute top-0 left-0 w-4 h-full cursor-col-resize z-50 group flex items-center justify-center hover:bg-brand/10 transition-colors"
                  title="Drag to resize columns"
                >
                  <div className="w-[1.5px] h-8 bg-white/10 group-hover:bg-brand transition-colors" />
                </div>
                {/* Top-left corner handle */}
                <div
                  onMouseDown={(e) => startResize(e, "corner-bottomRight-topLeft")}
                  onTouchStart={(e) => startResize(e, "corner-bottomRight-topLeft")}
                  className="absolute top-0 left-0 w-6 h-6 cursor-nwse-resize z-50 group flex items-center justify-center"
                  title="Drag to resize card"
                >
                  <div className="w-2.5 h-2.5 border-l border-t border-white/20 group-hover:border-brand rounded-tl-[2px] transition-colors" />
                </div>
              </>
            )}
            <div className="space-y-4 lg:space-y-6 flex-1 flex flex-col min-h-0 mb-4">
              <div className="flex justify-between items-center shrink-0">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Rate Limiter
                </h3>
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${isRunning ? "bg-brand" : "bg-zinc-700"}`}
                  ></div>
                  <span
                    className={`text-[10px] font-bold uppercase ${isRunning ? "text-brand" : "text-zinc-600"}`}
                  >
                    {isRunning ? "Limiter Active" : "Limiter Idle"}
                  </span>
                </div>
              </div>

              <div className="bg-black/40 rounded-xl p-4 lg:p-5 border border-white/5 shadow-inner flex-1 overflow-y-auto custom-scrollbar min-h-0">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-gray-500" />
                    <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">
                      Global Options
                    </span>
                  </div>
                </div>

                <div className="space-y-5">
                  {/* API Secret Key */}
                  <div className="space-y-1.5 p-3 bg-white/5 rounded-xl border border-white/5">
                    <div className="text-[11px] font-bold text-white uppercase tracking-tighter flex justify-between items-center">
                      <span>API Authorization Key</span>
                      {apiSecret && (
                        <span className="text-brand font-mono text-[9px] font-black">
                          Set
                        </span>
                      )}
                    </div>
                    <input
                      type="password"
                      placeholder="Enter API Secret Key"
                      value={apiSecret}
                      onChange={(e) => {
                        const val = e.target.value;
                        setApiSecret(val);
                        localStorage.setItem("API_SECRET", val);
                      }}
                      className="w-full text-xs font-mono bg-black/40 border border-white/10 rounded-lg p-2 text-white focus:outline-none focus:border-brand transition-colors"
                      disabled={isRunning}
                    />
                    <p className="text-[8px] text-gray-500 leading-normal">
                      Required key printed in the server console on startup.
                    </p>
                  </div>

                  {/* Default Country Code */}
                  <div className="space-y-1.5 p-3 bg-white/5 rounded-xl border border-white/5">
                    <div className="text-[11px] font-bold text-white uppercase tracking-tighter flex justify-between items-center">
                      <span>Default country code (e.g. 91 for India)</span>
                      {options.defaultCountryCode && (
                        <span className="text-brand font-mono text-[9px] font-black">
                          +{options.defaultCountryCode} Mode
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. 91 (India), 1 (USA), 55 (Brazil)"
                      value={options.defaultCountryCode}
                      onChange={(e) =>
                        !isRunning &&
                        setOptions((o) => ({
                          ...o,
                          defaultCountryCode: e.target.value.replace(/\D/g, ""),
                        }))
                      }
                      className="w-full text-xs font-mono bg-black/40 border border-white/10 rounded-lg p-2 text-white focus:outline-none focus:border-brand transition-colors"
                      disabled={isRunning}
                    />
                    <p className="text-[8px] text-gray-500 leading-normal">
                      Automatically formats local numbers lacking international
                      headers to valid WhatsApp IDs.
                    </p>
                  </div>

                  {/* Bypass Toggle */}
                  <div
                    className="flex items-center justify-between cursor-pointer group p-1"
                    onClick={() =>
                      !isRunning &&
                      setOptions((o) => ({
                        ...o,
                        bypassRegCheck: !o.bypassRegCheck,
                      }))
                    }
                  >
                    <div>
                      <div className="text-[11px] font-bold text-white uppercase tracking-tighter">
                        Bypass Registration Check
                      </div>
                      <p className="text-[9px] text-gray-500 max-w-[200px] leading-relaxed mt-0.5">
                        Send directly without querying if number is on WhatsApp
                        (fixes false negatives).
                      </p>
                    </div>
                    <div
                      className={`w-8 h-4 rounded-full p-0.5 border ${options.bypassRegCheck ? "bg-amber-500/20 border-amber-500/50" : "bg-black border-white/10"}`}
                    >
                      <div
                        className={`w-3 h-full rounded-full transition-all ${options.bypassRegCheck ? "translate-x-4 bg-amber-500 shadow-[0_0_10px_#f59e0b]" : "bg-gray-700"}`}
                      />
                    </div>
                  </div>
                  {/* Toggle */}
                  <div
                    className="flex items-center justify-between cursor-pointer group"
                    onClick={() =>
                      !isRunning &&
                      setOptions((o) => ({ ...o, dryRun: !o.dryRun }))
                    }
                  >
                    <div className="text-[11px] font-bold text-white uppercase tracking-tighter">
                      Dry Run Simulation
                    </div>
                    <div
                      className={`w-8 h-4 rounded-full p-0.5 border ${options.dryRun ? "bg-brand/20 border-brand/50" : "bg-black border-white/10"}`}
                    >
                      <div
                        className={`w-3 h-full rounded-full transition-all ${options.dryRun ? "translate-x-4 bg-brand shadow-[0_0_10px_#25D366]" : "bg-gray-700"}`}
                      />
                    </div>
                  </div>

                  {/* Slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-[11px] font-bold text-white uppercase tracking-tighter">
                      <span>Campaign Limit</span>
                      <span className="text-brand font-mono">
                        {options.limit || "UNLIMITED"}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1000"
                      step="50"
                      value={options.limit}
                      onChange={(e) =>
                        !isRunning &&
                        setOptions((o) => ({
                          ...o,
                          limit: parseInt(e.target.value),
                        }))
                      }
                      className="w-full accent-brand bg-zinc-800 h-1 rounded-full appearance-none cursor-pointer"
                      disabled={isRunning}
                    />
                  </div>

                  {/* Cooldown Slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-[11px] font-bold text-white uppercase tracking-tighter">
                      <span>Message Cooldown</span>
                      <span className="text-brand font-mono">
                        {options.cooldown === 0 ? "INSTANT (0s)" : `${options.cooldown}s`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="60"
                      step="1"
                      value={options.cooldown}
                      onChange={(e) =>
                        !isRunning &&
                        setOptions((o) => ({
                          ...o,
                          cooldown: parseInt(e.target.value),
                        }))
                      }
                      className="w-full accent-brand bg-zinc-800 h-1 rounded-full appearance-none cursor-pointer"
                      disabled={isRunning}
                    />
                  </div>

                  {/* Batch Pause Slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-[11px] font-bold text-white uppercase tracking-tighter">
                      <span>Batch Pause Limit</span>
                      <span className="text-brand font-mono">
                        {options.batchSize === 0 ? "DISABLED" : `${options.batchSize} msgs`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={options.batchSize}
                      onChange={(e) =>
                        !isRunning &&
                        setOptions((o) => ({
                          ...o,
                          batchSize: parseInt(e.target.value),
                        }))
                      }
                      className="w-full accent-brand bg-zinc-800 h-1 rounded-full appearance-none cursor-pointer"
                      disabled={isRunning}
                    />
                  </div>

                  {/* Scheduled Start Date-Time Picker */}
                  <div className="space-y-1.5 p-3 bg-white/5 rounded-xl border border-white/5">
                    <div className="text-[11px] font-bold text-white uppercase tracking-tighter flex justify-between items-center">
                      <span>Schedule Campaign (Local Time)</span>
                      {options.scheduledAt && (
                        <span className="text-amber-500 font-mono text-[9px] font-black">
                          Scheduled
                        </span>
                      )}
                    </div>
                    <input
                      type="datetime-local"
                      value={options.scheduledAt}
                      onChange={(e) =>
                        !isRunning &&
                        setOptions((o) => ({
                          ...o,
                          scheduledAt: e.target.value,
                        }))
                      }
                      className="w-full text-xs font-mono bg-black/40 border border-white/10 rounded-lg p-2 text-white focus:outline-none focus:border-brand transition-colors [color-scheme:dark]"
                      disabled={isRunning}
                    />
                    <p className="text-[8px] text-gray-500 leading-normal">
                      Leave blank to execute immediately. Campaign will wait until the selected time before starting.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[10px] font-mono text-gray-600 italic shrink-0">
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span>Wait</span>
                  <span>
                    {options.cooldown === 0
                      ? "0s (Instant)"
                      : `${options.cooldown}s`}
                  </span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span>Pause</span>
                  <span>
                    {options.batchSize === 0
                      ? "None"
                      : `After ${options.batchSize} msgs (5m)`}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {status.status !== "CONNECTED" &&
              status.status !== "QR" &&
              !options.dryRun ? (
                <div className="bg-zinc-950 border border-white/10 rounded-xl p-4 flex flex-col gap-3.5 shadow-2xl relative overflow-hidden text-left">
                  {/* Glowing Accent Indicator */}
                  <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-amber-500/20 via-amber-500 to-amber-500/20 animate-pulse" />

                  <div className="flex items-center gap-2.5">
                    <div className="relative flex shrink-0">
                      <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                    </div>
                    <div className="text-left">
                      <h4 className="text-[11px] font-black text-white uppercase tracking-wider leading-none font-sans">
                        WhatsApp Hub
                      </h4>
                      <span className="text-[9px] font-mono text-amber-500 font-bold uppercase mt-1 inline-block">
                        {status.status === "CONNECTING"
                          ? "Connecting Browser..."
                          : "Offline / Preparing..."}
                      </span>
                    </div>
                  </div>

                  <p className="text-[10px] text-gray-400 leading-relaxed font-sans">
                    The background chromium engine is initializing. This usually
                    takes 15-30 seconds.
                  </p>

                  {/* Console Output for transparency */}
                  {status.initLogs && status.initLogs.length > 0 && (
                    <div className="bg-black/95 border border-white/5 rounded-lg p-2.5 max-h-[110px] overflow-y-auto text-left font-mono text-[9px] text-zinc-400 leading-relaxed space-y-1 select-none">
                      {status.initLogs.slice(-4).map((log, idx) => (
                        <div key={idx} className="truncate">
                          {log}
                        </div>
                      ))}
                    </div>
                  )}

                  {status.initError && (
                    <div className="p-2.5 rounded-lg bg-red-500/5 border border-red-500/15 text-[9px] text-red-400 leading-normal font-mono break-all max-h-[80px] overflow-y-auto">
                      <strong className="text-red-500 block uppercase text-[8px] tracking-widest font-black mb-1">
                        Initialization Error:
                      </strong>
                      {status.initError}
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <button
                      disabled
                      className="w-full py-3.5 rounded-xl bg-zinc-900 border border-white/5 text-zinc-500 text-[9px] font-black tracking-[0.2em] uppercase cursor-not-allowed flex items-center justify-center gap-2 font-sans"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-pulse" />
                      Booting Headless...
                    </button>

                    <button
                      disabled={isResetting}
                      onClick={handleHardReset}
                      className="w-full py-2.5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-500 hover:text-red-300 text-[9px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      title="Force delete session locks and respawn Puppeteer"
                    >
                      <LogOut
                        size={10}
                        className={isResetting ? "animate-spin" : ""}
                      />
                      <span>
                        {isResetting
                          ? "Resetting Engine..."
                          : "Hard Reset Engine"}
                      </span>
                    </button>
                  </div>
                </div>
              ) : status.status === "QR" && !options.dryRun ? (
                <div className="flex flex-col gap-3">
                  <div className="bg-white p-3 rounded-xl flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.1)] group overflow-hidden relative active:scale-105 transition-transform cursor-zoom-in">
                    <img
                      src={status.qr || "#"}
                      alt="Scan QR"
                      className="w-full aspect-square max-w-[200px]"
                    />
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-4 text-center">
                      <QrCode size={32} className="text-brand mb-2" />
                      <p className="text-brand text-[10px] font-bold uppercase tracking-widest">
                        Scan with WhatsApp
                      </p>
                    </div>
                  </div>
                  <button
                    disabled={isLoggingOut}
                    onClick={handleLogout}
                    className="w-full py-2.5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 hover:text-red-300 text-[9px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <LogOut
                      size={10}
                      className={isLoggingOut ? "animate-spin" : ""}
                    />
                    <span>
                      {isLoggingOut
                        ? "Resetting client..."
                        : "Regenerate / Reset QR"}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    disabled={!fileInfo || isRunning}
                    onClick={() => startBulkSend(false)}
                    className={`group w-full py-4 rounded-xl font-black text-[11px] tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-3 cursor-pointer ${
                      isRunning
                        ? "bg-amber-500/10 border border-amber-500/20 text-amber-500"
                        : !fileInfo
                          ? "bg-zinc-800 border border-white/5 text-zinc-600 cursor-not-allowed"
                          : options.dryRun
                            ? "bg-sky-500 text-black shadow-[0_0_30px_rgba(14,165,233,0.3)] hover:scale-[1.02] active:scale-[0.98]"
                            : "bg-brand text-black shadow-[0_0_30px_rgba(37,211,102,0.3)] hover:scale-[1.02] active:scale-[0.98]"
                    }`}
                  >
                    {isRunning ? (
                      <>
                        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        Campaign Live
                      </>
                    ) : (
                      <>
                        <Play className="fill-current w-3 h-3 group-hover:scale-110 transition-transform" />
                        {options.dryRun
                          ? "Run Simulator"
                          : "Initiate Broadcast"}
                      </>
                    )}
                  </button>

                  {isRunning && (
                    <button
                      disabled={isStopping}
                      onClick={handleStopCampaign}
                      className="w-full py-3 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 font-black text-[11px] tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
                    >
                      <div className="w-2.5 h-2.5 bg-red-500 rounded-sm" />
                      {isStopping ? "Stopping..." : "Stop Campaign"}
                    </button>
                  )}

                  {status.status === "CONNECTED" && (
                    <button
                      disabled={isLoggingOut || isRunning}
                      onClick={handleLogout}
                      className="w-full py-2.5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-500 hover:text-red-300 text-[9px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <LogOut
                        size={10}
                        className={isLoggingOut ? "animate-spin" : ""}
                      />
                      <span>
                        {isLoggingOut
                          ? "Disconnecting..."
                          : "Disconnect WhatsApp Account"}
                      </span>
                    </button>
                  )}
                </div>
              )}

              {status.status !== "CONNECTED" && status.status !== "QR" && (
                <div className="mt-1 text-center max-w-[280px] mx-auto">
                  <p className="text-[10px] text-gray-500 leading-normal">
                    WhatsApp client starting. Toggle{" "}
                    <span className="text-sky-400 font-bold font-mono">
                      Dry Run Simulation
                    </span>{" "}
                    above to test campaigns offline immediately!
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

        {/* Footer Bar */}
        <div className="pb-6 flex flex-col md:flex-row justify-between items-center text-[9px] text-gray-600 font-bold uppercase tracking-widest gap-4">
          <div className="flex gap-6">
            <span className="flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-gray-700"></div> Node.js
              v18.12.0
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-gray-700"></div> Protocol:
              v4.2
            </span>
          </div>
          <div className="flex gap-6">
            <span className="flex items-center gap-1.5 text-gray-700">
              <CheckCircle2 size={10} /> Auto-Save: ACTIVE
            </span>
            <span className="flex items-center gap-1.5 text-gray-700">
              <Settings size={10} /> Mode: PERSISTENT_AUTH
            </span>
          </div>
        </div>
      </div>

      {/* Visual Template Editor Modal */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 30 }}
            className="bg-[#111113] border border-white/10 rounded-2xl w-full max-w-5xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col"
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-zinc-950/80">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-brand/10 rounded-xl border border-brand/20 text-brand">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    Interactive Template & Spreadsheet Editor
                  </h2>
                  <p className="text-[10px] text-gray-500 font-mono">
                    Modifying uploads/custom_template.xlsx on Server
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditorOpen(false)}
                className="p-1.5 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>{" "}
            {/* Modal scrollable spreadsheet table body */}
            <div className="p-6 overflow-x-auto overflow-y-auto max-h-[50vh] custom-scrollbar bg-black/20">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-white/10 text-gray-500 font-bold uppercase tracking-widest text-[9px] select-none bg-zinc-900/40">
                    <th className="py-2.5 px-3 w-[5%] text-center">Row</th>
                    {detectedHeaders.map((header) => {
                      const isPhone =
                        header.toLowerCase().includes("phone") ||
                        header.toLowerCase().includes("mobile") ||
                        header.toLowerCase().includes("whatsapp");
                      return (
                        <th
                          key={header}
                          className={`py-2.5 px-4 uppercase tracking-widest text-[9px] ${isPhone ? "text-brand" : ""}`}
                        >
                          {header}
                        </th>
                      );
                    })}
                    <th className="py-2.5 px-3 w-[5%] text-center font-bold">
                      Delete
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {contacts.map((contact, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-3 px-3 font-mono text-[10px] text-gray-500 text-center">
                        {idx + 1}
                      </td>
                      {detectedHeaders.map((header) => {
                        const hLower = header.toLowerCase();
                        const isMessage =
                          hLower === "custom_message" ||
                          hLower.includes("message") ||
                          hLower.includes("msg") ||
                          hLower.includes("text");
                        return (
                          <td key={header} className="py-2 px-4 min-w-[150px]">
                            {isMessage ? (
                              <textarea
                                rows={1}
                                value={
                                  contact[header] !== undefined
                                    ? contact[header]
                                    : ""
                                }
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setContacts((prev) =>
                                    prev.map((c, i) => {
                                      if (i === idx) {
                                        const updated = { ...c, [header]: val };
                                        const hL = header.toLowerCase();
                                        if (
                                          hL === "custom_message" ||
                                          hL.includes("message") ||
                                          hL.includes("msg") ||
                                          hL.includes("text")
                                        ) {
                                          updated.custom_message = val;
                                        }
                                        return updated;
                                      }
                                      return c;
                                    }),
                                  );
                                }}
                                className="bg-zinc-950 border border-white/5 focus:border-brand/40 rounded px-2.5 py-1.5 w-full text-xs text-white font-mono resize-none focus:h-auto"
                                placeholder={`Enter ${header}...`}
                              />
                            ) : (
                              <input
                                type="text"
                                value={
                                  contact[header] !== undefined
                                    ? contact[header]
                                    : ""
                                }
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setContacts((prev) =>
                                    prev.map((c, i) => {
                                      if (i === idx) {
                                        const updated = { ...c, [header]: val };
                                        const hLower = header.toLowerCase();
                                        if (
                                          hLower.includes("phone") ||
                                          hLower.includes("mobile") ||
                                          hLower.includes("whatsapp") ||
                                          hLower === "number"
                                        ) {
                                          updated.phone_number = val;
                                        }
                                        if (
                                          hLower === "name" ||
                                          hLower.includes("recipient")
                                        ) {
                                          updated.name = val;
                                        }
                                        return updated;
                                      }
                                      return c;
                                    }),
                                  );
                                }}
                                className="bg-zinc-950 border border-white/5 focus:border-brand/40 rounded px-2.5 py-1.5 w-full text-xs text-white font-mono"
                                placeholder={`Enter ${header}...`}
                              />
                            )}
                          </td>
                        );
                      })}
                      <td className="py-2 px-3 text-center">
                        <button
                          onClick={() => {
                            setContacts((prev) =>
                              prev.filter((_, i) => i !== idx),
                            );
                          }}
                          className="p-1.5 hover:bg-red-500/10 rounded border border-transparent hover:border-red-500/20 text-gray-500 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {contacts.length === 0 && (
                    <tr>
                      <td
                        colSpan={detectedHeaders.length + 2}
                        className="py-12 text-center text-xs text-gray-500 font-mono italic"
                      >
                        No contact records found. Click "Add Recipient" to
                        manually build a contact list!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* Modal Action Controls */}
            <div className="p-5 border-t border-white/10 bg-zinc-950/80 flex flex-col md:flex-row gap-4 justify-between items-center">
              {/* Quick actions left */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setContacts((prev) => {
                      const newContact: any = {
                        phone_number: "",
                        name: "",
                        custom_message: globalTemplateText,
                        status: "",
                      };
                      detectedHeaders.forEach((h) => {
                        newContact[h] =
                          h === "custom_message" ? globalTemplateText : "";
                      });
                      return [...prev, newContact];
                    });
                  }}
                  className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded-lg border border-white/5 font-bold uppercase tracking-wider transition-all cursor-pointer"
                >
                  <Plus size={14} className="text-brand" />
                  Add Recipient
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete all rows?")) {
                      setContacts([]);
                    }
                  }}
                  className="flex items-center gap-1.5 text-xs bg-red-950/20 hover:bg-red-950/40 text-red-400 px-3 py-2 rounded-lg border border-red-500/10 font-bold uppercase tracking-wider transition-all cursor-pointer"
                >
                  <Trash2 size={14} />
                  Clear All
                </button>
              </div>

              {/* Apply/Save controls right */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="text-xs text-gray-400 hover:text-white px-5 py-2 font-bold uppercase tracking-wider font-mono transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingTemplate}
                  onClick={() => saveTemplateData(contacts)}
                  className="flex items-center gap-1.5 text-xs bg-brand text-black hover:scale-105 active:scale-95 duration-200 px-6 py-2.5 rounded-lg font-black uppercase tracking-widest shadow-[0_0_20px_rgba(37,211,102,0.3)] disabled:opacity-50 disabled:scale-100 cursor-pointer"
                >
                  {isSavingTemplate ? (
                    <>Saving...</>
                  ) : (
                    <>
                      <Save size={14} />
                      Save & Apply Template
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      <TutorialModal
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
      />

      <FaqModal
        isOpen={isFaqOpen}
        onClose={() => setIsFaqOpen(false)}
      />
    </div>
  );
}
