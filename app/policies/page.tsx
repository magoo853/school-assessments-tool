"use client";

import { useEffect, useMemo, useState } from "react";
import { db, uid } from "@/lib/store";
import type { PolicyDoc } from "@/lib/store";
import { useMode } from "@/lib/mode";
import { Card, PageHeader, Btn, Badge, Field, inputCls, EmptyState, Modal } from "@/components/ui";
import ProdNotice from "@/components/ProdNotice";

type Draft = {
  id: string;
  title: string;
  category: string;
  body: string;
};

export default function PoliciesPage() {
  const [mode] = useMode();
  const [docs, setDocs] = useState<PolicyDoc[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ id: "", title: "", category: "", body: "" });

  const refresh = () => {
    setDocs(
      db.policyDocs
        .list()
        .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title))
    );
  };

  useEffect(refresh, []);

  const grouped = useMemo(() => {
    const m = new Map<string, PolicyDoc[]>();
    docs.forEach((d) => {
      const key = d.category.trim() || "Uncategorized";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(d);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [docs]);

  const openDoc = (d: PolicyDoc) => {
    setDraft({ id: d.id, title: d.title, category: d.category, body: d.body });
    setOpenId(d.id);
  };

  const startNew = () => {
    setDraft({ id: uid("pdoc"), title: "", category: "", body: "" });
    setShowNew(true);
  };

  const save = () => {
    if (!draft.title.trim()) return;
    const now = new Date().toISOString();
    db.policyDocs.upsert({
      id: draft.id,
      title: draft.title.trim(),
      category: draft.category.trim() || "Uncategorized",
      body: draft.body,
      updatedAt: now,
    });
    setShowNew(false);
    setOpenId(null);
    refresh();
  };

  const remove = (id: string) => {
    db.policyDocs.remove(id);
    setConfirmDeleteId(null);
    setOpenId(null);
    refresh();
  };

  const downloadMd = (d: Draft) => {
    const md = `# ${d.title}\n\n${d.body}\n`;
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const activeDoc = openId ? docs.find((d) => d.id === openId) : null;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <PageHeader
        title="Policy Docs library"
        subtitle="Markdown policy documents, grouped by category. Starter templates are seeded in demo mode."
        actions={mode === "demo" ? <Btn onClick={startNew}>+ New doc</Btn> : undefined}
      />
      {mode === "prod" && <ProdNotice />}

      {docs.length === 0 ? (
        <EmptyState
          title="No policy documents yet"
          body={
            mode === "prod"
              ? "Tables are empty in PROD mode — switch to DEMO to browse the starter templates."
              : "Policy documents (EOP, visitor management, timely warning, and more) will appear here."
          }
          action={mode === "demo" ? <Btn onClick={startNew}>+ New doc</Btn> : undefined}
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(([category, list]) => (
            <Card key={category}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold">{category}</h2>
                <Badge tone="gray">{list.length}</Badge>
              </div>
              <div className="divide-y divide-gray-100">
                {list.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => openDoc(d)}
                    className="flex min-h-[44px] w-full items-center justify-between gap-2 py-2.5 text-left hover:bg-gray-50"
                  >
                    <span className="text-sm font-medium">{d.title}</span>
                    <span className="shrink-0 text-xs text-gray-400">
                      Updated {d.updatedAt.slice(0, 10)}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* viewer / editor */}
      {activeDoc && openId && (
        <Modal title={activeDoc.title} onClose={() => setOpenId(null)}>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title">
                <input
                  className={inputCls}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </Field>
              <Field label="Category">
                <input
                  className={inputCls}
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  placeholder="e.g. Emergency operations"
                />
              </Field>
            </div>
            <Field label="Body (markdown)">
              <textarea
                className={`${inputCls} min-h-[320px] font-mono text-[13px] leading-relaxed`}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </Field>
            <div className="flex flex-wrap justify-between gap-2">
              <Btn variant="danger" onClick={() => setConfirmDeleteId(openId)}>
                Delete
              </Btn>
              <div className="flex flex-wrap gap-2">
                <Btn variant="ghost" onClick={() => setOpenId(null)}>
                  Cancel
                </Btn>
                <Btn variant="ghost" onClick={() => downloadMd(draft)}>
                  Download .md
                </Btn>
                <Btn onClick={save} disabled={!draft.title.trim()}>
                  Save
                </Btn>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* new doc */}
      {showNew && (
        <Modal title="New policy document" onClose={() => setShowNew(false)}>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title">
                <input
                  className={inputCls}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="e.g. Emergency Operations Plan"
                />
              </Field>
              <Field label="Category">
                <input
                  className={inputCls}
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  placeholder="e.g. Emergency operations"
                />
              </Field>
            </div>
            <Field label="Body (markdown)">
              <textarea
                className={`${inputCls} min-h-[320px] font-mono text-[13px] leading-relaxed`}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder={"# Heading\n\nPolicy text in markdown…"}
              />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Btn variant="ghost" onClick={() => setShowNew(false)}>
                Cancel
              </Btn>
              <Btn onClick={save} disabled={!draft.title.trim()}>
                Create doc
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* delete confirm */}
      {confirmDeleteId && (
        <Modal title="Delete this document?" onClose={() => setConfirmDeleteId(null)}>
          <p className="text-sm text-gray-700">
            This permanently deletes the policy document. This cannot be undone.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Btn variant="ghost" onClick={() => setConfirmDeleteId(null)}>
              Cancel
            </Btn>
            <Btn variant="danger" onClick={() => remove(confirmDeleteId)}>
              Delete permanently
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
