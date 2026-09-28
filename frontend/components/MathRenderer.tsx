"use client";

import React, { useMemo } from "react";
import katex from "katex";

interface MathRendererProps {
  text: string;
  className?: string;
  inline?: boolean;
}

/**
 * Universal Math & LaTeX formula renderer using KaTeX
 * Automatically detects LaTeX math expressions ($...$, $$...$$, \\(...\\), \\[...\\])
 * and renders them beautifully with typographic math rendering.
 */
export const MathRenderer: React.FC<MathRendererProps> = ({
  text,
  className = "",
  inline = false,
}) => {
  const renderedContent = useMemo(() => {
    if (!text || typeof text !== "string") return "";

    // Quick check: does the text contain LaTeX markers?
    const hasLatex =
      text.includes("$") ||
      text.includes("\\(") ||
      text.includes("\\[") ||
      text.includes("\\frac") ||
      text.includes("\\sqrt") ||
      text.includes("\\sum") ||
      text.includes("\\int") ||
      text.includes("\\alpha") ||
      text.includes("\\beta") ||
      text.includes("\\theta") ||
      text.includes("\\pi");

    if (!hasLatex) {
      return null; // Render plain text
    }

    // Regex to split by display math ($$...$$ or \[...\]) or inline math ($...$ or \(...\))
    // Group 1: Display math $$...$$
    // Group 2: Display math \[...\]
    // Group 3: Inline math $...$
    // Group 4: Inline math \(...\)
    const mathRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^\$\n]+?\$|\\\([\s\S]*?\\\))/g;

    const parts = text.split(mathRegex);

    return parts.map((part, index) => {
      if (!part) return null;

      // Display math: $$...$$
      if (part.startsWith("$$") && part.endsWith("$$")) {
        const math = part.slice(2, -2).trim();
        try {
          const html = katex.renderToString(math, { displayMode: true, throwOnError: false });
          return (
            <span
              key={index}
              className="my-2 block overflow-x-auto py-1 text-center font-serif text-indigo-200"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          return <span key={index}>{part}</span>;
        }
      }

      // Display math: \[...\]
      if (part.startsWith("\\[") && part.endsWith("\\]")) {
        const math = part.slice(2, -2).trim();
        try {
          const html = katex.renderToString(math, { displayMode: true, throwOnError: false });
          return (
            <span
              key={index}
              className="my-2 block overflow-x-auto py-1 text-center font-serif text-indigo-200"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          return <span key={index}>{part}</span>;
        }
      }

      // Inline math: $...$
      if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
        const math = part.slice(1, -1).trim();
        try {
          const html = katex.renderToString(math, { displayMode: false, throwOnError: false });
          return (
            <span
              key={index}
              className="inline-block px-0.5 font-serif"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          return <span key={index}>{part}</span>;
        }
      }

      // Inline math: \(...\)
      if (part.startsWith("\\(") && part.endsWith("\\)")) {
        const math = part.slice(2, -2).trim();
        try {
          const html = katex.renderToString(math, { displayMode: false, throwOnError: false });
          return (
            <span
              key={index}
              className="inline-block px-0.5 font-serif"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          return <span key={index}>{part}</span>;
        }
      }

      // Plain text part
      return <span key={index}>{part}</span>;
    });
  }, [text]);

  if (!renderedContent) {
    if (inline) {
      return <span className={className}>{text}</span>;
    }
    return <div className={`whitespace-pre-wrap leading-relaxed ${className}`}>{text}</div>;
  }

  if (inline) {
    return <span className={className}>{renderedContent}</span>;
  }

  return (
    <div className={`whitespace-pre-wrap leading-relaxed ${className}`}>
      {renderedContent}
    </div>
  );
};

export default MathRenderer;
