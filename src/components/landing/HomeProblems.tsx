import { MessageSquare, Table2, Hourglass } from "lucide-react";

const PROBLEMS = [
  {
    icon: MessageSquare,
    title: "WhatsApp chaos",
    body: "Tenant requests, owner approvals and contractor updates scattered across dozens of conversations.",
  },
  {
    icon: Table2,
    title: "Spreadsheet chaos",
    body: "Rent, renewals and tasks live in separate sheets that go out of date — and nobody knows which version is right.",
  },
  {
    icon: Hourglass,
    title: "Approval bottlenecks",
    body: "Work stalls because nobody knows who owns the next step.",
  },
];

export function HomeProblems() {
  return (
    <section className="py-24 px-6 bg-cream-dark dark:bg-[#091525]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center max-w-xl mx-auto mb-14">
          <h2 className="font-display text-3xl md:text-4xl text-header dark:text-white leading-tight mb-4">
            Property management gets messy fast.
          </h2>
          <p className="text-gray-500 dark:text-gray-400 font-sans text-base leading-relaxed">
            As portfolios grow, information scatters — and the result is delays, missed follow-ups and constant firefighting.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {PROBLEMS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-7"
            >
              <div className="w-11 h-11 rounded-xl bg-gold/10 dark:bg-gold/15 flex items-center justify-center mb-5">
                <Icon size={20} className="text-gold-dark" />
              </div>
              <h3 className="font-display text-lg text-header dark:text-white mb-2">{title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-sans leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
