"use client";

import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface ComposerInitial {
  to?: string;
  subject?: string;
  body?: string;
  replyTo?: string;
  inReplyToId?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  initial?: ComposerInitial;
}

export function EmailComposer({ open, onClose, onSent, initial }: Props) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTo(initial?.to ?? "");
      setSubject(initial?.subject ?? "");
      setReplyTo(initial?.replyTo ?? "support@groundworkpm.com");
      setBody(initial?.body ?? "");
    }
  }, [open, initial]);

  async function submit() {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      toast.error("To, subject, and body are required");
      return;
    }
    setSubmitting(true);
    try {
      const bodyHtml = `<div style="font-family: sans-serif; color:#1a1a2e; font-size:14px; line-height:1.6; white-space: pre-wrap;">${escapeHtml(body)}</div>`;
      const res = await fetch("/api/admin/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim(),
          bodyHtml,
          replyTo: replyTo.trim() || undefined,
          inReplyToId: initial?.inReplyToId ?? undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Send failed");
      }
      toast.success("Email sent");
      onSent();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial?.inReplyToId ? "Reply" : "New email"} size="xl">
      <div className="flex flex-col gap-3">
        <Input label="To" value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com" />
        <Input label="Reply-To" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="support@groundworkpm.com" />
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-600 font-sans">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
            placeholder="Write your message…"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Sending…" : "Send"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
