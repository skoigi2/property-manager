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
  ChevronRight,
} from "lucide-react";
import { clsx } from "clsx";
import type { InboxItem, InboxType } from "@/lib/inbox";

const TYPE_ICON: Record<InboxType, React.ElementType> = {
  INVOICE_OVERDUE: Receipt,
  LEASE_EXPIRY: CalendarClock,
  URGENT_MAINTENANCE: Wrench,
  PORTAL_REQUEST: MessageSquare,
  COMPLIANCE_EXPIRY: ShieldCheck,
  INSURANCE_EXPIRY: ShieldPlus,
  ARREARS_ESCALATION: AlertTriangle,
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

export function InboxRowCard({ item }: { item: InboxItem }) {
  const s = severityStyles(item.severity);
  const Icon = TYPE_ICON[item.type];
  const pill = duePill(item);
  return (
    <Link
      href={item.href}
      className={clsx(
        "flex items-start gap-3 p-4 rounded-xl border bg-white shadow-card hover:shadow-card-hover transition-shadow",
        s.border,
      )}
    >
      <div className={clsx("shrink-0 w-9 h-9 rounded-lg flex items-center justify-center", s.iconBg)}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-sans font-semibold text-sm text-header truncate">{item.title}</p>
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
      <ChevronRight size={14} className="text-gray-300 shrink-0 mt-2" />
    </Link>
  );
}

export function InboxTableRow({ item }: { item: InboxItem }) {
  const s = severityStyles(item.severity);
  const Icon = TYPE_ICON[item.type];
  const pill = duePill(item);
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50/50">
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
        {item.actions.map((a) => (
          <Link
            key={a.label}
            href={a.action}
            className="inline-flex items-center text-xs font-sans font-medium text-gold hover:text-gold-dark px-2 py-1 rounded"
          >
            {a.label}
            <ChevronRight size={12} className="ml-0.5" />
          </Link>
        ))}
      </td>
    </tr>
  );
}
