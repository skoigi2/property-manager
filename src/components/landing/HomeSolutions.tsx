import { Inbox, Briefcase, BellRing, FileText } from "lucide-react";

const FEATURES = [
  {
    icon: Inbox,
    title: "Operational Inbox",
    body: "Overdue invoices, expiring leases, maintenance and approvals in one prioritized view.",
  },
  {
    icon: Briefcase,
    title: "Case Management",
    body: "Track maintenance, renewals and arrears end to end — every update stays on the issue.",
  },
  {
    icon: BellRing,
    title: "Automated Monitoring",
    body: "Automatic alerts for lease expiries, overdue rent, insurance and urgent maintenance.",
  },
  {
    icon: FileText,
    title: "Owner Reporting",
    body: "Generate statements from live operational data — no manual gathering.",
  },
];

export function HomeSolutions() {
  return (
    <section id="outcomes" className="py-24 px-6 scroll-mt-20">
      <div className="max-w-5xl mx-auto">
        <div className="text-center max-w-xl mx-auto mb-14">
          <h2 className=" text-h1 text-header dark:text-white mb-4">
            One place to run your property operations.
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-body-lg ">
            Built around the workflows property managers do every day — not just storing information, but moving work forward.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="flex gap-4 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-7"
            >
              <div className="w-11 h-11 shrink-0 rounded-xl bg-gold/10 dark:bg-gold/15 flex items-center justify-center">
                <Icon size={20} className="text-gold-dark" />
              </div>
              <div>
                <h3 className=" text-h3 text-header dark:text-white mb-1.5">{title}</h3>
                <p className="text-body text-gray-500 dark:text-gray-400 ">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
