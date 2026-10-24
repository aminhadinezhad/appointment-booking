import { parseLegalText } from "@/lib/legal-text";
import { cn } from "@/lib/utils";

/** Renders a legal text (headings, paragraphs, lists) as plain React text. */
export function LegalDocument({ content, className }: { content: string; className?: string }) {
  const blocks = parseLegalText(content);
  return (
    <div className={cn("space-y-3 text-sm leading-8 text-foreground/90", className)}>
      {blocks.map((block, i) => {
        if (block.type === "heading") return <h2 key={i} className="pt-3 text-base font-bold text-foreground first:pt-0">{block.text}</h2>;
        if (block.type === "list")
          return (
            <ul key={i} className="list-disc space-y-1 pr-5 marker:text-primary">
              {block.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          );
        return <p key={i}>{block.text}</p>;
      })}
    </div>
  );
}
