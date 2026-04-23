import { useState } from "react";
import { Link } from "react-router-dom";
import { Question, ArrowRight } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

/**
 * <HelpHint text="Short explanation of this field" />
 * <HelpHint text="..." article="india-statutory-pf-esic-pt" />
 *
 * A tiny ? icon that opens a popover. If an `article` slug is passed,
 * the popover includes a "Read full guide →" link to /app/help/:slug.
 */
export default function HelpHint({ text, article, testid }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex w-4 h-4 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors align-middle"
          data-testid={testid || "help-hint"}
          aria-label="Help"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        >
          <Question size={12} weight="bold" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 text-sm leading-relaxed" data-testid="help-hint-content">
        <div className="text-zinc-700 whitespace-pre-line">{text}</div>
        {article && (
          <Link
            to={`/app/help/${article}`}
            className="inline-flex items-center gap-1 mt-3 text-xs text-zinc-950 font-medium hover:underline"
            data-testid="help-hint-read-more"
            onClick={() => setOpen(false)}
          >
            Read full guide <ArrowRight size={12} weight="bold" />
          </Link>
        )}
      </PopoverContent>
    </Popover>
  );
}
