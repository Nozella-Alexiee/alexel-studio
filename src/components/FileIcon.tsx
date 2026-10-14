import React from "react";
import { Folder, FolderOpen } from "lucide-react";
import { useIconUrl } from "../extensions/icons";

interface FileIconProps {
  filename?: string;
  extension?: string;
  size?: number;
  className?: string;
}

/** Ikon berkas: dari tema ikon ekstensi bila aktif, selain itu ikon bawaan Nozel. */
export const FileIcon: React.FC<FileIconProps> = (props) => {
  const url = useIconUrl(props.filename ?? "", "file");
  const size = props.size ?? 14;
  if (url) return <img src={url} width={size} height={size} alt="" draggable={false} className={`file-icon-img ${props.className ?? ""}`} />;
  return <BuiltinFileIcon {...props} />;
};

/** Ikon folder: dari tema ikon ekstensi bila aktif (mis. folder "src" khusus), selain itu ikon Nozel. */
export function FolderIcon({ name, open, size = 15 }: { name: string; open: boolean; size?: number }) {
  const url = useIconUrl(name, "folder", open);
  if (url) return <img src={url} width={size} height={size} alt="" draggable={false} className="file-icon-img" />;
  return open ? <FolderOpen size={size} className="tree-folder" aria-hidden /> : <Folder size={size} className="tree-folder" aria-hidden />;
}

