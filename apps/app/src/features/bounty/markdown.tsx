import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@bandcoin/ui/lib/cn";

/**
 * Renders a bounty description or report (CommonMark + tables, lists,
 * strikethrough). Links open in a new tab; raw HTML is never rendered.
 * `compact` tightens spacing for previews.
 */
export function Markdown({
  content,
  compact,
  className,
}: {
  content: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-fg/90 text-[15px] leading-relaxed break-words",
        "[&_h1]:display [&_h2]:display [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-2xl [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-xl",
        "[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-bold [&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:font-semibold",
        "[&_li]:my-1 [&_ol]:my-3 [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:my-3 [&_ul]:my-3 [&_ul]:ml-5 [&_ul]:list-disc",
        "[&_a]:text-primary-text [&_strong]:text-fg [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold",
        "[&_blockquote]:border-primary [&_blockquote]:text-fg-muted [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:pl-4",
        "[&_code]:bg-surface-2 [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px]",
        "[&_pre]:bg-surface-2 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_th]:bg-surface-2 [&_table]:my-4 [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left",
        "[&_hr]:my-6 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        compact &&
          "text-sm [&_h1]:my-1 [&_h1]:text-lg [&_h2]:my-1 [&_h2]:text-base [&_ol]:my-1 [&_p]:my-1 [&_ul]:my-1",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
