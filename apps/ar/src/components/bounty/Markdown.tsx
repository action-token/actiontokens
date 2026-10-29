import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@bandcoin/ui/lib/cn";

/**
 * A bounty brief or report (CommonMark + tables, lists, strikethrough), in the
 * HUD's type. Links open in a new tab; raw HTML is never rendered.
 */
export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        "text-ar-dim text-[13px] leading-relaxed break-words",
        "[&_h1]:text-ar-text [&_h2]:text-ar-text [&_h3]:text-ar-text [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-[16px] [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:font-semibold",
        "[&_a]:text-ar-accent-hot [&_strong]:text-ar-text [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold",
        "[&_li]:my-0.5 [&_ol]:my-2 [&_ol]:ml-4 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:my-2 [&_ul]:ml-4 [&_ul]:list-disc",
        "[&_blockquote]:border-ar-accent/60 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-3",
        "[&_code]:bg-ar-surface-3 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px]",
        "[&_pre]:bg-ar-surface-3 [&_pre]:rounded-ar [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_td]:border-ar-line [&_th]:border-ar-line [&_table]:my-3 [&_table]:block [&_table]:overflow-x-auto [&_table]:text-[12px] [&_td]:border [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left",
        "[&_hr]:border-ar-line [&_hr]:my-4 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
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
