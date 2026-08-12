"use client";

import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";

interface MarkdownContentProps {
  content: string;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div>
      <div
        style={{
          padding: "16px",
          border: "1px solid #e4e4e7",
          borderRadius: "8px",
          background: "#fafafa",
          lineHeight: 1.7,
          fontSize: "0.95rem",
        }}
      >
        <ReactMarkdown
          components={{
            h1: ({ children, ...props }) => (
              <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "16px 0 8px" }} {...props}>
                {children}
              </h1>
            ),
            h2: ({ children, ...props }) => (
              <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "14px 0 6px" }} {...props}>
                {children}
              </h2>
            ),
            h3: ({ children, ...props }) => (
              <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: "12px 0 4px" }} {...props}>
                {children}
              </h3>
            ),
            p: ({ children, ...props }) => (
              <p style={{ margin: "8px 0" }} {...props}>
                {children}
              </p>
            ),
            ul: ({ children, ...props }) => (
              <ul style={{ paddingLeft: "24px", margin: "8px 0" }} {...props}>
                {children}
              </ul>
            ),
            ol: ({ children, ...props }) => (
              <ol style={{ paddingLeft: "24px", margin: "8px 0" }} {...props}>
                {children}
              </ol>
            ),
            li: ({ children, ...props }) => (
              <li style={{ margin: "4px 0" }} {...props}>
                {children}
              </li>
            ),
            code: ({ className, children, ...props }) => {
              const isInline = !className;
              if (isInline) {
                return (
                  <code
                    style={{
                      background: "#e4e4e7",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontSize: "0.9em",
                    }}
                    {...props}
                  >
                    {children}
                  </code>
                );
              }
              return (
                <pre
                  style={{
                    background: "#27272a",
                    color: "#fafafa",
                    padding: "12px",
                    borderRadius: "6px",
                    overflow: "auto",
                    fontSize: "0.85rem",
                    margin: "8px 0",
                  }}
                >
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              );
            },
            blockquote: ({ children, ...props }) => (
              <blockquote
                style={{
                  borderLeft: "3px solid #a1a1aa",
                  paddingLeft: "12px",
                  margin: "8px 0",
                  color: "#52525b",
                }}
                {...props}
              >
                {children}
              </blockquote>
            ),
            hr: (props) => (
              <hr style={{ border: "none", borderTop: "1px solid #e4e4e7", margin: "16px 0" }} {...props} />
            ),
            a: ({ children, href, ...props }) => (
              <a href={href} style={{ color: "#2563eb", textDecoration: "underline" }} {...props}>
                {children}
              </a>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>

      <button
        onClick={() => setShowRaw(!showRaw)}
        style={{
          marginTop: "12px",
          background: "none",
          border: "1px solid #d4d4d8",
          borderRadius: "6px",
          padding: "6px 14px",
          cursor: "pointer",
          fontSize: "0.85rem",
          color: "#52525b",
        }}
      >
        {showRaw ? "Ocultar Markdown original" : "Ver Markdown original"}
      </button>

      {showRaw && (
        <pre
          style={{
            marginTop: "12px",
            padding: "16px",
            background: "#f4f4f5",
            border: "1px solid #e4e4e7",
            borderRadius: "8px",
            fontSize: "0.8rem",
            overflow: "auto",
            whiteSpace: "pre-wrap",
            maxHeight: 400,
          }}
        >
          {content}
        </pre>
      )}
    </div>
  );
}