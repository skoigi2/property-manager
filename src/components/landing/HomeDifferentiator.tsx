import { X, Check } from "lucide-react";

const TRADITIONAL = ["Stores tenant records", "Stores maintenance requests", "Stores invoices", "Stores documents"];
const GROUNDWORK = ["Tracks accountability", "Highlights priorities", "Manages approvals", "Monitors deadlines", "Keeps work moving forward"];

export function HomeDifferentiator() {
  return (
    <section className="py-24 px-6 bg-cream-dark dark:bg-[#091525]">
      <div className="max-w-4xl mx-auto">
        <h2 className="font-display text-3xl md:text-4xl text-header dark:text-white leading-tight text-center max-w-2xl mx-auto mb-12">
          Most property software stores information.{" "}
          <span className="text-gold">GroundWorkPM manages work.</span>
        </h2>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Traditional */}
          <div className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-7">
            <p className="text-xs font-sans font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-5">
              Traditional property software
            </p>
            <ul className="space-y-3">
              {TRADITIONAL.map((t) => (
                <li key={t} className="flex items-center gap-3 text-sm font-sans text-gray-500 dark:text-gray-400">
                  <X size={16} className="text-gray-300 dark:text-gray-600 shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* GroundWorkPM */}
          <div className="bg-header dark:bg-gold/10 border border-header dark:border-gold/30 rounded-2xl p-7">
            <p className="text-xs font-sans font-semibold uppercase tracking-wide text-gold mb-5">
              GroundWorkPM
            </p>
            <ul className="space-y-3">
              {GROUNDWORK.map((t) => (
                <li key={t} className="flex items-center gap-3 text-sm font-sans text-white dark:text-gray-100">
                  <Check size={16} className="text-gold shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-center text-gray-500 dark:text-gray-400 font-sans text-base leading-relaxed max-w-xl mx-auto mt-10">
          Success isn&apos;t about how much information you have — it&apos;s whether the right people take the right action at the right time.
        </p>
        <p className="text-center text-xs font-sans text-gray-400 dark:text-gray-500 mt-5">
          Built for property management companies, portfolio managers and multi-property landlords.
        </p>
      </div>
    </section>
  );
}
