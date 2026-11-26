import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/** Line icons. A shape marked className="duo" is the icon body: it fills softly when the icon sits
 *  in the current page's link (see .duo in globals.css). */
function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const TodayIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle className="duo" cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />
  </Icon>
);

export const TimetableIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect className="duo" x="3.5" y="5" width="17" height="15" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);

export const NoticesIcon = (p: IconProps) => (
  <Icon {...p}>
    <path className="duo" d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1z" />
    <path d="M16 9a4 4 0 0 1 0 6" />
  </Icon>
);

export const ChatIcon = (p: IconProps) => (
  <Icon {...p}>
    <path className="duo" d="M4 12a8 8 0 1 1 3.5 6.6L4 20l1.3-3.6A8 8 0 0 1 4 12z" />
  </Icon>
);

export const FeedIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect className="duo" x="4" y="4" width="16" height="16" rx="4" />
    <path d="M8 9h8M8 12.5h8M8 16h5" />
  </Icon>
);

export const FlagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 21V4.5M5 4.5h11l-2 4 2 4H5" />
  </Icon>
);

export const ManageIcon = (p: IconProps) => (
  <Icon {...p}>
    <path className="duo" d="M12 3.5l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9v-5z" />
    <path d="M9 12l2 2 4-4" />
  </Icon>
);

export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path className="duo" d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Icon>
);

export const MoreIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6" cy="12" r="1.3" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <circle cx="18" cy="12" r="1.3" fill="currentColor" />
  </Icon>
);

export const AssignmentsIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect className="duo" x="5" y="4" width="14" height="17" rx="3" />
    <path d="M9 12.5l2 2 4-4" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2.2}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2}>
    <path d="M6.5 9.5L12 15l5.5-5.5" />
  </Icon>
);

export const ResourcesIcon = (p: IconProps) => (
  <Icon {...p}>
    <path className="duo" d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  </Icon>
);

export const DocumentIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 3.5H8a2.5 2.5 0 0 0-2.5 2.5v12A2.5 2.5 0 0 0 8 20.5h8a2.5 2.5 0 0 0 2.5-2.5V8z" />
    <path d="M14 3.5V8h4.5M9 13h6M9 16.5h4" />
  </Icon>
);

export const LinkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Icon>
);

export const PaperclipIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
  </Icon>
);

export const SectionsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle className="duo" cx="9" cy="9" r="3" />
    <circle cx="16.5" cy="10" r="2.5" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0M14.5 19a4.5 4.5 0 0 1 6-4.2" />
  </Icon>
);

export const SendIcon = (p: IconProps) => (
  <Icon strokeWidth={2.2} {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
);

export const SignOutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h9" />
  </Icon>
);

/** A window with its side panel: the button that shrinks the sidebar to icons, or opens it again. */
export const SidebarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <path d="M9.5 4.5v15" />
  </Icon>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);

export const PinIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </Icon>
);

export const VideoIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="7" width="12" height="10" rx="3" />
    <path d="M15 11l6-3.5v9L15 13z" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

/** The CampusVerse logo without its tile: Verse, the guide, in its graduation cap (concept 3 in
 *  docs/brand/logo-concepts). The face takes the text colour, the eyes are cut out so the tile shows
 *  through, and the cap is navy. Keep in step with docs/brand/verse-buddy.svg. */
export function LogoGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="12 12 42 42" className={className} aria-hidden="true">
      <path fill="currentColor" fillRule="evenodd" d="M18 39a14 14 0 1 0 28 0a14 14 0 1 0-28 0ZM24.8 39a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0ZM34.8 39a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0Z" />
      <g fill="#192840">
        <path d="M32 13 49 20.5 32 28 15 20.5z" />
        <path d="M49 20.5v9" stroke="#192840" strokeWidth={2} strokeLinecap="round" />
        <circle cx="49" cy="31" r="2.2" />
      </g>
    </svg>
  );
}

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-[10px] bg-accent text-on-accent ${className}`}
    >
      <LogoGlyph className="size-[78%]" />
    </span>
  );
}

export const PersonIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle className="duo" cx="12" cy="8.5" r="3.5" />
    <path d="M5 19.5a7 7 0 0 1 14 0" />
  </Icon>
);

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect className="duo" x="3.5" y="5" width="17" height="15" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
    <circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none" />
  </Icon>
);

export const ChecklistIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6.5l1.5 1.5L8.5 5M4 12.5l1.5 1.5 3-3M4 18.5l1.5 1.5 3-3" />
    <path d="M11.5 7h8.5M11.5 13h8.5M11.5 19h8.5" />
  </Icon>
);

export const ProgressIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 19.5h16" />
    <path d="M7 16v-4M12 16V8M17 16v-6.5" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle className="duo" cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l5 5" />
  </Icon>
);