const BuiltinFileIcon: React.FC<FileIconProps> = ({
  filename = "",
  extension,
  size = 14,
  className = "",
}) => {
  const ext = (extension || filename.split(".").pop() || "").toLowerCase();
  const lowerName = filename.toLowerCase();

  // Special files
  if (lowerName === "package.json") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect width="24" height="24" rx="4" fill="#cb3837" />
        <path d="M4 8H20V16H16V12H12V16H4V8Z" fill="#ffffff" />
      </svg>
    );
  }

  if (lowerName.includes("gitignore") || lowerName.includes(".git")) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="2" y="2" width="20" height="20" rx="4" fill="#f05032" />
        <circle cx="12" cy="7" r="2.5" fill="#ffffff" />
        <circle cx="8" cy="15" r="2.5" fill="#ffffff" />
        <circle cx="16" cy="15" r="2.5" fill="#ffffff" />
        <path d="M12 9.5V13.5M10.5 14L8 13M13.5 14L16 13" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  switch (ext) {
    // 1. HTML5 Official Logo
    case "html":
    case "htm":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          <path d="M3 2L4.8 20L12 22L19.2 20L21 2H3Z" fill="#E44D26" />
          <path d="M12 3.6V20.3L17.7 18.7L19.2 3.6H12Z" fill="#F16529" />
          <path
            d="M6.8 6.5H17.2L16.9 9.2H9.6L9.9 12H16.6L16.1 16.5L12 17.6L7.9 16.5L7.6 13.8H10.2L10.4 14.8L12 15.2L13.6 14.8L13.8 12.8H7.4L6.8 6.5Z"
            fill="#FFFFFF"
          />
        </svg>
      );

    // 2. CSS3 Official Logo
    case "css":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          <path d="M3 2L4.8 20L12 22L19.2 20L21 2H3Z" fill="#264DE4" />
          <path d="M12 3.6V20.3L17.7 18.7L19.2 3.6H12Z" fill="#2965F1" />
          <path
            d="M6.8 6.5H17.2L16.8 10.3H9.8L10.1 12H16.6L16 16.5L12 17.6L8 16.5L7.7 13.8H10.3L10.4 14.8L12 15.2L13.6 14.8L13.9 12.8H7.4L6.8 6.5Z"
            fill="#FFFFFF"
          />
        </svg>
      );

    // 3. React (TSX / JSX)
    case "tsx":
    case "jsx":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          <circle cx="12" cy="12" r="2.2" fill="#00D8FF" />
          <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#00D8FF" strokeWidth="1.5" />
          <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#00D8FF" strokeWidth="1.5" transform="rotate(60 12 12)" />
          <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#00D8FF" strokeWidth="1.5" transform="rotate(120 12 12)" />
        </svg>
      );

    // 4. TypeScript Official Logo
    case "ts":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          <rect width="24" height="24" rx="4" fill="#3178C6" />
          <path d="M5 8.5H13V10.2H10.1V18.5H7.9V10.2H5V8.5Z" fill="#FFFFFF" />
          <path
            d="M13.5 15.6C13.5 14.2 14.5 13.4 16.2 13.4C17.2 13.4 18 13.6 18.6 14L18.1 15.4C17.6 15.1 16.9 14.9 16.2 14.9C15.3 14.9 14.8 15.3 14.8 15.8C14.8 16.3 15.2 16.6 16.4 17C17.9 17.5 18.8 18.2 18.8 19.6C18.8 21.1 17.6 22 15.9 22C14.7 22 13.8 21.7 13.1 21.2L13.7 19.8C14.3 20.2 15.1 20.5 16 20.5C16.9 20.5 17.5 20.1 17.5 19.5C17.5 19 17 18.7 15.8 18.3C14.4 17.8 13.5 17 13.5 15.6Z"
            fill="#FFFFFF"
          />
        </svg>
      );

    // 5. JavaScript Official Logo
    case "js":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          <rect width="24" height="24" rx="4" fill="#F7DF1E" />
          <path
            d="M7 13.5V17.2C7 19.2 8.2 20.5 10.3 20.5C11.5 20.5 12.4 20 12.9 19.3L11.7 18C11.4 18.4 10.9 18.8 10.2 18.8C9.3 18.8 8.8 18.2 8.8 17V13.5H7Z"
            fill="#000000"
          />
          <path
            d="M14 13.5C14 15 15 15.8 16.8 16.3C18 16.7 18.5 17 18.5 17.5C18.5 18.1 17.9 18.5 17 18.5C16.1 18.5 15.3 18.1 14.7 17.7L13.7 19.2C14.5 19.9 15.7 20.5 17 20.5C19.3 20.5 20.5 19.2 20.5 17.4C20.5 15.8 19.5 15 17.7 14.5C16.5 14.1 16 13.8 16 13.3C16 12.8 16.5 12.5 17.3 12.5C18.1 12.5 18.8 12.8 19.3 13.1L20.2 11.6C19.4 11 18.4 10.7 17.3 10.7C15.2 10.7 14 12 14 13.5Z"
            fill="#000000"
          />
        </svg>
      );

    // 6. Rust Official Gear Logo
    case "rs":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          <rect width="24" height="24" rx="4" fill="#141724" stroke="#DEA584" strokeWidth="1" />
          <path
            d="M12 5C8.1 5 5 8.1 5 12C5 15.9 8.1 19 12 19C15.9 19 19 15.9 19 12C19 8.1 15.9 5 12 5Z"
            stroke="#DEA584"
            strokeWidth="1.5"
            strokeDasharray="2 2"
          />
          <path
            d="M9 8.5H13C14.4 8.5 15.2 9.2 15.2 10.4C15.2 11.4 14.6 12 13.6 12.3L15.5 16H13.6L12 12.8H10.5V16H9V8.5ZM10.5 11.5H12.8C13.4 11.5 13.8 11.1 13.8 10.5C13.8 9.9 13.4 9.6 12.8 9.6H10.5V11.5Z"
            fill="#DEA584"
          />
        </svg>
      );

    // 7. Python Official Snakes Logo
    case "py":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          <path
            d="M11.9 2C7.8 2 8 3.7 8 3.7L8 5.6H12.1V6.2H5.3C3.2 6.2 2 7.5 2 11.4C2 15.3 3.5 15.1 3.5 15.1H5.1V12.8C5.1 10.1 7.4 10.1 7.4 10.1H11.9C14.3 10.1 14.3 8 14.3 8V3.7C14.3 3.7 14.5 2 11.9 2ZM9.5 3.1C10 3.1 10.4 3.5 10.4 4C10.4 4.5 10 4.9 9.5 4.9C9 4.9 8.6 4.5 8.6 4C8.6 3.5 9 3.1 9.5 3.1Z"
            fill="#3776AB"
          />
          <path
            d="M12.1 22C16.2 22 16 20.3 16 20.3V18.4H11.9V17.8H18.7C20.8 17.8 22 16.5 22 12.6C22 8.7 20.5 8.9 20.5 8.9H18.9V11.2C18.9 13.9 16.6 13.9 16.6 13.9H12.1C9.7 13.9 9.7 16 9.7 16V20.3C9.7 20.3 9.5 22 12.1 22ZM14.5 20.9C14 20.9 13.6 20.5 13.6 20C13.6 19.5 14 19.1 14.5 19.1C15 19.1 15.4 19.5 15.4 20C15.4 20.5 15 20.9 14.5 20.9Z"
            fill="#FFD43B"
          />
        </svg>
      );

    // 8. Markdown Official Logo
    case "md":
    case "markdown":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          <rect x="2" y="4" width="20" height="16" rx="3" fill="#141724" stroke="#38BDF8" strokeWidth="1.5" />
          <path d="M5 15V9L8 12.5L11 9V15M17 15L14 11.5H16V9H18V11.5H20L17 15Z" fill="#38BDF8" />
        </svg>
      );

    // 9. JSON Official Braces Logo
    case "json":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          <rect width="24" height="24" rx="4" fill="#141724" stroke="#FBBF24" strokeWidth="1" />
          <path
            d="M7 6C8 6 8.5 7 8.5 8V10C8.5 11 9.5 11.5 10 11.5C9.5 11.5 8.5 12 8.5 13V15C8.5 16 8 17 7 17M17 6C16 6 15.5 7 15.5 8V10C15.5 11 14.5 11.5 14 11.5C14.5 11.5 15.5 12 15.5 13V15C15.5 16 16 17 17 17"
            stroke="#FBBF24"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );

    // 10. SVG Vector Logo
    case "svg":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          {/* Kurva bezier dengan titik kendali: ikon "vektor", bukan huruf. */}
          <path d="M4 18C7 6 17 6 20 18" stroke="#FFB13B" strokeWidth="2" strokeLinecap="round" />
          <rect x="2" y="16" width="4" height="4" rx="1" fill="#FFB13B" />
          <rect x="18" y="16" width="4" height="4" rx="1" fill="#FFB13B" />
          <circle cx="12" cy="6" r="2.2" fill="#FFB13B" />
        </svg>
      );

    // 11. PHP Official Badge Logo
    case "php":
    case "phtml":
    case "php3":
    case "php4":
    case "php5":
    case "php7":
    case "phps":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          <rect width="24" height="24" rx="4" fill="#4F5D95" stroke="#777BB4" strokeWidth="1" />
          <path
            d="M3.5 8H6.8C8 8 8.8 8.7 8.8 9.8C8.8 11 8 11.7 6.8 11.7H5V16H3.5V8ZM5 10.4H6.6C7.1 10.4 7.4 10.1 7.4 9.8C7.4 9.5 7.1 9.2 6.6 9.2H5V10.4Z"
            fill="#FFFFFF"
          />
          <path
            d="M9.8 8H11.2V11.2H13.8V8H15.2V16H13.8V12.4H11.2V16H9.8V8Z"
            fill="#FFFFFF"
          />
          <path
            d="M16.2 8H19.5C20.7 8 21.5 8.7 21.5 9.8C21.5 11 20.7 11.7 19.5 11.7H17.7V16H16.2V8ZM17.7 10.4H19.3C19.8 10.4 20.1 10.1 20.1 9.8C20.1 9.5 19.8 9.2 19.3 9.2H17.7V10.4Z"
            fill="#FFFFFF"
          />
        </svg>
      );

    // 12. Native Images (PNG, JPG, GIF, WEBP, ICO)
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "ico":
    case "bmp":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          <rect width="24" height="24" rx="4" fill="#0284c7" />
          <circle cx="8" cy="8" r="2" fill="#ffffff" />
          <path d="M4 18L10 12L14 16L17 13L20 16V18H4Z" fill="#ffffff" />
          <path d="M4 18H20V20H4V18Z" fill="#bae6fd" opacity="0.6" />
        </svg>
      );

    // 13. C / C++
    case "c":
    case "cpp":
    case "cc":
    case "cxx":
    case "h":
    case "hpp":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          <rect width="24" height="24" rx="4" fill="#00599C" />
          <path d="M14 8C10.5 8 8 10 8 12C8 14 10.5 16 14 16C15.2 16 16.2 15.6 17 15L16 13.5C15.5 14 14.8 14.3 14 14.3C11.8 14.3 10.2 13.2 10.2 12C10.2 10.8 11.8 9.7 14 9.7C14.8 9.7 15.5 10 16 10.5L17 9C16.2 8.4 15.2 8 14 8Z" fill="#ffffff" />
          <path d="M18 10.5H19.5V12H18V13.5H16.5V12H15V10.5H16.5V9H18V10.5Z" fill="#00A0D6" />
        </svg>
      );

    // 14. Java
    case "java":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          <rect width="24" height="24" rx="4" fill="#E76F00" />
          <path d="M12 4C10 7 14 8 11 11C9 13 10 14 12 15C10 16 7 15 8 13C9 11 11 10 9 8C8 6 10 5 12 4Z" fill="#5382A1" />
          <ellipse cx="12" cy="18" rx="6" ry="1.5" fill="#ffffff" />
        </svg>
      );

    // 15. Go
    case "go":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          <rect width="24" height="24" rx="4" fill="#00ACD7" />
          <path d="M7 12C7 9.8 8.8 8 11 8C12.5 8 13.8 8.8 14.5 10L12.8 11C12.4 10.4 11.8 10 11 10C9.9 10 9 10.9 9 12C9 13.1 9.9 14 11 14C11.8 14 12.4 13.6 12.8 13H11V11.5H14.8C14.9 11.8 15 12.1 15 12.5C15 14.7 13.2 16.5 11 16.5C8.8 16.5 7 14.2 7 12Z" fill="#ffffff" />
        </svg>
      );

    // 16. SQL
    case "sql":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          <rect width="24" height="24" rx="4" fill="#CC292B" />
          <ellipse cx="12" cy="7" rx="6" ry="2.5" fill="#ffffff" />
          <path d="M6 7V17C6 18.5 8.7 19.5 12 19.5C15.3 19.5 18 18.5 18 17V7" stroke="#ffffff" strokeWidth="1.5" fill="none" />
          <path d="M6 12C6 13.5 8.7 14.5 12 14.5C15.3 14.5 18 13.5 18 12" stroke="#ffffff" strokeWidth="1.5" fill="none" />
        </svg>
      );

    // 17. YAML
    case "yaml":
    case "yml":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          <rect width="24" height="24" rx="4" fill="#CB171E" />
          <text x="12" y="16" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">YML</text>
        </svg>
      );

    // 18. Shell / Bash
    case "sh":
    case "bash":
    case "zsh":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          <rect width="24" height="24" rx="4" fill="#2E3440" stroke="#4C566A" strokeWidth="1" />
          <path d="M6 8L10 12L6 16" stroke="#A3BE8C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 16H18" stroke="#A3BE8C" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    // Default File Code Icon
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
          <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#1E293B" stroke="#64748B" strokeWidth="1.5" />
          <path d="M14 2V8H20" stroke="#64748B" strokeWidth="1.5" />
          <path d="M9 13L7 15L9 17M15 13L17 15L15 17" stroke="#38BDF8" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
  }
};
