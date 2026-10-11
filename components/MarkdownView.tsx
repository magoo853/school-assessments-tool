/**
 * Tiny markdown renderer (~60 lines): headings, bold, lists, tables, hr.
 * No dependencies. Handles the flat markdown this app generates.
 * Shared by the report view, the print view, and the share-HTML builder.
 */
"use client";

import React from "react";

export function inlineMd(text: string, key: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
      <strong key={`${key}-${i}`}>{p.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={`${key}-${i}`}>{p}</React.Fragment>
    )
  );
}

export function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let k = 0;
  const flushPara = (buf: string[]) => {
    if (!buf.length) return;
    const key = k++;
    out.push(
      <p key={key} className="my-2 text-[15px] leading-relaxed text-gray-800">
        {inlineMd(buf.join(" "), `p${key}`)}
      </p>
    );
    buf.length = 0;
  };
  const cells = (r: string) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  let i = 0;
  let para: string[] = [];
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { flushPara(para); i++; continue; }
    if (line.startsWith("|") && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
      flushPara(para);
      const head = cells(line); i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(cells(lines[i])); i++; }
      const key = k++;
      out.push(
        <div key={key} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{head.map((h, j) => <th key={j} className="border border-gray-300 bg-gray-50 px-3 py-2 text-left font-semibold">{inlineMd(h, `th${key}${j}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} className="border border-gray-200 px-3 py-2 align-top text-gray-800">{inlineMd(c, `td${key}${ri}${ci}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      flushPara(para);
      const lvl = h[1].length, key = k++;
      const cls = lvl === 1 ? "mb-3 mt-1 text-2xl font-bold" : lvl === 2 ? "mb-2 mt-6 border-b border-gray-100 pb-1 text-xl font-bold" : lvl === 3 ? "mb-1 mt-4 text-base font-bold" : "mb-1 mt-3 text-sm font-bold";
      out.push(React.createElement(`h${lvl}`, { key, className: cls }, inlineMd(h[2], `h${key}`)));
      i++; continue;
    }
    if (/^---+$/.test(line)) { flushPara(para); out.push(<hr key={k++} className="my-4 border-gray-200" />); i++; continue; }
    const ulm = line.match(/^[-*]\s+(.*)/);
    const olm = line.match(/^\d+[.)]\s+(.*)/);
    if (ulm || olm) {
      flushPara(para);
      const ordered = !!olm, items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(ordered ? /^\d+[.)]\s+(.*)/ : /^[-*]\s+(.*)/);
        if (!m) break;
        items.push(m[1]); i++;
      }
      const key = k++;
      const Tag = ordered ? "ol" : "ul";
      out.push(React.createElement(Tag, { key, className: `${ordered ? "list-decimal" : "list-disc"} my-2 space-y-1.5 pl-6 text-[15px] leading-relaxed text-gray-800` },
        items.map((it, j) => <li key={j}>{inlineMd(it, `l${key}${j}`)}</li>)));
      continue;
    }
    para.push(line); i++;
  }
  flushPara(para);
  return <div>{out}</div>;
}

/* ── Minimal HTML-string renderer for the self-contained share file.
 * Mirrors renderMarkdown above but emits an HTML string with inline styles. ── */

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineHtml(text: string): string {
  return escHtml(text).replace(
    /\*\*([^*]+)\*\*/g,
    "<strong>$1</strong>"
  );
}

export function renderMarkdownHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  const flushPara = (buf: string[]) => {
    if (!buf.length) return;
    out.push(`<p>${inlineHtml(buf.join(" "))}</p>`);
    buf.length = 0;
  };
  const cells = (r: string) =>
    r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  let i = 0;
  let para: string[] = [];
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { flushPara(para); i++; continue; }
    if (
      line.startsWith("|") &&
      i + 1 < lines.length &&
      /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())
    ) {
      flushPara(para);
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(cells(lines[i]));
        i++;
      }
      out.push(
        `<table><thead><tr>${head.map((h) => `<th>${inlineHtml(h)}</th>`).join("")}</tr></thead>` +
          `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inlineHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
      );
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      flushPara(para);
      out.push(`<h${h[1].length}>${inlineHtml(h[2])}</h${h[1].length}>`);
      i++;
      continue;
    }
    if (/^---+$/.test(line)) {
      flushPara(para);
      out.push("<hr/>");
      i++;
      continue;
    }
    const ulm = line.match(/^[-*]\s+(.*)/);
    const olm = line.match(/^\d+[.)]\s+(.*)/);
    if (ulm || olm) {
      flushPara(para);
      const ordered = !!olm;
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i]
          .trim()
          .match(ordered ? /^\d+[.)]\s+(.*)/ : /^[-*]\s+(.*)/);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      out.push(
        ordered
          ? `<ol>${items.map((it) => `<li>${inlineHtml(it)}</li>`).join("")}</ol>`
          : `<ul>${items.map((it) => `<li>${inlineHtml(it)}</li>`).join("")}</ul>`
      );
      continue;
    }
    para.push(line);
    i++;
  }
  flushPara(para);
  return out.join("\n");
}
