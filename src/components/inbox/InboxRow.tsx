"use client";

import Link from "next/link";
import {
  Receipt,
  CalendarClock,
  Wrench,
  MessageSquare,
  ShieldCheck,
  ShieldPlus,
  AlertTriangle,
  Briefcase,
  ShieldQuestion,
} from "lucide-react";
import { clsx } from "clsx";
import type { InboxItem, InboxType } from "@/lib/inbox";
import { InboxActions } from "./InboxActions";

const TYPE_ICON: Record<InboxType, React.ElementType> = {
  INVOICE_OVERDUE: Receipt,
  LEASE_EXPIRY: CalendarClock,
  URGENT_MAINTENANCE: Wrench,
  PORTAL_REQUEST: MessageSquare,
  COMPLIANCE_EXPIRY: ShieldCheck,
  INSURANCE_EXPIRY: ShieldPlus,
  ARREARS_ESCALATION: AlertTriangle,
  CASE_NEEDS_ATTENTION: Briefcase,
  APPROVAL_PENDING: ShieldQuestion,
};

function severityStyles(severity: InboxItem["severity"]) {
  if (severity === "URGENT") {
    return {
      iconBg: "bg-red-100 text-red-600",
      border: "border-red-200",
      pill: "bg-red-100 text-red-700",
    };
  }
  if (severity === "WARNING") {
    return {
      iconBg: "bg-amber-100 text-amber-700",
      border: "border-amber-200",
      pill: "bg-amber-100 text-amber-700",
    };
  }
  return {
    iconBg: "bg-blue-100 text-blue-700",
    border: "border-blue-200",
    pill: "bg-blue-100 text-blue-700",
  };
}

function duePill(item: InboxItem): string | null {
  if (item.daysOverdue === null) return null;
  if (item.daysOverdue > 0) return `${item.daysOverdue}d overdue`;
  if (item.daysOverdue === 0) return "Due today";
  return `In ${-item.daysOverdue}d`;
}

interface RowProps {
  item: InboxItem;
  selected: boolean;
  onToggleSelected: () => void;
  onActionComplete: (itemId: string) => void;
}

export function InboxRowCard({ item, selected, onToggleSelected, onActionComplete }: RowProps) {
  const s = severityStyles(item.severity);
  const Icon = TYPE_ICON[item.type];
  const pill = duePill(item);
  return (
    <div
      className={clsx(
        "flex items-start gap-3 p-4 rounded-xl border bg-white shadow-card transition-shadow",
        s.border,
        selected && "ring-2 ring-gold",
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelected}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-gold focus:ring-gold/40"
        aria-label="Select item"
      />
      <div className={clsx("shrink-0 w-9 h-9 rounded-lg flex items-center justify-center", s.iconBg)}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-sans font-semibold text-sm text-header">{item.title}</p>
        <p className="text-xs text-gray-500 font-sans mt-0.5 leading-snug">{item.subtitle}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="inline-flex items-center text-[10px] font-medium font-sans px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
            {item.propertyName}
          </span>
          {pill && (
            <span className={clsx("inline-flex items-center text-[10px] font-medium font-sans px-2 py-0.5 rounded-full", s.pill)}>
              {pill}
            </span>
          )}
        </div>
      </div>
      <InboxActions item={item} onActionComplete={onActionComplete} />
    </div>
  );
}

export function InboxTableRow({ item, selected, onToggleSelected, onActionComplete }: RowProps) {
  const s = severityStyles(item.severity);
  const Icon = TYPE_ICON[item.type];
  const pill = duePill(item);
  return (
    <tr className={clsx("border-b border-gray-100 hover:bg-gray-50/50", selected && "bg-gold/5")}>
      <td className="px-4 py-3 w-8">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelected}
          className="h-4 w-4 rounded border-gray-300 text-gold focus:ring-gold/40"
          aria-label="Select item"
        />
      </td>
      <td className="px-4 py-3">
        <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center", s.iconBg)}>
          <Icon size={16} />
        </div>
      </td>
      <td className="px-4 py-3">
        <p className="font-sans font-medium text-sm text-header">{item.title}</p>
        <p className="text-xs text-gray-500 font-sans mt-0.5">{item.subtitle}</p>
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center text-xs font-medium font-sans px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
          {item.propertyName}
        </span>
      </td>
      <td className="px-4 py-3">
        {pill && (
          <span className={clsx("inline-flex items-center text-xs font-medium font-sans px-2 py-0.5 rounded-full", s.pill)}>
            {pill}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <InboxActions item={item} onActionComplete={onActionComplete} />
      </td>
    </tr>
  );
}
