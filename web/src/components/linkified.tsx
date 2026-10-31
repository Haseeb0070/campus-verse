const URL_PATTERN = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;

/** Plain text with web links made clickable. Never renders HTML from user content. */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="break-all text-accent-ink underline underline-offset-2"
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}
